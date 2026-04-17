import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase";

async function sendViaResend(apiKey: string, from: string, to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
}

async function sendEmail(apiKey: string, from: string, to: string, subject: string, html: string) {
  return sendViaResend(apiKey, from, to, subject, html);
}

export async function POST(req: NextRequest) {
  try {
    const { inquiry_id } = await req.json();
    if (!inquiry_id) return NextResponse.json({ error: "inquiry_id required" }, { status: 400 });

    const sb = serverClient();
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) return NextResponse.json({ error: "GEMINI_API_KEY is not configured" }, { status: 500 });

    const { data: inquiry, error: iqErr } = await sb
      .from("inquiries")
      .select("*")
      .eq("id", inquiry_id)
      .single();
    if (iqErr || !inquiry) return NextResponse.json({ error: "Inquiry not found" }, { status: 404 });

    const [{ data: settings }, { data: faqs }] = await Promise.all([
      sb.from("practice_settings").select("email_provider_api_key, email_from_address, email_from_name, escalation_staff_id").limit(1).single(),
      sb.from("faqs").select("*").eq("active", true),
    ]);

    const emailApiKey: string = process.env.RESEND_API_KEY ?? settings?.email_provider_api_key ?? "";
    const fromAddress: string = settings?.email_from_address ?? "";
    const fromName: string = settings?.email_from_name ?? "FitLogic";
    const fromHeader = fromName ? `${fromName} <${fromAddress}>` : fromAddress;

    const faqList = (faqs || [])
      .map((f: { question: string; answer: string; category: string }, i: number) =>
        `${i + 1}. Q: ${f.question}\n   A: ${f.answer}\n   Category: ${f.category}`
      )
      .join("\n\n");

    const prompt = `You are an AI assistant for FitLogic, a functional medicine sales and client management platform. Analyze this incoming inquiry and:

1. Classify it into ONE category:
   - Appointment_Scheduling
   - Prescription_Lab_Requests
   - Health_Questions
   - Billing_Insurance
   - Urgent_Red_Flags
   - General_Info
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

    const aiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: "You are a helpful inquiry classifier. Always respond with valid JSON only, no markdown." }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      }
    );

    if (!aiResponse.ok) throw new Error(`Gemini API error: ${aiResponse.status} ${await aiResponse.text()}`);

    const aiData = await aiResponse.json();
    const rawText = aiData.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const result = JSON.parse(rawText);

    const updates: Record<string, unknown> = {
      category: result.category || inquiry.category,
      category_confidence: result.confidence ?? 0.5,
      is_faq_match: result.is_faq_match ?? false,
    };

    let emailSent = false;
    let emailError: string | null = null;

    if (result.is_faq_match && result.auto_response && inquiry.patient_email && !result.needs_escalation) {
      updates.response_text = result.auto_response;
      updates.status = "auto_responded";
      updates.resolved_at = new Date().toISOString();

      if (emailApiKey && fromAddress) {
        try {
          const html = `<p>Hi ${inquiry.patient_name ?? "there"},</p>
<p>${(result.auto_response as string).replace(/\n/g, "<br>")}</p>
<p style="margin-top:24px;font-size:12px;color:#888;">This is an automated response from FitLogic.</p>`;
          await sendEmail(emailApiKey, fromHeader, inquiry.patient_email, "Re: Your inquiry to FitLogic", html);
          emailSent = true;
        } catch (err) {
          emailError = err instanceof Error ? err.message : String(err);
          console.error("Auto-response email failed:", emailError);
        }
      }
    }

    if (result.needs_escalation) {
      updates.status = "escalated";
      if (emailApiKey && fromAddress && settings?.escalation_staff_id) {
        const { data: staffMember } = await sb
          .from("staff")
          .select("email, name")
          .eq("id", settings.escalation_staff_id)
          .maybeSingle();
        if (staffMember?.email) {
          try {
            const html = `<p>Hi ${(staffMember as Record<string, unknown>).name ?? "there"},</p>
<p>A new inquiry requires your attention:</p>
<ul>
  <li><strong>From:</strong> ${inquiry.patient_name} (${inquiry.patient_email ?? "no email"})</li>
  <li><strong>Category:</strong> ${result.category}</li>
</ul>
<blockquote style="border-left:3px solid #ccc;padding-left:12px;color:#444;">
  ${String(inquiry.raw_content).replace(/\n/g, "<br>")}
</blockquote>`;
            await sendEmail(emailApiKey, fromHeader, staffMember.email, `[FitLogic] Escalated inquiry from ${inquiry.patient_name}`, html);
          } catch (err) {
            console.error("Escalation notification failed:", err);
          }
        }
      }
    }

    const { error: updateErr } = await sb.from("inquiries").update(updates).eq("id", inquiry_id);
    if (updateErr) throw updateErr;

    return NextResponse.json({ success: true, classification: result, updates, emailSent, emailError });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
