import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail, wrapEmailHtml, sanitizeEmailHtml } from "@/lib/emailSender";
import { applyEmailVars, buildPatientVars } from "@/lib/email-vars";
import { tryClaimCampaignLock, releaseCampaignLock } from "@/lib/campaign-lock";
import { signUnsubToken } from "@/lib/unsub-token";
import { syncContactOnEmailSent } from "@/lib/contact-sync";
import { chicagoParts, chicagoMidnightUtc } from "@/lib/texas-time";

async function updateCampaignStats(supabase: SupabaseClient, campaignId: string) {
  const { data } = await supabase.from("campaign_send_log").select("status, opened_at, clicked_at").eq("campaign_id", campaignId);
  if (!data) return;
  // Opens/clicks come only from rows that successfully sent. Otherwise a
  // bounced row whose tracking pixel still fired (preview bots, late
  // webhooks) inflates the rate above 100%.
  const stats = {
    sent: data.filter((r) => r.status === "sent").length,
    opened: data.filter((r) => r.status === "sent" && r.opened_at).length,
    clicked: data.filter((r) => r.status === "sent" && r.clicked_at).length,
    bounced: data.filter((r) => r.status === "bounced").length,
  };
  await supabase.from("campaigns").update({ stats }).eq("id", campaignId);
}

// Hardcoded Texas timezone for ~8am daily sends.
// Vercel cron is UTC-only ("0 14 * * *" = 14:00 UTC). That is 8am CST in winter
// but 9am CDT in summer. Accept either hour so DST does not silently skip an
// entire half of the year.
const TEXAS_TIMEZONE = "America/Chicago";
const SEND_HOURS = [8, 9];

async function processCampaigns(supabase: SupabaseClient, baseUrl: string) {
  const { data: settings } = await supabase
    .from("practice_settings")
    .select("email_provider_api_key, email_from_address, email_from_name, max_sends_per_day, google_gmail_token")
    .limit(1)
    .single();

  // Test mode is read from practice_settings.test_mode_only. When on, only
  // contacts flagged patients.is_test_contact=true receive sends; everyone
  // else is silently skipped. Toggle in Settings → Campaign Defaults.
  // Cast through unknown — auto-generated supabase types predate this column.
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

  // Check if Gmail is connected for fallback
  const hasGmail = !!(settings as unknown as { google_gmail_token?: unknown })?.google_gmail_token;

  const now = new Date();

  // Get current Chicago wall-clock parts via Intl (DST-correct on any host
  // timezone — the previous `new Date(toLocaleString(...))` trick was only
  // coincidentally correct on UTC servers).
  const chi = chicagoParts(now);
  const currentHour = chi.hour;
  const currentDay = chi.weekday;

  // Only process during the 8–9am Texas window (covers CST + CDT).
  if (!SEND_HOURS.includes(currentHour)) {
    return { message: `Skipped - current Texas time is ${currentHour}:00, outside send window ${SEND_HOURS.join("/")}` };
  }

  // Today's date in Chicago for duplicate prevention.
  const texasDateStr = chi.dateStr; // YYYY-MM-DD

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

    // Atomic lock prevents this cron run from processing the same campaign
    // a parallel "Send Now" click is already working on. See
    // src/lib/campaign-lock.ts for semantics.
    const claimed = await tryClaimCampaignLock(supabase, campaign.id);
    if (!claimed) {
      console.log("[cron/schedule] skipping — another worker holds the lock", { campaign: campaign.name });
      results.push({ campaign: campaign.name, skipped: "another worker is processing" });
      continue;
    }

    const maxSends = campaign.max_sends_per_day ?? settings?.max_sends_per_day ?? 500;
    // Reset at Chicago midnight (DST-correct via Intl) — old code zeroed the
    // hour in server-local time, which on UTC hosts shifted the window 5–6h
    // earlier than actual Texas midnight and miscounted the daily quota.
    const todayStart = chicagoMidnightUtc(now);

    const { count: sentToday } = await supabase
      .from("campaign_send_log")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaign.id)
      .eq("status", "sent")
      .gte("sent_at", todayStart.toISOString());

    const remaining = maxSends - (sentToday ?? 0);
    if (remaining <= 0) {
      results.push({ campaign: campaign.name, skipped: "daily limit reached" });
      await releaseCampaignLock(supabase, campaign.id);
      continue;
    }

    if (campaign.status === "scheduled") {
      await supabase.from("campaigns").update({ status: "sending" }).eq("id", campaign.id);
    }

    const isSequence = campaign.campaign_type === "sequence";
    type SequenceRow = {
      step_number: number;
      delay_days: number;
      subject_override: string | null;
      body_html_override: string | null;
      attachments?: { filename: string; content: string; mimeType: string }[] | null;
    };
    let sequences: SequenceRow[] = [];

    if (isSequence) {
      // Defensive load: try with attachments (migration 20260502000001), fall
      // back to legacy columns if the column doesn't exist on the live DB.
      // Without this fallback the SELECT silently errored and every recipient
      // got marked completed without sending.
      const tableAny = supabase.from("campaign_sequences") as unknown as {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            order: (col: string) => Promise<{ data: SequenceRow[] | null; error: { message: string; code?: string } | null }>;
          };
        };
      };
      let seqs: SequenceRow[] | null = null;
      let seqErr: { message: string; code?: string } | null = null;
      const withA = await tableAny
        .select("step_number, delay_days, subject_override, body_html_override, attachments")
        .eq("campaign_id", campaign.id)
        .order("step_number");
      if (withA.error) {
        console.warn("[cron/schedule] sequence SELECT with attachments failed; falling back", {
          campaign: campaign.name,
          error: withA.error.message,
          hint: "Run migration 20260502000001_email_attachments.sql to enable per-step attachments.",
        });
        const fb = await tableAny
          .select("step_number, delay_days, subject_override, body_html_override")
          .eq("campaign_id", campaign.id)
          .order("step_number");
        seqs = fb.data;
        seqErr = fb.error;
      } else {
        seqs = withA.data;
      }
      if (seqErr) {
        console.error("[cron/schedule] sequence SELECT failed even after fallback", {
          campaign: campaign.name,
          campaign_id: campaign.id,
          error: seqErr.message,
        });
        throw new Error(`Failed to load sequence steps for "${campaign.name}": ${seqErr.message}`);
      }
      sequences = seqs ?? [];
      console.log("[cron/schedule] sequence steps loaded", {
        campaign: campaign.name,
        step_count: sequences.length,
        step_numbers: sequences.map((s) => s.step_number),
      });
    }

    let templateSubject = "";
    let templateBody = "";
    let templateAttachments: { filename: string; content: string; mimeType: string }[] = [];
    if (!isSequence && campaign.template_id) {
      const tplAny = supabase.from("email_templates") as unknown as {
        select: (cols: string) => { eq: (c: string, v: string) => { single: () => Promise<{ data: { subject: string; body_html: string | null; attachments?: typeof templateAttachments | null } | null; error: { message: string } | null }> } };
      };
      let tmpl: { subject: string; body_html: string | null; attachments?: typeof templateAttachments | null } | null = null;
      let tplErr: { message: string } | null = null;
      const withA = await tplAny.select("subject, body_html, attachments").eq("id", campaign.template_id).single();
      if (withA.error) {
        console.warn("[cron/schedule] template SELECT with attachments failed; falling back", {
          campaign: campaign.name,
          error: withA.error.message,
        });
        const fb = await tplAny.select("subject, body_html").eq("id", campaign.template_id).single();
        tmpl = fb.data;
        tplErr = fb.error;
      } else {
        tmpl = withA.data;
      }
      if (tplErr) {
        console.error("[cron/schedule] template SELECT failed", {
          campaign: campaign.name,
          template_id: campaign.template_id,
          error: tplErr.message,
        });
        throw new Error(`Failed to load template for "${campaign.name}": ${tplErr.message}`);
      }
      if (tmpl) {
        templateSubject = tmpl.subject;
        templateBody = tmpl.body_html ?? "";
        templateAttachments = Array.isArray(tmpl.attachments) ? tmpl.attachments : [];
      }
    }

    const { data: pendingRecipients } = await supabase
      .from("campaign_recipients")
      .select("id, email, name, patient_id, current_step, status")
      .eq("campaign_id", campaign.id)
      .eq("status", "pending")
      .order("created_at")
      .limit(Math.min(remaining, 500));

    // Single batch fetch of all referenced patients — kills the per-recipient
    // N+1 lookup inside the loop and unifies test-mode + variable substitution.
    type PatientFields = {
      id: string;
      first_name: string | null;
      last_name: string | null;
      company: string | null;
      status: string | null;
      pipeline_stage: string | null;
      is_test_contact?: boolean | null;
    };
    const patientById = new Map<string, PatientFields>();
    const testEligiblePatientIds: Set<string> = new Set();
    if (pendingRecipients?.length) {
      const patientIds = Array.from(
        new Set(
          pendingRecipients
            .map((r: { patient_id: string | null }) => r.patient_id)
            .filter((id): id is string => !!id),
        ),
      );
      if (patientIds.length > 0) {
        const patientsRes = await (supabase
          .from("patients") as unknown as {
            select: (cols: string) => {
              in: (col: string, ids: string[]) => Promise<{ data: PatientFields[] | null; error: { message: string } | null }>;
            };
          })
          .select("id, first_name, last_name, company, status, pipeline_stage, is_test_contact")
          .in("id", patientIds);
        if (patientsRes.error) {
          console.error("[cron/schedule] patient batch fetch failed", { error: patientsRes.error.message });
        }
        for (const p of patientsRes.data ?? []) {
          patientById.set(p.id, p);
          if (p.is_test_contact === true) testEligiblePatientIds.add(p.id);
        }
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
      await releaseCampaignLock(supabase, campaign.id);
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
      let stepAttachments: { filename: string; content: string; mimeType: string }[] = [];

      if (isSequence) {
        const currentStep = recipient.current_step ?? 0;
        const nextStep = sequences.find((s) => s.step_number === currentStep + 1);
        if (!nextStep) {
          const isFirstSendAttempt = currentStep === 0;
          const reason = isFirstSendAttempt
            ? `Sequence has no step ${currentStep + 1} — only steps [${sequences.map((s) => s.step_number).join(", ") || "none"}] exist.`
            : "Sequence completed (no further steps)";
          await supabase
            .from("campaign_recipients")
            .update({ status: "completed", last_error: reason })
            .eq("id", recipient.id);
          if (isFirstSendAttempt) {
            console.warn("[cron/schedule] recipient skipped — missing sequence step", {
              recipient: recipient.email,
              current_step: currentStep,
              available_steps: sequences.map((s) => s.step_number),
            });
          }
          continue;
        }

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
        stepAttachments = Array.isArray(nextStep.attachments) ? nextStep.attachments : [];
      } else {
        subject = templateSubject;
        bodyHtml = templateBody;
        stepAttachments = templateAttachments;
      }

      if (!subject || !bodyHtml) {
        await supabase.from("campaign_recipients").update({ status: "failed", last_error: "Missing email content" }).eq("id", recipient.id);
        failedCount++;
        continue;
      }

      // Per-recipient variable substitution. The cron path was previously
      // missing this entirely, so recipients of the 8am daily batch received
      // emails with literal `{first_name}` text. Patient data comes from the
      // batched fetch (no N+1).
      const patient = recipient.patient_id ? patientById.get(recipient.patient_id) : undefined;
      let firstName = patient?.first_name ?? "";
      let lastName = patient?.last_name ?? "";
      if (!firstName && recipient.name) {
        const parts = recipient.name.trim().split(/\s+/);
        firstName = parts[0] || "";
        lastName = parts.slice(1).join(" ") || "";
      }
      const vars = buildPatientVars({
        firstName, lastName,
        email: recipient.email,
        fallbackName: recipient.name,
        extra: { company: patient?.company ?? "" },
      });
      subject = applyEmailVars(subject, vars);
      bodyHtml = applyEmailVars(bodyHtml, vars);

      const trackingId = crypto.randomUUID();
      const trackBase = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api`;
      const trackPixel = `${trackBase}/track-email?t=${trackingId}&a=open`;
      const unsubLink = `${trackBase}/campaign-unsubscribe?t=${trackingId}&s=${signUnsubToken(trackingId)}`;

      // Sanitize after variable replacement so injected values get stripped.
      const safeBody = sanitizeEmailHtml(bodyHtml);
      const trackedBody = safeBody.replace(/href="(https?:\/\/[^"]+)"/g, (_match: string, url: string) => {
        const clickUrl = `${trackBase}/track-email?t=${trackingId}&a=click&url=${encodeURIComponent(url)}`;
        return `href="${clickUrl}"`;
      });

      const finalHtml = wrapEmailHtml({
        bodyFragment: trackedBody,
        trackingPixelUrl: trackPixel,
        unsubscribeUrl: unsubLink,
      });

      await supabase.from("campaign_send_log").insert({ campaign_id: campaign.id, recipient_id: recipient.id, step_number: stepNumber, status: "queued", tracking_id: trackingId });

      const sendResult = await sendEmail(
        emailApiKey,
        {
          to: recipient.email, toName: recipient.name,
          subject, html: finalHtml,
          from: fromHeader, listUnsubscribeUrl: unsubLink, trackingId,
          attachments: stepAttachments.length ? stepAttachments : undefined,
        },
        baseUrl,
        hasGmail,
      );

      if (sendResult.success) {
        await supabase.from("campaign_send_log").update({ status: "sent", sent_at: now.toISOString() }).eq("tracking_id", trackingId);
        const recipientUpdate: Record<string, unknown> = { status: isSequence ? "pending" : "sent", sent_at: now.toISOString() };
        if (isSequence) { recipientUpdate.current_step = stepNumber; if (stepNumber >= sequences.length) recipientUpdate.status = "completed"; }
        await supabase.from("campaign_recipients").update(recipientUpdate).eq("id", recipient.id);
        // Stamp last_contacted_at AND auto-promote pipeline_stage from
        // new_lead → contacted when the contact is still a "lead". The
        // helper inspects the prefetched patient row so this is a single
        // UPDATE with no extra read.
        if (recipient.patient_id) {
          const p = patientById.get(recipient.patient_id);
          if (p) {
            await syncContactOnEmailSent(supabase, p, now.toISOString());
          }
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
    }
    // Refresh stats unconditionally — failed/skipped/bounced also matter.
    await updateCampaignStats(supabase, campaign.id);

    results.push({ campaign: campaign.name, sent: sentCount, failed: failedCount, skipped: skippedCount });
    await releaseCampaignLock(supabase, campaign.id);
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
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const result = await processCampaigns(supabase, baseUrl);
    console.log("[cron/schedule]", JSON.stringify(result));
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/schedule] error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
