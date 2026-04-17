import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const trackingId = url.searchParams.get("t");

  if (!trackingId) {
    return new NextResponse(unsubPage("Missing tracking information.", false), {
      headers: { "Content-Type": "text/html" },
      status: 400,
    });
  }

  const sb = serverClient();

  try {
    const { data: log } = await sb
      .from("campaign_send_log")
      .select("recipient_id, campaign_id")
      .eq("tracking_id", trackingId)
      .single();

    if (!log) {
      return new NextResponse(unsubPage("Invalid or expired link.", false), {
        headers: { "Content-Type": "text/html" },
        status: 404,
      });
    }

    const { data: recipient } = await sb
      .from("campaign_recipients")
      .select("email")
      .eq("id", log.recipient_id)
      .single();

    if (!recipient?.email) {
      return new NextResponse(unsubPage("Recipient not found.", false), {
        headers: { "Content-Type": "text/html" },
        status: 404,
      });
    }

    await sb.from("campaign_unsubscribes").upsert(
      { email: recipient.email.toLowerCase(), campaign_id: log.campaign_id },
      { onConflict: "email" }
    );

    await sb
      .from("campaign_recipients")
      .update({ status: "skipped", last_error: "Unsubscribed" })
      .eq("email", recipient.email)
      .eq("campaign_id", log.campaign_id)
      .eq("status", "pending");

    return new NextResponse(
      unsubPage("You've been successfully unsubscribed. You will no longer receive emails from this campaign.", true),
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (error) {
    console.error("campaign-unsubscribe error:", error);
    return new NextResponse(unsubPage("Something went wrong. Please try again later.", false), {
      headers: { "Content-Type": "text/html" },
      status: 500,
    });
  }
}

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
