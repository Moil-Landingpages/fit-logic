import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// Read from any of the common env var names. Lovable Cloud auto-managed .env uses VITE_*,
// Next.js convention is NEXT_PUBLIC_*, and Supabase Edge / serverless secrets often expose
// the bare SUPABASE_URL.
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  process.env.VITE_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  "";
const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  "";

/**
 * Browser / client-side Supabase client.
 * Lazy proxy — avoids crashing at module load during Next.js build
 * when env vars aren't yet injected for route data collection.
 */
let _browser: SupabaseClient<Database> | null = null;
function getBrowserClient(): SupabaseClient<Database> {
  if (_browser) return _browser;
  if (!SUPABASE_URL || !PUBLISHABLE_KEY) {
    throw new Error(
      "Supabase URL or publishable key is missing. Check NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or VITE_* equivalents)."
    );
  }
  _browser = createClient<Database>(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: {
      storage: typeof window !== "undefined" ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return _browser;
}

export const browserClient = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop) {
    const client = getBrowserClient();
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(client) : value;
  },
});

/**
 * Server-side admin Supabase client.
 * Uses the service role key — ONLY use in Next.js API routes (app/api/**).
 * Never import this in client components.
 */
export function serverClient(): SupabaseClient<Database> {
  const url = SUPABASE_URL;
  const secret =
    process.env.SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "";
  if (!url || !secret) {
    throw new Error(
      "Server Supabase client is missing URL or SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY."
    );
  }
  return createClient<Database>(url, secret);
}
