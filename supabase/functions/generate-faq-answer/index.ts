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
    const { question, category } = await req.json();
    if (!question) throw new Error("question is required");

    const apiKey = Deno.env.get("LOVABLE_API_KEY")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Fetch existing FAQs for context
    const { data: existingFaqs } = await sb.from("faqs").select("question, answer, category").eq("active", true);

    const existingContext = (existingFaqs || [])
      .map((f: any) => `Q: ${f.question}\nA: ${f.answer}`)
      .join("\n\n");

    const prompt = `You are an expert FAQ writer for FitLogic, a functional medicine and wellness practice that helps clients optimize their health through personalized programs (Hormone Optimization, Gut Health Reset, Executive Wellness).

Business context:
- Located in Austin, TX (also serves clients virtually nationwide)
- Programs range from $1,500-$4,500
- Out-of-network provider, accepts HSA/FSA
- Comprehensive lab work included in all programs
- Focus on root-cause medicine, not band-aid solutions
- Discovery calls are free, 15 minutes

Existing FAQs for tone/style reference:
${existingContext}

Write a clear, helpful, and professional answer for this FAQ question. The answer should:
1. Be conversational but authoritative
2. Include specific details (numbers, timelines, steps) when relevant
3. End with a soft call-to-action when appropriate
4. Be 2-4 paragraphs max
5. Match the tone of existing FAQs

Category: ${category}
Question: ${question}

Respond with ONLY the answer text, no preamble.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You write clear, helpful FAQ answers for a functional medicine practice. Be specific, warm, and professional." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited — please try again in a moment" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted — please add funds" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const answer = aiData.choices?.[0]?.message?.content?.trim() || "";

    return new Response(
      JSON.stringify({ answer }),
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
