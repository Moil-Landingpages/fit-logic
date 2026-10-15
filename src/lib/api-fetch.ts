import { browserClient } from "@/lib/supabase";

/** fetch() for the app's own API routes — attaches the Supabase session token. */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await browserClient.auth.getSession();
  const headers = new Headers(init.headers);
  if (data.session?.access_token) {
    headers.set("Authorization", `Bearer ${data.session.access_token}`);
  }
  return fetch(input, { ...init, headers });
}
