import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

// Lazy — assigned inside POST handler. Do NOT call serverClient() at module top-level
// (breaks Next.js build env injection during route data collection).
let sb: SupabaseClient;

async function suppress(email: string, reason: string, campaignId?: string) {
  await sb.from("email_suppressions").upsert(
    { email: email.toLowerCase(), reason, campaign_id: campaignId ?? null },
    { onConflict: "email", ignoreDuplicates: false }
  );
}

async function markBounced(trackingId: string, bounceType: string) {
  await sb.from("campaign_send_log").update({ status: "bounced", bounce_type: bounceType } as never).eq("tracking_id", trackingId);
}

async function markComplained(trackingId: string) {
  await sb.from("campaign_send_log").update({ status: "complained", complaint_at: new Date().toISOString() } as never).eq("tracking_id", trackingId);
}

async function markOpened(trackingId: string) {
  const { data } = await sb.from("campaign_send_log").select("id, opened_at").eq("tracking_id", trackingId).maybeSingle();
  if (data && !data.opened_at) {
    await sb.from("campaign_send_log").update({ status: "opened", opened_at: new Date().toISOString() }).eq("tracking_id", trackingId);
  }
}

async function markClicked(trackingId: string) {
  const { data } = await sb.from("campaign_send_log").select("id, clicked_at").eq("tracking_id", trackingId).maybeSingle();
  if (data && !data.clicked_at) {
    await sb.from("campaign_send_log").update({ status: "clicked", clicked_at: new Date().toISOString() }).eq("tracking_id", trackingId);
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

  const stats = {
    sent: rows.filter((r) => r.status !== "failed").length,
    opened: rows.filter((r) => r.opened_at).length,
    clicked: rows.filter((r) => r.clicked_at).length,
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
