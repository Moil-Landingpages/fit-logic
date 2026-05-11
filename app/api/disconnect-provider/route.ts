import { NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase";

export async function POST() {
  const sb = serverClient();
  try {
    const { data: row } = await sb
      .from("practice_settings")
      .select("id")
      .limit(1)
      .maybeSingle();

    if (!row) return NextResponse.json({ success: true });

    const updates = {
      mail_provider: null,
      provider_email: null,
      provider_connected: false,
      access_token: null,
      refresh_token: null,
      token_expiry: null,
      token_scope: null,
      microsoft_tenant: null,
      // Also clear legacy Google token blobs so the UI stays consistent.
      google_calendar_token: null,
      google_gmail_token: null,
    } as Record<string, unknown>;

    const { error } = await sb.from("practice_settings").update(updates as any).eq("id", row.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Drop synced inquiries from previously connected mailboxes so the next
    // connection starts with a clean slate.
    await sb.from("inquiries").delete().in("source", ["gmail", "gmail_sent", "outlook", "outlook_sent"]);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
