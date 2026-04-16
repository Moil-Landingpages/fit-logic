import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Google token refresh
// ---------------------------------------------------------------------------
async function refreshGoogleToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<{ access_token: string; expires_at: string }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google token refresh failed: ${err}`);
  }
  const data = await res.json();
  return {
    access_token: data.access_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Gmail API helpers
// ---------------------------------------------------------------------------
interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  payload: {
    headers: { name: string; value: string }[];
    parts?: { mimeType: string; body: { data?: string } }[];
    body?: { data?: string };
    mimeType: string;
  };
  internalDate: string;
}

function getHeader(msg: GmailMessage, name: string): string {
  return (
    msg.payload.headers.find(
      (h) => h.name.toLowerCase() === name.toLowerCase(),
    )?.value ?? ""
  );
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return atob(base64);
  } catch {
    return "";
  }
}

function extractBody(
  msg: GmailMessage,
): { text: string; html: string } {
  let text = "";
  let html = "";

  const parts = msg.payload.parts ?? [];

  // Flat message (no parts)
  if (parts.length === 0 && msg.payload.body?.data) {
    const decoded = decodeBase64Url(msg.payload.body.data);
    if (msg.payload.mimeType === "text/html") html = decoded;
    else text = decoded;
    return { text, html };
  }

  // Walk parts (one level deep — covers most messages)
  for (const part of parts) {
    if (!part.body?.data) continue;
    const decoded = decodeBase64Url(part.body.data);
    if (part.mimeType === "text/plain" && !text) text = decoded;
    if (part.mimeType === "text/html" && !html) html = decoded;
  }

  return { text, html };
}

function parseEmailAddress(
  raw: string,
): { email: string; name: string } {
  const match = raw.match(/^(.+?)\s*<(.+?)>$/);
  if (match) return { name: match[1].trim().replace(/^"|"$/g, ""), email: match[2] };
  return { name: "", email: raw.trim() };
}

// ---------------------------------------------------------------------------
// Outlook / Microsoft Graph helpers
// ---------------------------------------------------------------------------
interface OutlookMessage {
  id: string;
  conversationId: string;
  subject: string;
  bodyPreview: string;
  body: { contentType: string; content: string };
  from: { emailAddress: { name: string; address: string } };
  toRecipients: { emailAddress: { name: string; address: string } }[];
  receivedDateTime: string;
  isRead: boolean;
  categories: string[];
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({})) as {
      provider?: string;
      max_results?: number;
    };
    const provider = body.provider ?? "gmail";
    const maxResults = Math.min(body.max_results ?? 50, 100);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Fetch practice settings for tokens
    const { data: settings, error: settingsErr } = await sb
      .from("practice_settings")
      .select("id, google_gmail_token, google_calendar_token")
      .limit(1)
      .single();

    if (settingsErr || !settings) {
      return json({ error: "practice_settings not found" }, 500);
    }

    let imported = 0;
    let skipped = 0;

    // -----------------------------------------------------------------------
    // Gmail sync
    // -----------------------------------------------------------------------
    if (provider === "gmail") {
      const gmailToken = settings.google_gmail_token as {
        access_token: string;
        refresh_token?: string;
        expires_at?: string;
      } | null;

      if (!gmailToken?.access_token) {
        return json({ error: "Gmail not connected. Connect via Settings > Integrations." }, 400);
      }

      // Refresh token if expired
      let accessToken = gmailToken.access_token;
      if (gmailToken.expires_at && new Date(gmailToken.expires_at) < new Date()) {
        if (!gmailToken.refresh_token) {
          return json({ error: "Gmail token expired and no refresh token available. Please reconnect." }, 400);
        }
        const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
        const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
        const refreshed = await refreshGoogleToken(gmailToken.refresh_token, clientId, clientSecret);
        accessToken = refreshed.access_token;

        // Persist refreshed token
        await sb.from("practice_settings").update({
          google_gmail_token: {
            ...gmailToken,
            access_token: refreshed.access_token,
            expires_at: refreshed.expires_at,
          },
        }).eq("id", settings.id);
      }

      // List recent messages from INBOX
      const listRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&labelIds=INBOX`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!listRes.ok) {
        const err = await listRes.text();
        return json({ error: `Gmail list failed: ${err}` }, 400);
      }
      const listData = await listRes.json();
      const messageIds: string[] = (listData.messages ?? []).map((m: { id: string }) => m.id);

      // Fetch full message details (batch in parallel, 10 at a time)
      const batchSize = 10;
      for (let i = 0; i < messageIds.length; i += batchSize) {
        const batch = messageIds.slice(i, i + batchSize);
        const fetches = batch.map(async (msgId) => {
          const res = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          if (!res.ok) return null;
          return (await res.json()) as GmailMessage;
        });

        const messages = (await Promise.all(fetches)).filter(Boolean) as GmailMessage[];

        for (const msg of messages) {
          const from = parseEmailAddress(getHeader(msg, "From"));
          const to = getHeader(msg, "To");
          const subject = getHeader(msg, "Subject");
          const { text, html } = extractBody(msg);

          const { error: upsertErr } = await sb.from("email_messages").upsert(
            {
              provider: "gmail",
              external_id: msg.id,
              thread_id: msg.threadId,
              from_email: from.email,
              from_name: from.name,
              to_email: to,
              subject,
              snippet: msg.snippet,
              body_text: text,
              body_html: html,
              received_at: new Date(Number(msg.internalDate)).toISOString(),
              is_read: !msg.labelIds.includes("UNREAD"),
              labels: msg.labelIds,
              synced_at: new Date().toISOString(),
            },
            { onConflict: "provider,external_id", ignoreDuplicates: false },
          );

          if (upsertErr) {
            skipped++;
          } else {
            imported++;
          }
        }
      }
    }

    // -----------------------------------------------------------------------
    // Outlook sync (Microsoft Graph)
    // -----------------------------------------------------------------------
    if (provider === "outlook") {
      // Outlook token is stored similarly — future implementation.
      // For now, return a clear message that setup is needed.
      return json({
        error: "Outlook sync is not yet configured. Connect your Microsoft account in Settings > Integrations.",
      }, 400);
    }

    // Create a notification about the sync
    if (imported > 0) {
      await sb.from("notifications").insert({
        type: "sync_complete",
        title: "Email sync complete",
        message: `${imported} new email${imported === 1 ? "" : "s"} synced from ${provider}.`,
        link: "/inbox",
      });
    }

    return json({ success: true, provider, imported, skipped });
  } catch (error) {
    console.error("sync-email-inbox error:", error);
    return json(
      { error: error instanceof Error ? error.message : String(error) },
      500,
    );
  }
});
