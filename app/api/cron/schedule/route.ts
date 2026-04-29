import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Helpers (duplicated from process-campaign-queue to avoid cross-route imports) ─

interface EmailPayload {
  to: string;
  toName: string | null;
  subject: string;
  html: string;
  from: string;
  listUnsubscribeUrl: string;
  trackingId: string;
}

interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

async function sendViaResend(apiKey: string, payload: EmailPayload): Promise<SendResult> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: payload.from,
      to: payload.toName ? [`${payload.toName} <${payload.to}>`] : [payload.to],
      subject: payload.subject,
      html: payload.html,
      headers: {
        "List-Unsubscribe": `<${payload.listUnsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        "X-Tracking-ID": payload.trackingId,
      },
    }),
  });
  if (res.ok) { const data = await res.json(); return { success: true, messageId: data.id }; }
  return { success: false, error: `Resend ${res.status}: ${await res.text()}` };
}

async function updateCampaignStats(supabase: SupabaseClient, campaignId: string) {
  const { data } = await supabase.from("campaign_send_log").select("status, opened_at, clicked_at").eq("campaign_id", campaignId);
  if (!data) return;
  const stats = {
    sent: data.filter((r) => r.status === "sent").length,
    opened: data.filter((r) => r.opened_at).length,
    clicked: data.filter((r) => r.clicked_at).length,
    bounced: data.filter((r) => r.status === "bounced").length,
  };
  await supabase.from("campaigns").update({ stats }).eq("id", campaignId);
}

// Hardcoded Texas timezone for 8am daily sends
const TEXAS_TIMEZONE = "America/Chicago";
const SEND_HOUR = 8; // 8:00 AM Texas time

async function processCampaigns(supabase: SupabaseClient) {
  const { data: settings } = await supabase
    .from("practice_settings")
    .select("email_provider_api_key, email_from_address, email_from_name, max_sends_per_day")
    .limit(1)
    .single();

  // While the practice is on the shared API key, only contacts flagged
  // patients.is_test_contact = true are eligible to receive sends. Megan flips
  // practice_settings.test_mode_only to false once she is on her own key. The
  // auto-generated supabase types in src/integrations/supabase/types.ts
  // predate this column so we fetch it through a separate untyped read.
  const { data: testModeRow } = await (supabase.from("practice_settings") as unknown as {
    select: (cols: string) => { limit: (n: number) => { single: () => Promise<{ data: { test_mode_only?: boolean } | null }> } };
  })
    .select("test_mode_only")
    .limit(1)
    .single();
  const testModeOnly = testModeRow?.test_mode_only ?? true;

  const emailApiKey: string = process.env.RESEND_API_KEY ?? settings?.email_provider_api_key ?? "";
  // FROM_EMAIL env var takes priority over the DB setting
  const fromAddress = process.env.FROM_EMAIL ?? settings?.email_from_address ?? "";
  const fromName = settings?.email_from_name ?? "FitLogic";
  const fromHeader = fromName ? `${fromName} <${fromAddress}>` : fromAddress;

  const now = new Date();

  // Get current time in Texas timezone
  const texasTimeStr = now.toLocaleString("en-US", { timeZone: TEXAS_TIMEZONE });
  const texasNow = new Date(texasTimeStr);
  const currentHour = texasNow.getHours();
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const currentDay = dayNames[texasNow.getDay()];

  // Only process if it's around 8am Texas time (allowing some buffer for cron timing)
  if (currentHour !== SEND_HOUR) {
    return { message: `Skipped - current Texas time is ${currentHour}:00, not ${SEND_HOUR}:00` };
  }

  // Get today's date in Texas timezone for duplicate prevention
  const texasDateStr = texasNow.toLocaleDateString("en-CA"); // YYYY-MM-DD

  const { data: campaigns, error: campErr } = await supabase
    .from("campaigns")
    .select("*")
    .in("status", ["scheduled", "sending"])
    .lte("scheduled_at", now.toISOString());

  if (campErr) throw campErr;
  if (!campaigns?.length) return { message: "No campaigns to process" };

  const { data: suppressions } = await supabase.from("email_suppressions").select("email");
  const suppressedEmails = new Set((suppressions ?? []).map((s: { email: string }) => s.email.toLowerCase()));
  const { data: unsubs } = await supabase.from("campaign_unsubscribes").select("email");
  const unsubEmails = new Set((unsubs ?? []).map((u: { email: string }) => u.email.toLowerCase()));

  const results: unknown[] = [];

  for (const campaign of campaigns) {
    // Only send on weekdays (Mon-Fri) at 8am Texas time
    const businessDays = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    if (!businessDays.includes(currentDay)) {
      results.push({ campaign: campaign.name, skipped: "not a business day (Mon-Fri only)" });
      continue;
    }

    // Skip campaigns already sent this calendar day (Texas timezone) — prevents duplicate sends
    // For sequences, individual recipient delay_days logic handles per-step gating instead
    if (campaign.campaign_type !== "sequence" && campaign.last_sent_at) {
      const lastSentTexasStr = new Date(campaign.last_sent_at).toLocaleDateString("en-CA", { timeZone: TEXAS_TIMEZONE });
      if (lastSentTexasStr === texasDateStr) {
        results.push({ campaign: campaign.name, skipped: "already sent today" });
        continue;
      }
    }

    // For sequences: skip if the last send for this campaign was already today (any recipient)
    if (campaign.campaign_type === "sequence" && campaign.last_sent_at) {
      const lastSentTexasStr = new Date(campaign.last_sent_at).toLocaleDateString("en-CA", { timeZone: TEXAS_TIMEZONE });
      if (lastSentTexasStr === texasDateStr) {
        results.push({ campaign: campaign.name, skipped: "sequence already processed today" });
        continue;
      }
    }

    const maxSends = campaign.max_sends_per_day ?? settings?.max_sends_per_day ?? 500;
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);

    const { count: sentToday } = await supabase
      .from("campaign_send_log")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaign.id)
      .eq("status", "sent")
      .gte("sent_at", todayStart.toISOString());

    const remaining = maxSends - (sentToday ?? 0);
    if (remaining <= 0) { results.push({ campaign: campaign.name, skipped: "daily limit reached" }); continue; }

    if (campaign.status === "scheduled") {
      await supabase.from("campaigns").update({ status: "sending" }).eq("id", campaign.id);
    }

    const isSequence = campaign.campaign_type === "sequence";
    let sequences: { step_number: number; delay_days: number; subject_override: string | null; body_html_override: string | null }[] = [];

    if (isSequence) {
      const { data: seqs } = await supabase
        .from("campaign_sequences")
        .select("step_number, delay_days, subject_override, body_html_override")
        .eq("campaign_id", campaign.id)
        .order("step_number");
      sequences = seqs ?? [];
    }

    let templateSubject = "";
    let templateBody = "";
    if (!isSequence && campaign.template_id) {
      const { data: tmpl } = await supabase.from("email_templates").select("subject, body_html").eq("id", campaign.template_id).single();
      if (tmpl) { templateSubject = tmpl.subject; templateBody = tmpl.body_html ?? ""; }
    }

    const { data: pendingRecipients } = await supabase
      .from("campaign_recipients")
      .select("id, email, name, patient_id, current_step, status")
      .eq("campaign_id", campaign.id)
      .eq("status", "pending")
      .order("created_at")
      .limit(Math.min(remaining, 500));

    // Test-mode gate (A1.5): build the set of patient_ids that are flagged
    // is_test_contact = true so we can skip everyone else without one SELECT
    // per recipient inside the loop.
    let testEligiblePatientIds: Set<string> = new Set();
    if (testModeOnly && pendingRecipients?.length) {
      const patientIds = Array.from(
        new Set(
          pendingRecipients
            .map((r: { patient_id: string | null }) => r.patient_id)
            .filter((id): id is string => !!id),
        ),
      );
      if (patientIds.length > 0) {
        // Cast through unknown — auto-generated supabase types predate the
        // is_test_contact column.
        const { data: testRows } = await (supabase
          .from("patients") as unknown as {
            select: (cols: string) => {
              in: (col: string, ids: string[]) => {
                eq: (col: string, val: boolean) => Promise<{ data: { id: string }[] | null }>;
              };
            };
          })
          .select("id")
          .in("id", patientIds)
          .eq("is_test_contact", true);
        testEligiblePatientIds = new Set((testRows ?? []).map((r: { id: string }) => r.id));
      }
    }

    if (!pendingRecipients?.length) {
      const { count: remainingFailed } = await supabase
        .from("campaign_recipients")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", campaign.id)
        .eq("status", "failed");

      const nextStatus = (remainingFailed ?? 0) > 0 ? "paused" : "sent";
      const nextUpdate: Record<string, unknown> = { status: nextStatus };
      if (nextStatus === "sent") nextUpdate.sent_at = now.toISOString();
      await supabase.from("campaigns").update(nextUpdate).eq("id", campaign.id);
      await updateCampaignStats(supabase, campaign.id);
      results.push({ campaign: campaign.name, completed: true, status: nextStatus });
      continue;
    }

    let sentCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const recipient of pendingRecipients) {
      const emailLower = recipient.email.toLowerCase();
      if (suppressedEmails.has(emailLower) || unsubEmails.has(emailLower)) {
        await supabase.from("campaign_recipients").update({ status: "skipped", last_error: "Suppressed or unsubscribed" }).eq("id", recipient.id);
        skippedCount++;
        continue;
      }

      if (testModeOnly && !(recipient.patient_id && testEligiblePatientIds.has(recipient.patient_id))) {
        await supabase
          .from("campaign_recipients")
          .update({ status: "skipped", last_error: "Test mode — only contacts flagged is_test_contact=true receive sends" })
          .eq("id", recipient.id);
        skippedCount++;
        continue;
      }

      let subject = "";
      let bodyHtml = "";
      let stepNumber = 1;

      if (isSequence) {
        const currentStep = recipient.current_step ?? 0;
        const nextStep = sequences.find((s) => s.step_number === currentStep + 1);
        if (!nextStep) { await supabase.from("campaign_recipients").update({ status: "completed" }).eq("id", recipient.id); continue; }

        if (nextStep.delay_days > 0) {
          const { data: lastSend } = await supabase
            .from("campaign_send_log")
            .select("sent_at")
            .eq("recipient_id", recipient.id)
            .eq("step_number", currentStep)
            .eq("status", "sent")
            .order("sent_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (lastSend?.sent_at) {
            const elapsed = now.getTime() - new Date(lastSend.sent_at).getTime();
            if (elapsed < nextStep.delay_days * 86_400_000) continue;
          }
        }

        subject = nextStep.subject_override ?? "";
        bodyHtml = nextStep.body_html_override ?? "";
        stepNumber = nextStep.step_number;
      } else {
        subject = templateSubject;
        bodyHtml = templateBody;
      }

      if (!subject || !bodyHtml) {
        await supabase.from("campaign_recipients").update({ status: "failed", last_error: "Missing email content" }).eq("id", recipient.id);
        failedCount++;
        continue;
      }

      const trackingId = crypto.randomUUID();
      const trackBase = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api`;
      const trackPixel = `${trackBase}/track-email?t=${trackingId}&a=open`;
      const unsubLink = `${trackBase}/campaign-unsubscribe?t=${trackingId}`;

      const trackedBody = bodyHtml.replace(/href="(https?:\/\/[^"]+)"/g, (_match: string, url: string) => {
        const clickUrl = `${trackBase}/track-email?t=${trackingId}&a=click&url=${encodeURIComponent(url)}`;
        return `href="${clickUrl}"`;
      });

      const finalHtml = `${trackedBody}
<img src="${trackPixel}" width="1" height="1" style="display:none" alt="" />
<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:center;font-size:11px;color:#9ca3af;">
  You received this email because you opted in.<br/>
  <a href="${unsubLink}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a>
</div>`;

      await supabase.from("campaign_send_log").insert({ campaign_id: campaign.id, recipient_id: recipient.id, step_number: stepNumber, status: "queued", tracking_id: trackingId });

      const sendResult = await sendViaResend(emailApiKey, { to: recipient.email, toName: recipient.name, subject, html: finalHtml, from: fromHeader, listUnsubscribeUrl: unsubLink, trackingId });

      if (sendResult.success) {
        await supabase.from("campaign_send_log").update({ status: "sent", sent_at: now.toISOString() }).eq("tracking_id", trackingId);
        const recipientUpdate: Record<string, unknown> = { status: isSequence ? "pending" : "sent", sent_at: now.toISOString() };
        if (isSequence) { recipientUpdate.current_step = stepNumber; if (stepNumber >= sequences.length) recipientUpdate.status = "completed"; }
        await supabase.from("campaign_recipients").update(recipientUpdate).eq("id", recipient.id);
        // A1.4: stamp the patient's last_contacted_at so the daily list can
        // sort by it. Cast through unknown — auto-generated supabase types
        // predate this column.
        if (recipient.patient_id) {
          await (supabase.from("patients") as unknown as {
            update: (vals: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
          })
            .update({ last_contacted_at: now.toISOString() })
            .eq("id", recipient.patient_id);
        }
        sentCount++;
      } else {
        await supabase.from("campaign_send_log").update({ status: "failed", error_message: sendResult.error ?? "Unknown error" }).eq("tracking_id", trackingId);
        await supabase.from("campaign_recipients").update({ status: "failed", last_error: sendResult.error ?? "Send failed" }).eq("id", recipient.id);
        failedCount++;
      }
    }

    if (sentCount > 0) {
      try {
        const { data: fresh } = await supabase.from("campaigns").select("sent_count").eq("id", campaign.id).single();
        await supabase.from("campaigns").update({
          sent_count: (fresh?.sent_count ?? campaign.sent_count ?? 0) + sentCount,
          last_sent_at: now.toISOString(), // Track that we sent today
        }).eq("id", campaign.id);
      } catch (err) {
        console.error("Error updating sent count:", err);
      }
      await updateCampaignStats(supabase, campaign.id);
    }

    results.push({ campaign: campaign.name, sent: sentCount, failed: failedCount, skipped: skippedCount });
  }

  return { processed: results };
}

// ─── Cron Handler ──────────────────────────────────────────────────────────────
// Vercel calls this via GET with Authorization: Bearer <CRON_SECRET>
// Can also be triggered manually: GET /api/cron/schedule
//   with header  Authorization: Bearer <CRON_SECRET>

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes — Vercel Pro/Enterprise max

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const supabase = serverClient();
    const result = await processCampaigns(supabase);
    console.log("[cron/schedule]", JSON.stringify(result));
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/schedule] error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
