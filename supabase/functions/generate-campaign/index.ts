import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Near-plain-text format instructions — used for all sequences and outreach/follow-up single campaigns.
// Research (Hunter, Instantly, Lemlist 2024-2025): HTML outreach emails bounce 674% more than plain text.
// Sequences without open tracking generate 68% higher reply rates. Apollo/Smartlead/Instantly all default to this format.
const TEXT_STYLE_FORMAT = `
EMAIL BODY FORMAT — NEAR-PLAIN-TEXT HTML (critical for deliverability):
- Use ONLY <p> and <a href="..."> and <br> tags. Nothing else.
- NO images, NO tables, NO divs, NO spans, NO inline CSS, NO background colors, NO decorative elements.
- NO bold or italic unless a single word truly needs emphasis (<strong> one word max).
- Should look exactly like a personal email typed by a human in Gmail.
- Structure: greeting <p>, 1-2 short body <p> paragraphs (under 75 words each), one CTA as a plain <a> link or text question, sign-off <p>.
- Keep total word count under 150 words. Short = higher reply rates.
`;

// Light branded HTML — used only for welcome and promotional campaigns where the recipient opted in.
// These land in Gmail Promotions tab (expected) or inbox for engaged lists.
const PROMO_HTML_FORMAT = `
EMAIL BODY FORMAT — LIGHT BRANDED HTML:
- Single-column centered layout using a <table> wrapper (max-width: 600px, margin: 0 auto).
- One optional header image: <img src="https://placehold.co/600x200/1a1a2e/ffffff?text=Your+Header+Image" alt="Header" style="width:100%;max-width:600px;display:block;border:0">
- Body copy in <p> tags with inline styles: font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:15px; line-height:1.6; color:#1a1a1a
- One clear CTA as a styled <a> button: background:#2563eb; color:#fff; padding:12px 28px; border-radius:6px; text-decoration:none; font-weight:600; display:inline-block
- Footer: small <p> with company name in muted color (#6b7280, font-size:12px)
- 60% text minimum. Max 1 image. No external CSS or scripts.
`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, segments, mode, emailCount } = await req.json();
    if (!prompt) {
      return new Response(JSON.stringify({ error: "Prompt is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const segmentContext = segments?.length
      ? `Available audience segments: ${segments.map((s: any) => `"${s.name}" (${s.estimatedCount} recipients, ${s.description})`).join(", ")}`
      : "";

    const isSequence = mode === "sequence" || (emailCount && emailCount > 1);
    const count = emailCount || 3;

    const systemPrompt = isSequence
      ? `You are a cold email and sales outreach expert for a business CRM platform.
Generate a complete multi-email sequence based on the user's request.

${segmentContext}

You MUST use the generate_sequence tool to return your response.
Generate ${count} emails following cold email best practices:
- Email 1: Introduction and value proposition. Short, personal, ask one question.
- Email 2: Follow up referencing email 1. Add social proof or a brief case study. Wait 2-3 days.
- Email 3: Different angle, share a relevant insight or resource. Wait 3-4 days.
- Email 4 (if needed): Create urgency or share a time-sensitive offer. Wait 4-5 days.
- Email 5 (if needed): Break-up email — last follow-up, often gets the highest reply rate. Wait 5-7 days.

Keep subject lines 6-10 words. Use a warm, direct, human tone.

${TEXT_STYLE_FORMAT}

Suggest optimal timing and the best matching audience segment.`

      : `You are a marketing campaign strategist for a business CRM platform.
Generate a complete email campaign based on the user's request.

${segmentContext}

You MUST use the generate_campaign tool to return your response. Generate compelling, professional content.
- Subject lines: 6-10 words, attention-grabbing but natural
- Determine the best category for this campaign (welcome, followup, promotional, educational, reactivation)
- Suggest the best matching segment from the available ones
- Suggest optimal send timing based on the campaign type

EMAIL BODY FORMAT — choose based on the category you select:
- If category is "welcome" or "promotional" (recipient opted in, expects branding):
${PROMO_HTML_FORMAT}
- If category is "followup", "educational", or "reactivation" (personal outreach):
${TEXT_STYLE_FORMAT}`;

    const tools = isSequence
      ? [{
          type: "function",
          function: {
            name: "generate_sequence",
            description: "Generate a complete multi-email campaign sequence",
            parameters: {
              type: "object",
              properties: {
                campaignName: { type: "string", description: "Short campaign name (3-6 words)" },
                category: { type: "string", enum: ["welcome", "followup", "promotional", "educational", "reactivation"] },
                suggestedSegment: { type: "string", description: "Name of the best matching segment" },
                sendTimeRecommendation: { type: "string", description: "When to start sending (e.g., 'Tuesday 10am')" },
                rationale: { type: "string", description: "Brief explanation of strategy (2-3 sentences)" },
                emails: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      step: { type: "number" },
                      subject: { type: "string" },
                      previewText: { type: "string", description: "Under 100 chars" },
                      bodyHtml: { type: "string", description: "Near-plain-text HTML: only <p>, <a>, <br> tags. No images, no tables, no inline CSS. Personal human email style." },
                      delayDays: { type: "number", description: "Days to wait after previous email (0 for first)" },
                      tip: { type: "string", description: "Brief best-practice tip for this step" },
                    },
                    required: ["step", "subject", "previewText", "bodyHtml", "delayDays", "tip"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["campaignName", "category", "suggestedSegment", "sendTimeRecommendation", "rationale", "emails"],
              additionalProperties: false,
            },
          },
        }]
      : [{
          type: "function",
          function: {
            name: "generate_campaign",
            description: "Generate a complete email campaign with all required fields",
            parameters: {
              type: "object",
              properties: {
                campaignName: { type: "string", description: "Short campaign name (3-6 words)" },
                subject: { type: "string", description: "Email subject line" },
                previewText: { type: "string", description: "Email preview text shown in inbox (under 100 chars)" },
                bodyHtml: { type: "string", description: "Email body HTML. Use near-plain-text for followup/educational/reactivation. Use light branded HTML for welcome/promotional." },
                category: { type: "string", enum: ["welcome", "followup", "promotional", "educational", "reactivation"] },
                suggestedSegment: { type: "string", description: "Name of the best matching segment" },
                sendTimeRecommendation: { type: "string", description: "When to send (e.g., 'Tuesday 10am')" },
                rationale: { type: "string", description: "Brief explanation of strategy choices (2-3 sentences)" },
              },
              required: ["campaignName", "subject", "previewText", "bodyHtml", "category", "suggestedSegment", "sendTimeRecommendation", "rationale"],
              additionalProperties: false,
            },
          },
        }];

    const toolChoice = isSequence
      ? { type: "function", function: { name: "generate_sequence" } }
      : { type: "function", function: { name: "generate_campaign" } };

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        tools,
        tool_choice: toolChoice,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in Settings → Workspace → Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      console.error("No tool call in response:", JSON.stringify(data));
      return new Response(JSON.stringify({ error: "AI did not generate a valid campaign" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const campaign = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(campaign), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-campaign error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
