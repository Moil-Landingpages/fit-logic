import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const clientId     = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    return json({ error: "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in Supabase secrets" }, 500);
  }

  try {
    const { code, redirect_uri } = await req.json() as { code: string; redirect_uri: string };

    if (!code || !redirect_uri) {
      return json({ error: "Missing required fields: code, redirect_uri" }, 400);
    }

    // ── Exchange authorization code for tokens ─────────────────────────────
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri,
        grant_type:    "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error("Google token exchange failed:", err);
      return json({ error: "Token exchange failed", detail: err }, 400);
    }

    const tokens = await tokenRes.json() as {
      access_token:  string;
      refresh_token?: string;
      expires_in:    number;
      scope:         string;
      token_type:    string;
    };

    // ── Derive expiry timestamp ────────────────────────────────────────────
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const tokenPayload = {
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      expires_at:    expiresAt,
      scope:         tokens.scope,
    };

    // ── Determine which services were granted ──────────────────────────────
    const scopes = tokens.scope ?? "";
    const hasCalendar = scopes.includes("calendar");
    const hasGmail    = scopes.includes("gmail");

    // ── Persist tokens to practice_settings (singleton row) ───────────────
    const updates: Record<string, unknown> = {};
    if (hasCalendar) updates.google_calendar_token = tokenPayload;
    if (hasGmail)    updates.google_gmail_token    = tokenPayload;

    if (Object.keys(updates).length === 0) {
      return json({ error: "No recognized Google scopes were granted" }, 400);
    }

    // Get the singleton settings row id
    const { data: settingsRow, error: fetchErr } = await supabase
      .from("practice_settings")
      .select("id")
      .limit(1)
      .single();

    if (fetchErr || !settingsRow) {
      return json({ error: "practice_settings row not found" }, 500);
    }

    const { error: updateErr } = await supabase
      .from("practice_settings")
      .update(updates)
      .eq("id", settingsRow.id);

    if (updateErr) {
      console.error("Failed to persist tokens:", updateErr);
      return json({ error: updateErr.message }, 500);
    }

    return json({
      success: true,
      connected: {
        calendar: hasCalendar,
        gmail:    hasGmail,
      },
    });
  } catch (err) {
    console.error("google-oauth-callback error:", err);
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
