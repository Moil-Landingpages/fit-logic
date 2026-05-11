import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail, wrapEmailHtml, sanitizeEmailHtml } from "@/lib/emailSender";
import { applyEmailVars, buildPatientVars } from "@/lib/email-vars";
import { tryClaimCampaignLock, releaseCampaignLock } from "@/lib/campaign-lock";
import { signUnsubToken } from "@/lib/unsub-token";
import { syncContactOnEmailSent } from "@/lib/contact-sync";
import { chicagoMidnightUtc } from "@/lib/texas-time";

async function updateCampaignStats(supabase: SupabaseClient, campaignId: string) {
  const { data } = await supabase.from("campaign_send_log").select("status, opened_at, clicked_at").eq("campaign_id", campaignId);
  if (!data) return;
  // Open/click counts must only come from rows that successfully sent.
  // Otherwise a bounced or failed row whose pixel still fired (e.g. preview
  // bots, late-arriving webhook) pushes the ratio over 100%.
  const stats = {
    sent: data.filter((r) => r.status === "sent").length,
    opened: data.filter((r) => r.status === "sent" && r.opened_at).length,
    clicked: data.filter((r) => r.status === "sent" && r.clicked_at).length,
    bounced: data.filter((r) => r.status === "bounced").length,
  };
  await supabase.from("campaigns").update({ stats }).eq("id", campaignId);
}

// This POST endpoint is the manual-trigger path. It has NO hour gate and NO
// weekday gate so "Send Now" fires immediately regardless of local time —
// previously both gates caused first-step sends to silently skip outside the
// 8–9am Texas window or on weekends. The cron route
// (`app/api/cron/schedule/route.ts`) keeps both gates intact so the daily
// 8am-Texas Mon–Fri batch still fires once and only once per business day.

export async function POST(req: NextRequest) {
  const supabase = serverClient();

  try {
    const { data: settings } = await supabase
      .from("practice_settings")
      .select("email_provider_api_key, email_from_address, email_from_name, max_sends_per_day, google_gmail_token")
      .limit(1)
      .single();

    // Test mode is read from practice_settings.test_mode_only. When on, only
    // contacts flagged patients.is_test_contact=true receive sends; everyone
    // else is silently skipped. Toggle in Settings → Campaign Defaults.
    // Cast through unknown — auto-generated supabase types in
    // src/integrations/supabase/types.ts predate this column.
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

    // Check if Gmail is connected for fallback (cast through unknown as types predate this column)
    const hasGmail = !!(settings as unknown as { google_gmail_token?: unknown })?.google_gmail_token;

    if (!emailApiKey || !fromAddress) {
      console.warn("[process-campaign-queue] Email provider not fully configured.", {
        hasResendKey: !!emailApiKey,
        hasFromAddress: !!fromAddress,
        hasGmail,
      });
    }

    console.log("[process-campaign-queue] starting run", {
      testModeOnly,
      hasResendKey: !!emailApiKey,
      hasFromAddress: !!fromAddress,
      hasGmail,
    });

    const now = new Date();

    // No timezone-based gating on this manual path — see header comment.

    const { data: campaigns, error: campErr } = await supabase
      .from("campaigns")
      .select("*")
      .in("status", ["scheduled", "sending"])
      .lte("scheduled_at", now.toISOString());

    if (campErr) throw campErr;
    if (!campaigns?.length) return NextResponse.json({ message: "No campaigns to process" });

    const { data: suppressions } = await supabase.from("email_suppressions").select("email");
    const suppressedEmails = new Set((suppressions ?? []).map((s: { email: string }) => s.email.toLowerCase()));

    const { data: unsubs } = await supabase.from("campaign_unsubscribes").select("email");
    const unsubEmails = new Set((unsubs ?? []).map((u: { email: string }) => u.email.toLowerCase()));

    const results: unknown[] = [];

    for (const campaign of campaigns) {
      // No weekday gate on the manual-trigger path. "Send Now" should fire
      // immediately even on Saturday/Sunday — the cron route still gates so
      // automated background sends respect business hours.

      // Atomic per-campaign lock prevents the cron and a parallel Send Now
      // from grabbing the same recipients and double-sending.
      const claimed = await tryClaimCampaignLock(supabase, campaign.id);
      if (!claimed) {
        console.log("[process-campaign-queue] skipping — another worker holds the lock", { campaign: campaign.name });
        results.push({ campaign: campaign.name, skipped: "another worker is processing" });
        continue;
      }

      const maxSends = campaign.max_sends_per_day ?? settings?.max_sends_per_day ?? 500;
      // Reset window for "today's sends" aligns with Chicago midnight via
      // Intl (DST-correct on any host TZ). Old code mutated server-local
      // hours, which on UTC hosts produced a window starting 5–6h before
      // actual Texas midnight.
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
        // First try with the attachments column (added in migration
        // 20260502000001). If the migration hasn't been applied to the live
        // DB yet, the SELECT errors with "column does not exist" — previously
        // we ignored the error and treated the campaign as having zero
        // steps, silently completing every recipient. Fall back to the
        // legacy column set so sends keep working pre-migration.
        const tableAny = supabase.from("campaign_sequences") as unknown as {
          select: (cols: string) => {
            eq: (col: string, val: string) => {
              order: (col: string) => Promise<{ data: SequenceRow[] | null; error: { message: string; code?: string } | null }>;
            };
          };
        };
        let seqs: SequenceRow[] | null = null;
        let seqErr: { message: string; code?: string } | null = null;
        const withAttachments = await tableAny
          .select("step_number, delay_days, subject_override, body_html_override, attachments")
          .eq("campaign_id", campaign.id)
          .order("step_number");
        if (withAttachments.error) {
          console.warn("[process-campaign-queue] sequence SELECT with attachments failed; falling back", {
            campaign: campaign.name,
            error: withAttachments.error.message,
            hint: "Run migration 20260502000001_email_attachments.sql to enable per-step attachments.",
          });
          const fallback = await tableAny
            .select("step_number, delay_days, subject_override, body_html_override")
            .eq("campaign_id", campaign.id)
            .order("step_number");
          seqs = fallback.data;
          seqErr = fallback.error;
        } else {
          seqs = withAttachments.data;
        }
        if (seqErr) {
          console.error("[process-campaign-queue] sequence SELECT failed even after fallback", {
            campaign: campaign.name,
            campaign_id: campaign.id,
            error: seqErr.message,
            code: seqErr.code,
          });
          throw new Error(`Failed to load sequence steps for "${campaign.name}": ${seqErr.message}`);
        }
        sequences = seqs ?? [];
        console.log("[process-campaign-queue] sequence steps loaded", {
          campaign: campaign.name,
          step_count: sequences.length,
          step_numbers: sequences.map((s) => s.step_number),
          step_subjects: sequences.map((s) => s.subject_override?.slice(0, 40) ?? "(empty)"),
        });
      }

      let templateSubject = "";
      let templateBody = "";
      let templateAttachments: { filename: string; content: string; mimeType: string }[] = [];
      if (!isSequence && campaign.template_id) {
        // Same defensive pattern as the sequence load: try with attachments,
        // fall back without if the column isn't on this DB yet.
        const tplAny = supabase.from("email_templates") as unknown as {
          select: (cols: string) => { eq: (c: string, v: string) => { single: () => Promise<{ data: { subject: string; body_html: string | null; attachments?: typeof templateAttachments | null } | null; error: { message: string } | null }> } };
        };
        let tmpl: { subject: string; body_html: string | null; attachments?: typeof templateAttachments | null } | null = null;
        let tplErr: { message: string } | null = null;
        const withA = await tplAny.select("subject, body_html, attachments").eq("id", campaign.template_id).single();
        if (withA.error) {
          console.warn("[process-campaign-queue] template SELECT with attachments failed; falling back", {
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
          console.error("[process-campaign-queue] template SELECT failed", {
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

      // Single batch fetch of ALL referenced patients — kills the per-recipient
      // N+1 that was previously firing inside the send loop. We need three
      // pieces of info per patient: is_test_contact (for the test-mode gate),
      // first_name + last_name (for variable substitution), and company (for
      // {{company}} substitution). One query, indexed by id.
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
          // Cast through unknown — auto-generated types predate is_test_contact.
          const patientsRes = await (supabase
            .from("patients") as unknown as {
              select: (cols: string) => {
                in: (col: string, ids: string[]) => Promise<{ data: PatientFields[] | null; error: { message: string } | null }>;
              };
            })
            .select("id, first_name, last_name, company, status, pipeline_stage, is_test_contact")
            .in("id", patientIds);
          if (patientsRes.error) {
            console.error("[process-campaign-queue] patient batch fetch failed", { error: patientsRes.error.message });
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
        const nextUpdate: { status: string; sent_at?: string } = { status: nextStatus };
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
      // Per-reason skip counters drive the diagnostic toast in the UI so the
      // user understands WHY their Send Now produced 0 emails (test mode is
      // by far the most common cause of silent zero-send runs).
      const skipReasons = {
        test_mode: 0,
        suppressed: 0,
        unsubscribed: 0,
        sequence_delay: 0,
        // Recipient's current_step + 1 doesn't exist in campaign_sequences.
        // For a brand-new recipient (current_step=0) this means the sequence
        // has no row with step_number=1 — i.e. the sequence was never built.
        no_sequence_step: 0,
        // Recipient already advanced past the last step — sequence completed.
        sequence_completed: 0,
      };
      let firstSendError: string | null = null;

      for (const recipient of pendingRecipients) {
        const emailLower = recipient.email.toLowerCase();
        if (suppressedEmails.has(emailLower)) {
          await supabase.from("campaign_recipients").update({ status: "skipped", last_error: "Suppressed (hard bounce or complaint)" }).eq("id", recipient.id);
          skippedCount++;
          skipReasons.suppressed++;
          continue;
        }
        if (unsubEmails.has(emailLower)) {
          await supabase.from("campaign_recipients").update({ status: "skipped", last_error: "Unsubscribed from this campaign" }).eq("id", recipient.id);
          skippedCount++;
          skipReasons.unsubscribed++;
          continue;
        }

        if (testModeOnly && !(recipient.patient_id && testEligiblePatientIds.has(recipient.patient_id))) {
          await supabase
            .from("campaign_recipients")
            .update({ status: "skipped", last_error: "Test mode — only contacts flagged is_test_contact=true receive sends" })
            .eq("id", recipient.id);
          skippedCount++;
          skipReasons.test_mode++;
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
            // Two real-world causes:
            //  1. Sequence is empty / step 1 never saved → currentStep=0, no
            //     step_number=1 row. This is a CONFIG bug — surface it loud.
            //  2. Recipient already advanced past the last step → mark as
            //     completed so we don't keep checking on every cron run.
            const isFirstSendAttempt = currentStep === 0;
            const reason = isFirstSendAttempt
              ? `Sequence has no step ${currentStep + 1} — only steps [${sequences.map((s) => s.step_number).join(", ") || "none"}] exist. Build/edit the sequence and add step 1.`
              : "Sequence completed (no further steps)";
            await supabase
              .from("campaign_recipients")
              .update({ status: "completed", last_error: reason })
              .eq("id", recipient.id);
            if (isFirstSendAttempt) {
              skipReasons.no_sequence_step++;
              skippedCount++;
              if (!firstSendError) firstSendError = reason;
              console.warn("[process-campaign-queue] recipient skipped — missing sequence step", {
                recipient: recipient.email,
                current_step: currentStep,
                looking_for: currentStep + 1,
                available_steps: sequences.map((s) => s.step_number),
              });
            } else {
              skipReasons.sequence_completed++;
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
              if (elapsed < nextStep.delay_days * 86_400_000) {
                skipReasons.sequence_delay++;
                continue;
              }
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

        // Variable substitution — the helper accepts both `{key}` and
        // `{{key}}` so AI-generated and Resend-style templates both work.
        // Patient data comes from the prefetched batch (no N+1).
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
        // Sanitize after variable replacement so injected values (e.g. a
        // first_name containing <script>) are also stripped.
        bodyHtml = sanitizeEmailHtml(applyEmailVars(bodyHtml, vars));

        const trackingId = crypto.randomUUID();
        const trackBase = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api`;
        const trackPixel = `${trackBase}/track-email?t=${trackingId}&a=open`;
        const unsubLink = `${trackBase}/campaign-unsubscribe?t=${trackingId}&s=${signUnsubToken(trackingId)}`;

        const trackedBody = bodyHtml.replace(/href="(https?:\/\/[^"]+)"/g, (_match: string, url: string) => {
          const clickUrl = `${trackBase}/track-email?t=${trackingId}&a=click&url=${encodeURIComponent(url)}`;
          return `href="${clickUrl}"`;
        });

        const finalHtml = wrapEmailHtml({
          bodyFragment: trackedBody,
          trackingPixelUrl: trackPixel,
          unsubscribeUrl: unsubLink,
        });

        await supabase.from("campaign_send_log").insert({ campaign_id: campaign.id, recipient_id: recipient.id, step_number: stepNumber, status: "queued", tracking_id: trackingId });

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
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
          const recipientUpdate: { status: string; sent_at: string; current_step?: number } = { status: isSequence ? "pending" : "sent", sent_at: now.toISOString() };
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
          if (!firstSendError) firstSendError = sendResult.error ?? "Send failed";
          console.error("[process-campaign-queue] send failed", { recipient: recipient.email, error: sendResult.error });
        }
      }

      if (sentCount > 0) {
        try {
          const { data: fresh } = await supabase.from("campaigns").select("sent_count").eq("id", campaign.id).single();
          await supabase.from("campaigns").update({ sent_count: (fresh?.sent_count ?? campaign.sent_count ?? 0) + sentCount }).eq("id", campaign.id);
        } catch (error) {
          console.error("Error updating sent count:", error);
        }
      }
      // Refresh stats unconditionally — failures/skips/bounces should also
      // be reflected in the dashboard, not only successful sends.
      await updateCampaignStats(supabase, campaign.id);

      results.push({
        campaign: campaign.name,
        campaign_id: campaign.id,
        recipients_considered: pendingRecipients.length,
        sent: sentCount,
        failed: failedCount,
        skipped: skippedCount,
        skip_reasons: skipReasons,
        first_error: firstSendError,
      });
      console.log("[process-campaign-queue] campaign result", {
        campaign: campaign.name,
        recipients_considered: pendingRecipients.length,
        sent: sentCount, failed: failedCount, skipped: skippedCount,
        skip_reasons: skipReasons,
        first_error: firstSendError,
      });
      // Sanity check: if the loop processed recipients but every counter is
      // zero, an untracked `continue` path is swallowing them. Surface that
      // explicitly so it doesn't masquerade as a successful no-op.
      if (
        pendingRecipients.length > 0 &&
        sentCount === 0 && failedCount === 0 && skippedCount === 0
      ) {
        console.error("[process-campaign-queue] silent loop — recipients processed but no counter incremented", {
          campaign: campaign.name,
          considered: pendingRecipients.length,
          isSequence,
          sequence_step_numbers: sequences.map((s) => s.step_number),
        });
      }
      // Release the per-campaign lock so subsequent Send Now / cron runs can
      // claim it again without waiting for the 5-minute timeout.
      await releaseCampaignLock(supabase, campaign.id);
    }

    // Aggregate top-level totals so the UI can decide whether the run was a
    // success without iterating the per-campaign array.
    const totals = results.reduce(
      (acc: { sent: number; failed: number; skipped: number; test_mode_skips: number }, r) => {
        const row = r as { sent?: number; failed?: number; skipped?: number; skip_reasons?: { test_mode?: number } };
        acc.sent += row.sent ?? 0;
        acc.failed += row.failed ?? 0;
        acc.skipped += row.skipped ?? 0;
        acc.test_mode_skips += row.skip_reasons?.test_mode ?? 0;
        return acc;
      },
      { sent: 0, failed: 0, skipped: 0, test_mode_skips: 0 },
    );

    return NextResponse.json({
      processed: results,
      totals,
      test_mode_only: testModeOnly,
      provider_configured: { resend: !!emailApiKey, gmail: hasGmail, from_address: !!fromAddress },
    });
  } catch (error) {
    console.error("process-campaign-queue error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
