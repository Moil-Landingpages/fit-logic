import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Fetch active FAQs
    const { data: faqs } = await sb.from("faqs").select("*").eq("active", true);

    const faqList = (faqs || [])
      .map((f: any, i: number) => `${i + 1}. Q: ${f.question}\n   A: ${f.answer}\n   Category: ${f.category}`)
      .join("\n\n");

    // Use Gemini to classify and match
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

    // Update the inquiry with classification
    const updates: Record<string, any> = {
      category: result.category || inquiry.category,
      category_confidence: result.confidence || 0.5,
      is_faq_match: result.is_faq_match || false,
    };

    if (result.is_faq_match && result.auto_response) {
      updates.response_text = result.auto_response;
      updates.status = "auto_responded";
      updates.resolved_at = new Date().toISOString();
    }

    if (result.needs_escalation) {
      updates.status = "escalated";
    }

    const { error: updateErr } = await sb
      .from("inquiries")
      .update(updates)
      .eq("id", inquiry_id);

    if (updateErr) throw updateErr;

    return new Response(
      JSON.stringify({ success: true, classification: result, updates }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
