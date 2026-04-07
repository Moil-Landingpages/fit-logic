// Shared Google OAuth token management for Supabase Edge Functions.
// Handles automatic refresh of expired tokens and persists them back to DB.

interface GoogleTokenRecord {
  access_token:  string;
  refresh_token: string | null;
  expires_at:    string;   // ISO 8601
  scope:         string;
}

/**
 * Returns a valid Google access token for `service` ("gmail" | "calendar").
 *
 * - If the stored token is still valid (>5 min remaining) it is returned as-is.
 * - If it is expired/expiring, it is refreshed via the Google OAuth2 endpoint,
 *   the new token is saved back to `practice_settings`, and returned.
 * - Returns `null` if no token is stored, the token has no refresh_token,
 *   the refresh call fails, or GOOGLE_CLIENT_ID/SECRET are not set.
 */
export async function getFreshGoogleToken(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  service: "gmail" | "calendar",
): Promise<string | null> {
  const column = service === "gmail" ? "google_gmail_token" : "google_calendar_token";

  const { data: row } = await supabase
    .from("practice_settings")
    .select(`id, ${column}`)
    .limit(1)
    .single();

  if (!row) return null;

  const token = row[column] as GoogleTokenRecord | null;
  if (!token?.access_token) return null;

  // Still valid with a 5-minute safety buffer
  const expiresAt = new Date(token.expires_at).getTime();
  if (expiresAt > Date.now() + 5 * 60 * 1000) {
    return token.access_token;
  }

  // Token is expired or about to expire — refresh it
  if (!token.refresh_token) {
    console.warn(`[google-tokens] ${service} token expired and has no refresh_token. User must reconnect Google in Settings.`);
    return null;
  }

  const clientId     = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    console.error("[google-tokens] GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in Supabase Edge Function secrets.");
    return null;
  }

  const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: token.refresh_token,
      grant_type:    "refresh_token",
    }),
  });

  if (!refreshRes.ok) {
    const body = await refreshRes.text();
    console.error(`[google-tokens] ${service} refresh failed (${refreshRes.status}): ${body}`);
    // If Google says the token is invalid/revoked, clear it so the UI shows disconnected
    if (refreshRes.status === 400 || refreshRes.status === 401) {
      await supabase
        .from("practice_settings")
        .update({ [column]: null })
        .eq("id", row.id);
    }
    return null;
  }

  const refreshData = await refreshRes.json() as {
    access_token: string;
    expires_in:   number;
  };

  const updated: GoogleTokenRecord = {
    access_token:  refreshData.access_token,
    refresh_token: token.refresh_token,   // refresh_token does not rotate
    expires_at:    new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
    scope:         token.scope,
  };

  await supabase
    .from("practice_settings")
    .update({ [column]: updated })
    .eq("id", row.id);

  console.log(`[google-tokens] ${service} token refreshed successfully`);
  return updated.access_token;
}
