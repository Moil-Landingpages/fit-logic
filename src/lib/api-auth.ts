import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase";

/**
 * Server-side guard for API routes called from the signed-in app.
 *
 * Verifies the Supabase access token sent as `Authorization: Bearer <jwt>`.
 * Returns a 401 response to hand straight back, or null when the caller is
 * an authenticated user. Cron routes keep their own CRON_SECRET check.
 */
export async function requireUser(req: NextRequest | Request): Promise<NextResponse | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  try {
    const { data, error } = await serverClient().auth.getUser(token);
    if (error || !data?.user) {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }
    return null;
  } catch {
    return NextResponse.json({ error: "Authentication unavailable" }, { status: 500 });
  }
}
