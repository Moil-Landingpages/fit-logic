import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── Email provider adapter ───────────────────────────────────────────────────

interface EmailPayload {
  to:      string;
  toName:  string | null;
  subject: string;
  html:    string;
  from:    string;       // "Name <email@domain.com>"
  replyTo?: string;
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
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from:    payload.from,
      to:      payload.toName ? [`${payload.toName} <${payload.to}>`] : [payload.to],
      subject: payload.subject,
      html:    payload.html,
      headers: {
        "List-Unsubscribe":      `<${payload.listUnsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        "X-Tracking-ID":         payload.trackingId,
      },
    }),
  });
  if (res.ok) {
    const data = await res.json();
    return { success: true, messageId: data.id };
  }
  const errText = await res.text();
  return { success: false, error: `Resend ${res.status}: ${errText}` };
}

async function sendViaSendGrid(apiKey: string, payload: EmailPayload): Promise<SendResult> {
  // Parse "Name <email>" format
  const fromMatch = payload.from.match(/^(.+?)\s*<(.+)>$/) ?? [null, "", payload.from];
  const fromName  = fromMatch[1]?.trim() || "";
  const fromEmail = fromMatch[2]?.trim() || payload.from;

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      personalizations: [{
        to: [{ email: payload.to, ...(payload.toName ? { name: payload.toName } : {}) }],
      }],
      from:    { email: fromEmail, ...(fromName ? { name: fromName } : {}) },
      subject: payload.subject,
      content: [{ type: "text/html", value: payload.html }],
      headers: {
        "List-Unsubscribe":      `<${payload.listUnsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        "X-Tracking-ID":         payload.trackingId,
      },
    }),
  });

  if (res.status === 202) {
    // SendGrid returns 202 with no body on success
    const messageId = res.headers.get("X-Message-Id") ?? undefined;
    return { success: true, messageId };
  }
  const errText = await res.text();
  return { success: false, error: `SendGrid ${res.status}: ${errText}` };
}

async function sendEmail(
  provider: string,
  apiKey: string,
  payload: EmailPayload
): Promise<SendResult> {
  try {
    if (provider === "resend")    return await sendViaResend(apiKey, payload);
    if (provider === "sendgrid")  return await sendViaSendGrid(apiKey, payload);
    // Unknown provider — log but don't crash the queue
    return { success: false, error: `Unknown provider: ${provider}` };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase    = createClient(supabaseUrl, serviceKey);

  try {
    // ── Load practice settings (email provider, from address, timezone) ───
    const { data: settings } = await supabase
      .from("practice_settings")
      .select("email_provider, email_provider_api_key, email_from_address, email_from_name, timezone, business_hours_start, business_hours_end, business_days, max_sends_per_day, email_api_key_secret_id")
      .limit(1)
      .single();

    const emailProvider  = settings?.email_provider ?? "resend";

    // Try secrets first (RESEND_API_KEY env), then vault, then plain column
    let emailApiKey: string = Deno.env.get("RESEND_API_KEY") ?? settings?.email_provider_api_key ?? "";
    if (!emailApiKey && settings?.email_api_key_secret_id) {
      const { data: vaultRow } = await supabase.rpc("get_email_api_key");
      if (vaultRow) emailApiKey = vaultRow as string;
    }
    const fromAddress    = settings?.email_from_address ?? "";
    const fromName       = settings?.email_from_name ?? "FitLogic";
    const practiceTimezone = settings?.timezone ?? "America/New_York";

    // Warn but don't abort — queue still runs, sends will fail gracefully per-recipient
    if (!emailApiKey || !fromAddress) {
      console.warn("Email provider not fully configured. Sends will be logged as failed.");
    }

    const fromHeader = fromName ? `${fromName} <${fromAddress}>` : fromAddress;

    // ── Determine current time in practice timezone ────────────────────────
    const now = new Date();
    // Convert UTC now to practice local time for business-hours checking
    const localTimeStr = now.toLocaleString("en-US", { timeZone: practiceTimezone });
    const localNow     = new Date(localTimeStr);
    const currentHour  = localNow.getHours();
    const dayNames     = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const currentDay   = dayNames[localNow.getDay()];

    // ── Fetch scheduled/sending campaigns ─────────────────────────────────
    const { data: campaigns, error: campErr } = await supabase
      .from("campaigns")
      .select("*")
      .in("status", ["scheduled", "sending"])
      .lte("scheduled_at", now.toISOString());

    if (campErr) throw campErr;
    if (!campaigns?.length) {
      return json({ message: "No campaigns to process" });
    }

    // ── Load global suppression list once ─────────────────────────────────
    const { data: suppressions } = await supabase
      .from("email_suppressions")
      .select("email");
    const suppressedEmails = new Set(
      (suppressions ?? []).map((s: { email: string }) => s.email.toLowerCase())
    );

    // ── Load global unsubscribes ───────────────────────────────────────────
    const { data: unsubs } = await supabase
      .from("campaign_unsubscribes")
      .select("email");
    const unsubEmails = new Set(
      (unsubs ?? []).map((u: { email: string }) => u.email.toLowerCase())
    );

    const results: unknown[] = [];

    for (const campaign of campaigns) {
      // ── Per-campaign business hours (fall back to practice settings) ─────
      const bhStart = campaign.business_hours_start ?? settings?.business_hours_start ?? 8;
      const bhEnd   = campaign.business_hours_end   ?? settings?.business_hours_end   ?? 18;
      const bizDays: string[] = campaign.business_days ?? settings?.business_days ?? ["Mon","Tue","Wed","Thu","Fri"];

      if (!bizDays.includes(currentDay)) {
        results.push({ campaign: campaign.name, skipped: "not a business day" });
        continue;
      }
      if (currentHour < bhStart || currentHour >= bhEnd) {
        results.push({ campaign: campaign.name, skipped: "outside business hours" });
        continue;
      }

      // ── Daily send-limit check ────────────────────────────────────────────
      const maxSends   = campaign.max_sends_per_day ?? settings?.max_sends_per_day ?? 500;
      const todayStart = new Date(now);
      todayStart.setUTCHours(0, 0, 0, 0);

      const { count: sentToday } = await supabase
        .from("campaign_send_log")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", campaign.id)
        .eq("status", "sent")
        .gte("sent_at", todayStart.toISOString());

      const remaining = maxSends - (sentToday ?? 0);
      if (remaining <= 0) {
        results.push({ campaign: campaign.name, skipped: "daily limit reached" });
        continue;
      }

      // ── Mark as sending ───────────────────────────────────────────────────
      if (campaign.status === "scheduled") {
        await supabase.from("campaigns").update({ status: "sending" }).eq("id", campaign.id);
      }

      // ── Load sequences / template ─────────────────────────────────────────
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
      let templateBody    = "";
      if (!isSequence && campaign.template_id) {
        const { data: tmpl } = await supabase
          .from("email_templates")
          .select("subject, body_html")
          .eq("id", campaign.template_id)
          .single();
        if (tmpl) {
          templateSubject = tmpl.subject;
          templateBody    = tmpl.body_html ?? "";
        }
      }

      // ── Fetch pending recipients ──────────────────────────────────────────
      const { data: pendingRecipients } = await supabase
        .from("campaign_recipients")
        .select("id, email, name, patient_id, current_step, status")
        .eq("campaign_id", campaign.id)
        .eq("status", "pending")
        .order("created_at")
        .limit(Math.min(remaining, 500)); // Never fetch more than 500 at once

      if (!pendingRecipients?.length) {
        await supabase.from("campaigns")
          .update({ status: "sent", sent_at: now.toISOString() })
          .eq("id", campaign.id);
        await updateCampaignStats(supabase, campaign.id);
        results.push({ campaign: campaign.name, completed: true });
        continue;
      }

      let sentCount    = 0;
      let failedCount  = 0;
      let skippedCount = 0;

      for (const recipient of pendingRecipients) {
        const emailLower = recipient.email.toLowerCase();

        // ── Skip suppressed / unsubscribed ────────────────────────────────
        if (suppressedEmails.has(emailLower) || unsubEmails.has(emailLower)) {
          await supabase.from("campaign_recipients")
            .update({ status: "skipped", last_error: "Suppressed or unsubscribed" })
            .eq("id", recipient.id);
          skippedCount++;
          continue;
        }

        // ── Resolve email content ─────────────────────────────────────────
        let subject    = "";
        let bodyHtml   = "";
        let stepNumber = 1;

        if (isSequence) {
          const currentStep = recipient.current_step ?? 0;
          const nextStep    = sequences.find(s => s.step_number === currentStep + 1);

          if (!nextStep) {
            await supabase.from("campaign_recipients")
              .update({ status: "completed" }).eq("id", recipient.id);
            continue;
          }

          // Check step delay
          if (currentStep > 0 && nextStep.delay_days > 0) {
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
                continue; // Delay not elapsed
              }
            }
          }

          subject    = nextStep.subject_override ?? "";
          bodyHtml   = nextStep.body_html_override ?? "";
          stepNumber = nextStep.step_number;
        } else {
          subject  = templateSubject;
          bodyHtml = templateBody;
        }

        if (!subject || !bodyHtml) {
          await supabase.from("campaign_recipients")
            .update({ status: "failed", last_error: "Missing email content" })
            .eq("id", recipient.id);
          failedCount++;
          continue;
        }

        // ── Build tracking URLs ───────────────────────────────────────────
        const trackingId   = crypto.randomUUID();
        const trackBase    = `${supabaseUrl}/functions/v1`;
        const trackPixel   = `${trackBase}/track-email?t=${trackingId}&a=open`;
        const unsubLink    = `${trackBase}/campaign-unsubscribe?t=${trackingId}`;

        // Wrap href links for click tracking
        const trackedBody = bodyHtml.replace(
          /href="(https?:\/\/[^"]+)"/g,
          (_match: string, url: string) => {
            const clickUrl = `${trackBase}/track-email?t=${trackingId}&a=click&url=${encodeURIComponent(url)}`;
            return `href="${clickUrl}"`;
          }
        );

        // Assemble final HTML with pixel + footer
        const finalHtml = `${trackedBody}
<img src="${trackPixel}" width="1" height="1" style="display:none" alt="" />
<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:center;font-size:11px;color:#9ca3af;">
  You received this email because you opted in.<br/>
  <a href="${unsubLink}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a>
</div>`;

        // ── Insert send log (queued) ───────────────────────────────────────
        await supabase.from("campaign_send_log").insert({
          campaign_id:  campaign.id,
          recipient_id: recipient.id,
          step_number:  stepNumber,
          status:       "queued",
          tracking_id:  trackingId,
        });

        // ── Attempt delivery ──────────────────────────────────────────────
        const sendResult = await sendEmail(emailProvider, emailApiKey, {
          to:                 recipient.email,
          toName:             recipient.name,
          subject,
          html:               finalHtml,
          from:               fromHeader,
          listUnsubscribeUrl: unsubLink,
          trackingId,
        });

        if (sendResult.success) {
          await supabase.from("campaign_send_log")
            .update({
              status:  "sent",
              sent_at: now.toISOString(),
            })
            .eq("tracking_id", trackingId);

          const recipientUpdate: Record<string, unknown> = {
            status:  isSequence ? "pending" : "sent",
            sent_at: now.toISOString(),
          };
          if (isSequence) {
            recipientUpdate.current_step = stepNumber;
            if (stepNumber >= sequences.length) recipientUpdate.status = "completed";
          }
          await supabase.from("campaign_recipients")
            .update(recipientUpdate).eq("id", recipient.id);

          sentCount++;
        } else {
          // Mark log as failed with provider error
          await supabase.from("campaign_send_log")
            .update({ status: "failed", error_message: sendResult.error ?? "Unknown error" })
            .eq("tracking_id", trackingId);

          await supabase.from("campaign_recipients")
            .update({ status: "failed", last_error: sendResult.error ?? "Send failed" })
            .eq("id", recipient.id);

          failedCount++;
          console.error(`Send failed for ${recipient.email}:`, sendResult.error);
        }
      }

      // ── Update campaign sent_count + stats ────────────────────────────
      if (sentCount > 0) {
        await supabase.from("campaigns")
          .update({ sent_count: (campaign.sent_count ?? 0) + sentCount })
          .eq("id", campaign.id);
        await updateCampaignStats(supabase, campaign.id);
      }

      results.push({ campaign: campaign.name, sent: sentCount, failed: failedCount, skipped: skippedCount });
    }

    return json({ processed: results });
  } catch (error) {
    console.error("process-campaign-queue error:", error);
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function updateCampaignStats(supabase: any, campaignId: string) {
  const { data } = await supabase
    .from("campaign_send_log")
    .select("status, opened_at, clicked_at")
    .eq("campaign_id", campaignId);

  if (!data) return;

  const stats = {
    sent:       data.filter((r: any) => r.status === "sent").length,
    opened:     data.filter((r: any) => r.opened_at).length,
    clicked:    data.filter((r: any) => r.clicked_at).length,
    bounced:    data.filter((r: any) => r.status === "bounced").length,
  };

  await supabase.from("campaigns").update({ stats }).eq("id", campaignId);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
