import { NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase";

interface GmailToken {
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
}

interface GmailMessage {
  id: string;
  threadId: string;
}

interface GmailMessageDetail {
  id: string;
  snippet: string;
  payload: {
    headers: { name: string; value: string }[];
  };
  internalDate: string;
}

function extractEmail(from: string): string {
  const match = from.match(/<(.+?)>/);
  return (match ? match[1] : from).trim().toLowerCase();
}


async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token ?? null;
}

async function getValidAccessToken(token: GmailToken): Promise<string | null> {
  const expiresAt = new Date(token.expires_at).getTime();
  if (Date.now() < expiresAt - 60_000) return token.access_token;
  if (!token.refresh_token) return null;
  return refreshAccessToken(token.refresh_token);
}

export async function POST() {
  const sb = serverClient();

  try {
    const { data: settings } = await sb
      .from("practice_settings")
      .select("google_gmail_token")
      .limit(1)
      .single();

    const rawToken = settings?.google_gmail_token as GmailToken | null;
    if (!rawToken?.access_token) {
      return NextResponse.json({ error: "Gmail not connected" }, { status: 400 });
    }

    const accessToken = await getValidAccessToken(rawToken);
    if (!accessToken) {
      return NextResponse.json({ error: "Gmail token expired and could not be refreshed" }, { status: 401 });
    }

    const [patientsRes, existingRes] = await Promise.all([
      sb.from("patients").select("id, email, first_name, last_name"),
      sb.from("inquiries").select("source_id").eq("source", "gmail"),
    ]);

    const patients = (patientsRes.data ?? []) as { id: string; email: string | null; first_name: string; last_name: string }[];
    const patientsByEmail = new Map(
      patients.filter((p) => p.email).map((p) => [p.email!.toLowerCase(), p])
    );

    const existingIds = new Set(
      ((existingRes.data ?? []) as unknown as { source_id: string | null }[]).map((i) => i.source_id)
    );

    const listRes = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&labelIds=INBOX",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!listRes.ok) {
      const err = await listRes.text();
      return NextResponse.json({ error: `Gmail list error: ${err}` }, { status: 502 });
    }

    const listData = await listRes.json() as { messages?: GmailMessage[] };
    const messages = listData.messages ?? [];
    if (!messages.length) return NextResponse.json({ synced: 0, message: "Inbox is empty" });

    const unseenIds = messages.map((m) => m.id).filter((id) => !existingIds.has(id));
    if (!unseenIds.length) return NextResponse.json({ synced: 0, message: "No new emails" });

    const BATCH = 10;
    const details: GmailMessageDetail[] = [];
    for (let i = 0; i < unseenIds.length; i += BATCH) {
      const batch = unseenIds.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map(async (id) => {
          const r = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (!r.ok) return null;
          return r.json() as Promise<GmailMessageDetail>;
        })
      );
      details.push(...(results.filter(Boolean) as GmailMessageDetail[]));
    }

    const newMessages = details.filter(Boolean) as GmailMessageDetail[];
    if (!newMessages.length) return NextResponse.json({ synced: 0, message: "No new emails" });

    const toInsert = newMessages.map((d) => {
      const headers = d.payload.headers;
      const fromHeader = headers.find((h) => h.name === "From")?.value ?? "";
      const subject = headers.find((h) => h.name === "Subject")?.value ?? "(no subject)";
      const senderEmail = extractEmail(fromHeader);
      const patient = patientsByEmail.get(senderEmail);
      const senderName = fromHeader.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || senderEmail;

      return { messageId: d.id, senderEmail, senderName, patient, subject, snippet: d.snippet };
    });

    if (!toInsert.length) {
      return NextResponse.json({ synced: 0, message: "No new emails" });
    }

    const rows = toInsert.map((e) => ({
      source: "gmail",
      source_id: e.messageId,
      patient_id: e.patient?.id ?? null,
      patient_name: e.patient ? `${e.patient.first_name} ${e.patient.last_name}`.trim() : e.senderName,
      patient_email: e.senderEmail,
      raw_content: `${e.subject}\n\n${e.snippet}`,
      status: "pending",
      category: "General_Info",
    }));

    const { error: insertErr } = await sb.from("inquiries").insert(rows as never[]);
    if (insertErr) throw insertErr;

    const contactsMatched = toInsert.filter((e) => e.patient).length;
    return NextResponse.json({ synced: rows.length, contacts_matched: contactsMatched, unknown_senders: rows.length - contactsMatched });
  } catch (err) {
    console.error("sync-gmail error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
