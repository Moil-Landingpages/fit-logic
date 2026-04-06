import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const now = new Date();
    const currentHour = now.getUTCHours(); // Note: adjust for timezone if needed
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const currentDay = dayNames[now.getUTCDay()];

    // Get all scheduled campaigns that are due
    const { data: campaigns, error: campErr } = await supabase
      .from("campaigns")
      .select("*")
      .in("status", ["scheduled", "sending"])
      .lte("scheduled_at", now.toISOString());

    if (campErr) throw campErr;
    if (!campaigns || campaigns.length === 0) {
      return new Response(JSON.stringify({ message: "No campaigns to process" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];

    for (const campaign of campaigns) {
      // Check business hours
      const bhStart = campaign.business_hours_start ?? 8;
      const bhEnd = campaign.business_hours_end ?? 18;
      const bizDays: string[] = campaign.business_days ?? ["Mon", "Tue", "Wed", "Thu", "Fri"];

      if (!bizDays.includes(currentDay)) {
        results.push({ campaign: campaign.name, skipped: "not a business day" });
        continue;
      }

      // Simple hour check (UTC - in production you'd want timezone support)
      if (currentHour < bhStart || currentHour >= bhEnd) {
        results.push({ campaign: campaign.name, skipped: "outside business hours" });
        continue;
      }

      const maxSends = campaign.max_sends_per_day ?? 50;

      // Count how many we've already sent today for this campaign
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

      // Mark campaign as sending
      if (campaign.status === "scheduled") {
        await supabase.from("campaigns").update({ status: "sending" }).eq("id", campaign.id);
      }

      // Determine which step to send for sequence campaigns
      const isSequence = campaign.campaign_type === "sequence";
      let sequences: any[] = [];
      if (isSequence) {
        const { data: seqs } = await supabase
          .from("campaign_sequences")
          .select("*")
          .eq("campaign_id", campaign.id)
          .order("step_number");
        sequences = seqs || [];
      }

      // Get template for single campaigns
      let templateSubject = "";
      let templateBody = "";
      if (!isSequence && campaign.template_id) {
        const { data: tmpl } = await supabase
          .from("email_templates")
          .select("subject, body_html")
          .eq("id", campaign.template_id)
          .single();
        if (tmpl) {
          templateSubject = tmpl.subject;
          templateBody = tmpl.body_html || "";
        }
      }

      // Get unsubscribed emails
      const { data: unsubs } = await supabase
        .from("campaign_unsubscribes")
        .select("email");
      const unsubEmails = new Set((unsubs || []).map(u => u.email.toLowerCase()));

      // Get pending recipients
      const { data: pendingRecipients } = await supabase
        .from("campaign_recipients")
        .select("*")
        .eq("campaign_id", campaign.id)
        .eq("status", "pending")
        .order("created_at")
        .limit(remaining);

      if (!pendingRecipients || pendingRecipients.length === 0) {
        // All recipients processed - mark campaign as sent
        await supabase.from("campaigns").update({
          status: "sent",
          sent_at: now.toISOString(),
        }).eq("id", campaign.id);
        results.push({ campaign: campaign.name, completed: true });
        continue;
      }

      let sentCount = 0;

      for (const recipient of pendingRecipients) {
        // Skip unsubscribed
        if (unsubEmails.has(recipient.email.toLowerCase())) {
          await supabase.from("campaign_recipients")
            .update({ status: "skipped", last_error: "Unsubscribed" })
            .eq("id", recipient.id);
          continue;
        }

        // Determine email content
        let subject = "";
        let bodyHtml = "";
        let stepNumber = 1;

        if (isSequence) {
          const currentStep = recipient.current_step ?? 0;
          const nextStep = sequences.find(s => s.step_number === currentStep + 1);
          
          if (!nextStep) {
            // All steps completed
            await supabase.from("campaign_recipients")
              .update({ status: "completed" })
              .eq("id", recipient.id);
            continue;
          }

          // Check if delay has passed since last send
          if (currentStep > 0 && nextStep.delay_days > 0) {
            const { data: lastSend } = await supabase
              .from("campaign_send_log")
              .select("sent_at")
              .eq("recipient_id", recipient.id)
              .eq("step_number", currentStep)
              .eq("status", "sent")
              .order("sent_at", { ascending: false })
              .limit(1)
              .single();

            if (lastSend?.sent_at) {
              const lastSentDate = new Date(lastSend.sent_at);
              const delayMs = nextStep.delay_days * 24 * 60 * 60 * 1000;
              if (now.getTime() - lastSentDate.getTime() < delayMs) {
                continue; // Skip - delay not elapsed yet
              }
            }
          }

          subject = nextStep.subject_override || "";
          bodyHtml = nextStep.body_html_override || "";
          stepNumber = nextStep.step_number;
        } else {
          subject = templateSubject;
          bodyHtml = templateBody;
        }

        if (!subject || !bodyHtml) {
          await supabase.from("campaign_recipients")
            .update({ status: "failed", last_error: "Missing email content" })
            .eq("id", recipient.id);
          continue;
        }

        // Create tracking record
        const trackingId = crypto.randomUUID();
        const projectId = supabaseUrl.replace("https://", "").replace(".supabase.co", "");
        const trackPixelUrl = `${supabaseUrl}/functions/v1/track-email?t=${trackingId}&a=open`;
        const unsubUrl = `${supabaseUrl}/functions/v1/campaign-unsubscribe?t=${trackingId}`;

        // Wrap links for click tracking
        const linkWrappedBody = bodyHtml.replace(
          /href="(https?:\/\/[^"]+)"/g,
          (match: string, url: string) => {
            const clickUrl = `${supabaseUrl}/functions/v1/track-email?t=${trackingId}&a=click&url=${encodeURIComponent(url)}`;
            return `href="${clickUrl}"`;
          }
        );

        // Add tracking pixel and unsubscribe footer
        const personalizedName = recipient.name || "there";
        const finalBody = `${linkWrappedBody}
<img src="${trackPixelUrl}" width="1" height="1" style="display:none" alt="" />
<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:center;font-size:11px;color:#9ca3af;">
  <a href="${unsubUrl}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a> from future emails
</div>`;

        // Log the send attempt
        await supabase.from("campaign_send_log").insert({
          campaign_id: campaign.id,
          recipient_id: recipient.id,
          step_number: stepNumber,
          status: "queued",
          tracking_id: trackingId,
        });

        // TODO: Actually send via Lovable Email infrastructure
        // For now, mark as sent (email domain setup will enable actual sending)
        await supabase.from("campaign_send_log")
          .update({ status: "sent", sent_at: now.toISOString() })
          .eq("tracking_id", trackingId);

        // Update recipient status
        const recipientUpdate: any = {
          status: isSequence ? "pending" : "sent",
          sent_at: now.toISOString(),
        };
        if (isSequence) {
          recipientUpdate.current_step = stepNumber;
          // Check if this was the last step
          if (stepNumber >= sequences.length) {
            recipientUpdate.status = "completed";
          }
        }
        await supabase.from("campaign_recipients")
          .update(recipientUpdate)
          .eq("id", recipient.id);

        sentCount++;
      }

      // Update campaign sent_count once after processing the whole batch
      if (sentCount > 0) {
        await supabase.from("campaigns")
          .update({ sent_count: (campaign.sent_count ?? 0) + sentCount })
          .eq("id", campaign.id);
      }

      results.push({ campaign: campaign.name, sent: sentCount });
    }

    return new Response(JSON.stringify({ processed: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("process-campaign-queue error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
