import { serverClient } from "@/lib/supabase";
import { decryptToken, encryptToken } from "./crypto";
import { googleProvider, refreshGoogleAccessToken } from "./google";
import { microsoftProvider, refreshMicrosoftAccessToken } from "./microsoft";
import type { MailProvider, ProviderName } from "./types";

export * from "./types";

interface SettingsRow {
  id: string;
  mail_provider: ProviderName | null;
  provider_email: string | null;
  provider_connected: boolean | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expiry: string | null;
  token_scope: string | null;
  microsoft_tenant: string | null;
}

async function loadSettings() {
  const sb = serverClient();
  const { data, error } = await sb
    .from("practice_settings")
    .select("id, mail_provider, provider_email, provider_connected, access_token, refresh_token, token_expiry, token_scope, microsoft_tenant")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return { sb, row: (data as unknown as SettingsRow | null) };
}

export async function getActiveProvider(): Promise<{ provider: MailProvider; row: SettingsRow } | null> {
  const { sb, row } = await loadSettings();
  if (!row?.provider_connected || !row.mail_provider || !row.access_token) return null;

  const refreshPlain = decryptToken(row.refresh_token);
  const expired = !row.token_expiry || new Date(row.token_expiry).getTime() <= Date.now() + 60_000;

  let accessToken = row.access_token;

  const persistRefreshed = async (newAccess: string, newRefresh: string | null, expiresIn: number) => {
    const updates: Record<string, unknown> = {
      access_token: newAccess,
      token_expiry: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
    if (newRefresh) updates.refresh_token = encryptToken(newRefresh);
    await sb.from("practice_settings").update(updates as any).eq("id", row.id);
    accessToken = newAccess;
  };

  if (row.mail_provider === "google") {
    if (expired) {
      if (!refreshPlain) return null;
      const refreshed = await refreshGoogleAccessToken(refreshPlain);
      if (!refreshed) return null;
      await persistRefreshed(refreshed.access_token, null, refreshed.expires_in);
    }
    const provider = googleProvider({
      accessToken,
      refreshAccessToken: async () => {
        if (!refreshPlain) return null;
        const r = await refreshGoogleAccessToken(refreshPlain);
        if (!r) return null;
        await persistRefreshed(r.access_token, null, r.expires_in);
        return r.access_token;
      },
    });
    return { provider, row };
  }

  // microsoft
  const tenant = row.microsoft_tenant ?? "common";
  if (expired) {
    if (!refreshPlain) return null;
    const refreshed = await refreshMicrosoftAccessToken(refreshPlain, tenant);
    if (!refreshed) return null;
    await persistRefreshed(refreshed.access_token, refreshed.refresh_token ?? null, refreshed.expires_in);
  }
  const provider = microsoftProvider({
    accessToken,
    tenant,
    refreshAccessToken: async () => {
      if (!refreshPlain) return null;
      const r = await refreshMicrosoftAccessToken(refreshPlain, tenant);
      if (!r) return null;
      await persistRefreshed(r.access_token, r.refresh_token ?? null, r.expires_in);
      return r.access_token;
    },
  });
  return { provider, row };
}
