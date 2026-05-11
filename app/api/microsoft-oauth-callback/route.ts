import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase";
import { encryptToken } from "@/lib/providers/crypto";

const MS_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "Mail.Read",
  "Mail.Send",
  "Calendars.ReadWrite",
].join(" ");

export async function POST(req: NextRequest) {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const tenant = process.env.MICROSOFT_TENANT_ID || "common";

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET must be set" }, { status: 500 });
  }

  try {
    const { code, redirect_uri, state, expectedState } = await req.json();
    if (!code || !redirect_uri) {
      return NextResponse.json({ error: "Missing required fields: code, redirect_uri" }, { status: 400 });
    }
    if (state && expectedState && state !== expectedState) {
      return NextResponse.json({ error: "OAuth state mismatch" }, { status: 400 });
    }

    // Reject if Google is already connected — provider lock.
    const sb = serverClient();
    const { data: existingRaw } = await sb
      .from("practice_settings")
      .select("id, mail_provider, provider_connected" as any)
      .limit(1)
      .maybeSingle();
    const existing = existingRaw as { id: string; mail_provider: string | null; provider_connected: boolean | null } | null;

    if (existing?.provider_connected && existing.mail_provider === "google") {
      return NextResponse.json(
        { error: "Google is currently connected. Disconnect it before connecting Microsoft." },
        { status: 409 },
      );
    }

    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri,
        grant_type: "authorization_code",
        scope: MS_SCOPES,
      }),
    });

    if (!tokenRes.ok) {
      const detail = await tokenRes.text();
      console.error("[microsoft-oauth-callback] Token exchange failed", detail);
      return NextResponse.json({ error: "Token exchange failed", detail }, { status: 400 });
    }

    const tokens = await tokenRes.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope: string;
      id_token?: string;
    };

    // Resolve user email from Microsoft Graph.
    let userEmail: string | null = null;
    try {
      const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (meRes.ok) {
        const me = await meRes.json() as { mail?: string; userPrincipalName?: string };
        userEmail = me.mail ?? me.userPrincipalName ?? null;
      }
    } catch {}

    const updates: Record<string, unknown> = {
      mail_provider: "microsoft",
      provider_email: userEmail,
      provider_connected: true,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
      token_expiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      token_scope: tokens.scope,
      microsoft_tenant: tenant,
    };

    let settingsId: string | undefined = existing?.id;
    if (!settingsId) {
      const { data: created, error: insertErr } = await sb
        .from("practice_settings")
        .insert({ practice_name: "FitLogic Practice", ...updates } as any)
        .select("id")
        .single();
      if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
      settingsId = (created as any).id;
    } else {
      const { error: updateErr } = await sb
        .from("practice_settings")
        .update(updates as any)
        .eq("id", settingsId);
      if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // When the connected provider changes, drop previously synced inquiries
    // so the inbox reflects only the newly connected mailbox.
    await sb.from("inquiries").delete().in("source", ["gmail", "gmail_sent", "outlook", "outlook_sent"]);

    return NextResponse.json({ success: true, provider: "microsoft", email: userEmail });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unexpected error" }, { status: 500 });
  }
}
