import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, x-webhook-signature",
};

// ---------------------------------------------------------------------------
// Suppression helper
// ---------------------------------------------------------------------------
async function suppress(email: string, reason: string, campaignId?: string) {
  await supabase.from("email_suppressions").upsert(
    { email: email.toLowerCase(), reason, campaign_id: campaignId ?? null },
    { onConflict: "email", ignoreDuplicates: false }
  );
}

// ---------------------------------------------------------------------------
// campaign_send_log helpers
// ---------------------------------------------------------------------------
async function markBounced(trackingId: string, bounceType: string) {
  await supabase
    .from("campaign_send_log")
    .update({ status: "bounced", bounce_type: bounceType })
    .eq("tracking_id", trackingId);
}

async function markComplained(trackingId: string) {
  await supabase
    .from("campaign_send_log")
    .update({ status: "complained", complaint_at: new Date().toISOString() })
    .eq("tracking_id", trackingId);
}

async function markOpened(trackingId: string) {
  const { data } = await supabase
    .from("campaign_send_log")
    .select("id, opened_at")
    .eq("tracking_id", trackingId)
    .maybeSingle();
  if (data && !data.opened_at) {
    await supabase
      .from("campaign_send_log")
      .update({ status: "opened", opened_at: new Date().toISOString() })
      .eq("tracking_id", trackingId);
  }
}

async function markClicked(trackingId: string) {
  const { data } = await supabase
    .from("campaign_send_log")
    .select("id, clicked_at")
    .eq("tracking_id", trackingId)
    .maybeSingle();
  if (data && !data.clicked_at) {
    await supabase
      .from("campaign_send_log")
      .update({ status: "clicked", clicked_at: new Date().toISOString() })
      .eq("tracking_id", trackingId);
  }
}

// ---------------------------------------------------------------------------
// Update campaign stats after any delivery event
// ---------------------------------------------------------------------------
async function updateCampaignStats(campaignId: string) {
  const { data: rows } = await supabase
    .from("campaign_send_log")
    .select("status, opened_at, clicked_at, bounce_type, complaint_at")
    .eq("campaign_id", campaignId);

  if (!rows) return;

  const stats = {
    sent: rows.filter((r) => r.status !== "failed").length,
    opened: rows.filter((r) => r.opened_at).length,
    clicked: rows.filter((r) => r.clicked_at).length,
    bounced: rows.filter((r) => r.status === "bounced").length,
    complained: rows.filter((r) => r.complaint_at).length,
    failed: rows.filter((r) => r.status === "failed").length,
  };

  await supabase
    .from("campaigns")
    .update({ stats })
    .eq("id", campaignId);
}

// ---------------------------------------------------------------------------
// Get campaign_id from tracking_id
// ---------------------------------------------------------------------------
async function getCampaignId(trackingId: string): Promise<string | null> {
  const { data } = await supabase
    .from("campaign_send_log")
    .select("campaign_id")
    .eq("tracking_id", trackingId)
    .maybeSingle();
  return data?.campaign_id ?? null;
}

// ---------------------------------------------------------------------------
// Resend webhook handler
// Docs: https://resend.com/docs/dashboard/webhooks/event-types
// ---------------------------------------------------------------------------
async function handleResend(events: unknown[]) {
  for (const event of events) {
    const e = event as Record<string, unknown>;
    const type = e.type as string;
    const data = (e.data ?? {}) as Record<string, unknown>;
    const trackingId = (data.tags as Record<string, string> | undefined)?.tracking_id;
    const email = data.to as string | undefined;

    if (!trackingId) continue;

    if (type === "email.bounced") {
      const bounceType = (data.bounce as Record<string, string> | undefined)?.type === "permanent"
        ? "hard_bounce"
        : "soft_bounce";
      await markBounced(trackingId, bounceType);
      if (email && bounceType === "hard_bounce") {
        const cid = await getCampaignId(trackingId);
        await suppress(email, "hard_bounce", cid ?? undefined);
      }
      if (trackingId) {
        const cid = await getCampaignId(trackingId);
        if (cid) await updateCampaignStats(cid);
      }
    } else if (type === "email.complained") {
      await markComplained(trackingId);
      if (email) {
        const cid = await getCampaignId(trackingId);
        await suppress(email, "complaint", cid ?? undefined);
        if (cid) await updateCampaignStats(cid);
      }
    } else if (type === "email.opened") {
      await markOpened(trackingId);
      const cid = await getCampaignId(trackingId);
      if (cid) await updateCampaignStats(cid);
    } else if (type === "email.clicked") {
      await markClicked(trackingId);
      const cid = await getCampaignId(trackingId);
      if (cid) await updateCampaignStats(cid);
    }
  }
}

// ---------------------------------------------------------------------------
// SendGrid webhook handler
// Docs: https://docs.sendgrid.com/for-developers/tracking-events/event
// SendGrid sends an array of event objects at the root level.
// ---------------------------------------------------------------------------
async function handleSendGrid(events: unknown[]) {
  for (const event of events) {
    const e = event as Record<string, unknown>;
    const type = e.event as string;
    const email = e.email as string | undefined;
    const trackingId = e.tracking_id as string | undefined; // custom arg we pass

    if (!trackingId) continue;

    if (type === "bounce") {
      // SendGrid bounce types: "bounce" (hard), "blocked" (soft)
      const bounceType = (e.type as string) === "bounce" ? "hard_bounce" : "soft_bounce";
      await markBounced(trackingId, bounceType);
      if (email && bounceType === "hard_bounce") {
        const cid = await getCampaignId(trackingId);
        await suppress(email, "hard_bounce", cid ?? undefined);
      }
      const cid = await getCampaignId(trackingId);
      if (cid) await updateCampaignStats(cid);
    } else if (type === "spamreport") {
      await markComplained(trackingId);
      if (email) {
        const cid = await getCampaignId(trackingId);
        await suppress(email, "complaint", cid ?? undefined);
        if (cid) await updateCampaignStats(cid);
      }
    } else if (type === "open") {
      await markOpened(trackingId);
      const cid = await getCampaignId(trackingId);
      if (cid) await updateCampaignStats(cid);
    } else if (type === "click") {
      await markClicked(trackingId);
      const cid = await getCampaignId(trackingId);
      if (cid) await updateCampaignStats(cid);
    }
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // Detect provider by payload shape:
    // - Resend wraps each event as { type: "email.*", data: {...} }
    // - SendGrid sends a flat array of { event: "bounce"|"open"|... }
    const isResend = Array.isArray(body)
      ? (body[0] as Record<string, unknown>)?.type?.toString().startsWith("email.")
      : (body as Record<string, unknown>)?.type?.toString().startsWith("email.");

    const events: unknown[] = Array.isArray(body) ? body : [body];

    if (isResend) {
      await handleResend(events);
    } else {
      await handleSendGrid(events);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("email-webhook error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
