import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const SECRET_KEY = process.env.SECRET_KEY!;

/**
 * Browser / client-side Supabase client.
 * Uses the publishable (anon) key — safe to expose in the browser.
 * Import this in client components and contexts.
 */
export const browserClient = createClient<Database>(SUPABASE_URL, PUBLISHABLE_KEY, {
  auth: {
    storage: typeof window !== "undefined" ? localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
  },
});

/**
 * Server-side admin Supabase client.
 * Uses the secret key — ONLY use in Next.js API routes (app/api/**).
 * Never import this in client components.
 */
export function serverClient() {
  return createClient<Database>(SUPABASE_URL, SECRET_KEY);
}
