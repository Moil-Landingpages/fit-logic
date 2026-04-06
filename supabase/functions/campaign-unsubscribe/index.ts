import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const trackingId = url.searchParams.get("t");

  if (!trackingId) {
    return new Response(unsubPage("Missing tracking information.", false), {
      headers: { "Content-Type": "text/html" },
      status: 400,
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Look up the tracking record to find the email
    const { data: log } = await supabase
      .from("campaign_send_log")
      .select("recipient_id, campaign_id")
      .eq("tracking_id", trackingId)
      .single();

    if (!log) {
      return new Response(unsubPage("Invalid or expired link.", false), {
        headers: { "Content-Type": "text/html" },
        status: 404,
      });
    }

    // Get recipient email
    const { data: recipient } = await supabase
      .from("campaign_recipients")
      .select("email")
      .eq("id", log.recipient_id)
      .single();

    if (!recipient?.email) {
      return new Response(unsubPage("Recipient not found.", false), {
        headers: { "Content-Type": "text/html" },
        status: 404,
      });
    }

    // Add to unsubscribe list (upsert to handle duplicates)
    await supabase.from("campaign_unsubscribes").upsert(
      { email: recipient.email.toLowerCase(), campaign_id: log.campaign_id },
      { onConflict: "email" }
    );

    // Mark recipient as skipped only within this campaign
    // (Global unsubscribe list prevents future sends; we don't retroactively
    //  cancel other active campaigns the user may still want.)
    await supabase
      .from("campaign_recipients")
      .update({ status: "skipped", last_error: "Unsubscribed" })
      .eq("email", recipient.email)
      .eq("campaign_id", log.campaign_id)
      .eq("status", "pending");

    return new Response(
      unsubPage("You've been successfully unsubscribed. You will no longer receive emails from this campaign.", true),
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (error) {
    console.error("campaign-unsubscribe error:", error);
    return new Response(
      unsubPage("Something went wrong. Please try again later.", false),
      { headers: { "Content-Type": "text/html" }, status: 500 }
    );
  }
});

function unsubPage(message: string, success: boolean): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${success ? "Unsubscribed" : "Error"}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #f9fafb; color: #374151; }
    .card { background: white; border-radius: 12px; padding: 48px; max-width: 480px; text-align: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 24px; margin-bottom: 12px; color: ${success ? "#059669" : "#dc2626"}; }
    p { color: #6b7280; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${success ? "✅" : "⚠️"}</div>
    <h1>${success ? "Unsubscribed" : "Oops"}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}
