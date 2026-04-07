import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// Email helpers (mirrors process-campaign-queue adapters)
// ---------------------------------------------------------------------------
async function sendViaResend(
  apiKey: string,
  from: string,
  to: string,
  subject: string,
  html: string
): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Resend error ${res.status}: ${txt}`);
  }
}

async function sendViaSendGrid(
  apiKey: string,
  from: string,
  to: string,
  subject: string,
  html: string
): Promise<void> {
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from },
      subject,
      content: [{ type: "text/html", value: html }],
    }),
  });
  if (res.status !== 202) {
    const txt = await res.text();
    throw new Error(`SendGrid error ${res.status}: ${txt}`);
  }
}

async function sendEmail(
  provider: string,
  apiKey: string,
  from: string,
  to: string,
  subject: string,
  html: string
): Promise<void> {
  if (provider === "sendgrid") {
    await sendViaSendGrid(apiKey, from, to, subject, html);
  } else {
    // Default: resend
    await sendViaResend(apiKey, from, to, subject, html);
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { inquiry_id } = await req.json();
    if (!inquiry_id) throw new Error("inquiry_id required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiKey = Deno.env.get("LOVABLE_API_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Fetch the inquiry
    const { data: inquiry, error: iqErr } = await sb
      .from("inquiries")
      .select("*")
      .eq("id", inquiry_id)
      .single();
    if (iqErr || !inquiry) throw new Error("Inquiry not found");

    // Fetch practice settings (email provider) and active FAQs in parallel
    const [{ data: settings }, { data: faqs }] = await Promise.all([
      sb.from("practice_settings").select("*").limit(1).single(),
      sb.from("faqs").select("*").eq("active", true),
    ]);

    const emailProvider: string = settings?.email_provider ?? "resend";
    const emailApiKey: string = settings?.email_provider_api_key ?? "";
    const fromAddress: string = settings?.email_from_address ?? "";
    const fromName: string = settings?.email_from_name ?? "FitLogic";
    const fromHeader = fromName ? `${fromName} <${fromAddress}>` : fromAddress;

    const faqList = (faqs || [])
      .map((f: Record<string, string>, i: number) =>
        `${i + 1}. Q: ${f.question}\n   A: ${f.answer}\n   Category: ${f.category}`
      )
      .join("\n\n");

    // ---------------------------------------------------------------------------
    // AI classification
    // ---------------------------------------------------------------------------
    const prompt = `You are an AI assistant for FitLogic, a functional medicine sales and client management platform. Analyze this incoming inquiry and:

1. Classify it into ONE category:
   - Appointment_Scheduling (consultations, discovery calls, booking)
   - Prescription_Lab_Requests (services, programs, lab work, protocols)
   - Health_Questions (results, outcomes, expectations, success stories)
   - Billing_Insurance (pricing, payment plans, insurance, HSA/FSA)
   - Urgent_Red_Flags (urgent health concerns, emergencies, escalations)
   - General_Info (office hours, location, getting started, referrals)
2. Rate your confidence (0.0-1.0)
3. Check if it matches any FAQ below. If yes, provide the FAQ answer.
4. Determine if this needs human attention or can be auto-responded.

INQUIRY:
From: ${inquiry.patient_name} (${inquiry.patient_email || "no email"})
Source: ${inquiry.source}
Content: ${inquiry.raw_content}

AVAILABLE FAQs:
${faqList || "No FAQs configured yet."}

Respond in JSON format:
{
  "category": "one of the categories above",
  "confidence": 0.0-1.0,
  "is_faq_match": true/false,
  "auto_response": "the response text if FAQ match, or null",
  "needs_escalation": true/false,
  "reasoning": "brief explanation"
}`;

    const aiResponse = await fetch("https://ai.lovable.dev/api/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a helpful inquiry classifier. Always respond with valid JSON only." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      throw new Error(`AI API error: ${aiResponse.status} ${errText}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "{}";
    const result = JSON.parse(content);

    // ---------------------------------------------------------------------------
    // Build DB update
    // ---------------------------------------------------------------------------
    const updates: Record<string, unknown> = {
      category: result.category || inquiry.category,
      category_confidence: result.confidence ?? 0.5,
      is_faq_match: result.is_faq_match ?? false,
    };

    let emailSent = false;
    let emailError: string | null = null;

    // ---------------------------------------------------------------------------
    // Auto-respond via email if FAQ match and patient has an email
    // ---------------------------------------------------------------------------
    if (result.is_faq_match && result.auto_response && inquiry.patient_email) {
      updates.response_text = result.auto_response;
      updates.status = "auto_responded";
      updates.resolved_at = new Date().toISOString();

      if (emailApiKey && fromAddress) {
        try {
          const html = `<p>Hi ${inquiry.patient_name ?? "there"},</p>
<p>${(result.auto_response as string).replace(/\n/g, "<br>")}</p>
<p style="margin-top:24px;font-size:12px;color:#888;">
  This is an automated response from FitLogic.
  If you have additional questions, please reply to this email.
</p>`;
          await sendEmail(
            emailProvider,
            emailApiKey,
            fromHeader,
            inquiry.patient_email,
            "Re: Your inquiry to FitLogic",
            html
          );
          emailSent = true;
        } catch (err) {
          emailError = err instanceof Error ? err.message : String(err);
          console.error("Auto-response email failed:", emailError);
          // Still mark auto_responded in DB — email failure is non-fatal
        }
      }
    }

    // ---------------------------------------------------------------------------
    // Escalate if needed
    // ---------------------------------------------------------------------------
    if (result.needs_escalation) {
      updates.status = "escalated";

      // Notify escalation staff if configured
      if (emailApiKey && fromAddress && settings?.escalation_staff_id) {
        const { data: staffMember } = await sb
          .from("staff")
          .select("email, first_name")
          .eq("id", settings.escalation_staff_id)
          .maybeSingle();

        if (staffMember?.email) {
          try {
            const html = `<p>Hi ${staffMember.first_name ?? "there"},</p>
<p>A new inquiry requires your attention:</p>
<ul>
  <li><strong>From:</strong> ${inquiry.patient_name} (${inquiry.patient_email ?? "no email"})</li>
  <li><strong>Source:</strong> ${inquiry.source}</li>
  <li><strong>Category:</strong> ${result.category}</li>
  <li><strong>Reason:</strong> ${result.reasoning ?? "Flagged for escalation"}</li>
</ul>
<p><strong>Message:</strong></p>
<blockquote style="border-left:3px solid #ccc;padding-left:12px;color:#444;">
  ${String(inquiry.raw_content).replace(/\n/g, "<br>")}
</blockquote>
<p>Please log in to FitLogic to respond.</p>`;
            await sendEmail(
              emailProvider,
              emailApiKey,
              fromHeader,
              staffMember.email,
              `[FitLogic] Escalated inquiry from ${inquiry.patient_name}`,
              html
            );
          } catch (err) {
            console.error("Escalation notification email failed:", err instanceof Error ? err.message : err);
          }
        }
      }
    }

    const { error: updateErr } = await sb
      .from("inquiries")
      .update(updates)
      .eq("id", inquiry_id);

    if (updateErr) throw updateErr;

    return new Response(
      JSON.stringify({ success: true, classification: result, updates, emailSent, emailError }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
