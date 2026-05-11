import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

// Lazy — assigned inside POST handler. Do NOT call serverClient() at module top-level
// (breaks Next.js build env injection during route data collection).
let sb: SupabaseClient;

// All writes below destructure { error } and log on failure. Previously
// these were silent — a permission-denied or constraint violation in the
// suppression list (or any update) would just disappear, leading to repeat
// sends to bounced addresses and stale campaign stats.
async function suppress(email: string, reason: string, campaignId?: string) {
  const { error } = await sb.from("email_suppressions").upsert(
    { email: email.toLowerCase(), reason, campaign_id: campaignId ?? null },
    { onConflict: "email", ignoreDuplicates: false }
  );
  if (error) console.error("[email-webhook] suppress() failed", { email, reason, error: error.message });
}

async function markBounced(trackingId: string, bounceType: string) {
  const { error } = await sb.from("campaign_send_log")
    .update({ status: "bounced", bounce_type: bounceType } as never)
    .eq("tracking_id", trackingId);
  if (error) console.error("[email-webhook] markBounced() failed", { trackingId, error: error.message });
}

async function markComplained(trackingId: string) {
  const { error } = await sb.from("campaign_send_log")
    .update({ status: "complained", complaint_at: new Date().toISOString() } as never)
    .eq("tracking_id", trackingId);
  if (error) console.error("[email-webhook] markComplained() failed", { trackingId, error: error.message });
}

async function markOpened(trackingId: string) {
  const { data, error: selErr } = await sb.from("campaign_send_log")
    .select("id, opened_at").eq("tracking_id", trackingId).maybeSingle();
  if (selErr) {
    console.error("[email-webhook] markOpened SELECT failed", { trackingId, error: selErr.message });
    return;
  }
  if (data && !data.opened_at) {
    const { error } = await sb.from("campaign_send_log")
      .update({ status: "opened", opened_at: new Date().toISOString() })
      .eq("tracking_id", trackingId);
    if (error) console.error("[email-webhook] markOpened UPDATE failed", { trackingId, error: error.message });
  }
}

async function markClicked(trackingId: string) {
  const { data, error: selErr } = await sb.from("campaign_send_log")
    .select("id, clicked_at").eq("tracking_id", trackingId).maybeSingle();
  if (selErr) {
    console.error("[email-webhook] markClicked SELECT failed", { trackingId, error: selErr.message });
    return;
  }
  if (data && !data.clicked_at) {
    const { error } = await sb.from("campaign_send_log")
      .update({ status: "clicked", clicked_at: new Date().toISOString() })
      .eq("tracking_id", trackingId);
    if (error) console.error("[email-webhook] markClicked UPDATE failed", { trackingId, error: error.message });
  }
}

async function getCampaignId(trackingId: string): Promise<string | null> {
  const { data } = await sb.from("campaign_send_log").select("campaign_id").eq("tracking_id", trackingId).maybeSingle();
  return data?.campaign_id ?? null;
}

type SendLogRow = { status: string; opened_at: string | null; clicked_at: string | null; complaint_at: string | null };

async function updateCampaignStats(campaignId: string) {
  const { data } = await sb
    .from("campaign_send_log")
    .select("status, opened_at, clicked_at, complaint_at")
    .eq("campaign_id", campaignId);
  if (!data) return;
  const rows = data as unknown as SendLogRow[];

  // Open/click counts must be drawn from rows that successfully delivered
  // (i.e. not failed and not bounced). Pixel hits on bounced rows — from
  // preview bots or stale webhook events — would otherwise push the open
  // rate above 100%.
  const isDelivered = (r: SendLogRow) =>
    r.status !== "failed" && r.status !== "bounced";
  const stats = {
    sent: rows.filter(isDelivered).length,
    opened: rows.filter((r) => isDelivered(r) && r.opened_at).length,
    clicked: rows.filter((r) => isDelivered(r) && r.clicked_at).length,
    bounced: rows.filter((r) => r.status === "bounced").length,
    complained: rows.filter((r) => r.complaint_at).length,
    failed: rows.filter((r) => r.status === "failed").length,
  };

  await sb.from("campaigns").update({ stats }).eq("id", campaignId);
}

async function handleResend(events: unknown[]) {
  for (const event of events) {
    const e = event as Record<string, unknown>;
    const type = e.type as string;
    const data = (e.data ?? {}) as Record<string, unknown>;
    const trackingId = (data.tags as Record<string, string> | undefined)?.tracking_id;
    const email = data.to as string | undefined;
    if (!trackingId) continue;

    if (type === "email.bounced") {
      const bounceType = (data.bounce as Record<string, string> | undefined)?.type === "permanent" ? "hard_bounce" : "soft_bounce";
      await markBounced(trackingId, bounceType);
      const cid = await getCampaignId(trackingId);
      if (email && bounceType === "hard_bounce") await suppress(email, "hard_bounce", cid ?? undefined);
      if (cid) await updateCampaignStats(cid);
    } else if (type === "email.complained") {
      await markComplained(trackingId);
      const cid = await getCampaignId(trackingId);
      if (email) await suppress(email, "complaint", cid ?? undefined);
      if (cid) await updateCampaignStats(cid);
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

export async function POST(req: NextRequest) {
  sb = serverClient();
  try {
    const body = await req.json();
    const events: unknown[] = Array.isArray(body) ? body : [body];
    await handleResend(events);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("email-webhook error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "unknown" }, { status: 500 });
  }
}
