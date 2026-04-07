import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// 1x1 transparent PNG pixel
const PIXEL = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0x00, 0x00, 0x00, 0x02,
  0x00, 0x01, 0xe5, 0x27, 0xde, 0xfc, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
  0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

const pixelResponse = () =>
  new Response(PIXEL, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });

/**
 * Validate that the redirect URL is an absolute http(s) URL.
 * We do NOT allow relative paths or other schemes (data:, javascript:, etc.)
 * to prevent open-redirect / XSS abuse.
 */
function isSafeUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const trackingId = url.searchParams.get("t");
  const action = url.searchParams.get("a") || "open";
  // redirectUrl from query param — validated below before use
  const rawRedirect = url.searchParams.get("url");

  if (!trackingId) {
    return new Response("Missing tracking ID", { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const now = new Date().toISOString();

    if (action === "open") {
      await supabase
        .from("campaign_send_log")
        .update({ opened_at: now, status: "opened" })
        .eq("tracking_id", trackingId)
        .is("opened_at", null);

      const { data: log } = await supabase
        .from("campaign_send_log")
        .select("recipient_id")
        .eq("tracking_id", trackingId)
        .single();

      if (log?.recipient_id) {
        await supabase
          .from("campaign_recipients")
          .update({ opened_at: now })
          .eq("id", log.recipient_id)
          .is("opened_at", null);
      }

      return pixelResponse();
    }

    if (action === "click") {
      await supabase
        .from("campaign_send_log")
        .update({ clicked_at: now, status: "clicked" })
        .eq("tracking_id", trackingId)
        .is("clicked_at", null);

      const { data: log } = await supabase
        .from("campaign_send_log")
        .select("recipient_id, clicked_url")
        .eq("tracking_id", trackingId)
        .single();

      if (log?.recipient_id) {
        await supabase
          .from("campaign_recipients")
          .update({ clicked_at: now })
          .eq("id", log.recipient_id)
          .is("clicked_at", null);
      }

      // Prefer the URL stored in the DB over the query-param URL.
      // Only fall back to the query param if it passes the safety check.
      const destination: string | null =
        (log?.clicked_url && isSafeUrl(log.clicked_url) ? log.clicked_url : null) ??
        (rawRedirect && isSafeUrl(rawRedirect) ? rawRedirect : null);

      if (destination) {
        return new Response(null, {
          status: 302,
          headers: { Location: destination },
        });
      }

      // No safe destination — just return 200
      return new Response("OK", { status: 200 });
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("track-email error:", error);
    // Degrade gracefully — don't break the user's browser
    if (action === "open") return pixelResponse();
    if (action === "click" && rawRedirect && isSafeUrl(rawRedirect)) {
      return new Response(null, { status: 302, headers: { Location: rawRedirect } });
    }
    return new Response("Error", { status: 500 });
  }
});
