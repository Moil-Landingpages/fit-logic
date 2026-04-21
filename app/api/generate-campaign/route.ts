import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType, FunctionCallingMode, type FunctionDeclaration } from "@google/generative-ai";
import { buildFitlogicKnowledgeContext } from "@/lib/fitlogic-knowledge";

const TEXT_STYLE_FORMAT = `
EMAIL BODY FORMAT — NEAR-PLAIN-TEXT HTML (critical for deliverability):
- Use ONLY <p> and <a href="..."> and <br> tags. Nothing else.
- NO images, NO tables, NO divs, NO spans, NO inline CSS, NO background colors, NO decorative elements.
- NO bold or italic unless a single word truly needs emphasis (<strong> one word max).
- Should look exactly like a personal email typed by a human in Gmail.
- Structure: greeting <p>, 1-2 short body <p> paragraphs (under 75 words each), one CTA as a plain <a> link or text question, sign-off <p>.
- Keep total word count under 150 words. Short = higher reply rates.
`;

const PROMO_HTML_FORMAT = `
EMAIL BODY FORMAT — LIGHT BRANDED HTML:
- Single-column centered layout using a <table> wrapper (max-width: 600px, margin: 0 auto).
- One optional header image placeholder.
- Body copy in <p> tags with inline styles: font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:15px; line-height:1.6; color:#1a1a1a
- One clear CTA as a styled <a> button: background:#2563eb; color:#fff; padding:12px 28px; border-radius:6px; text-decoration:none; font-weight:600; display:inline-block
- Footer: small <p> with company name in muted color (#6b7280, font-size:12px)
- 60% text minimum. Max 1 image. No external CSS or scripts.
`;

export async function POST(req: NextRequest) {
  try {
    const { prompt, segments, mode, emailCount } = await req.json();
    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: "GEMINI_API_KEY is not configured" }, { status: 500 });
    }

    const segmentContext = segments?.length
      ? `Available audience segments: ${segments.map((s: { name: string; estimatedCount: number; description: string }) => `"${s.name}" (${s.estimatedCount} recipients, ${s.description})`).join(", ")}`
      : "";

    const isSequence = mode === "sequence" || (emailCount && emailCount > 1);
    const count = emailCount || 3;
    const knowledgeContext = buildFitlogicKnowledgeContext(
      [prompt, segmentContext, mode].filter(Boolean).join("\n"),
      {
        intent: "campaign",
        heading: "Fit Logic brand and business context",
      },
    );

    const systemPrompt = isSequence
      ? `You are Fit Logic's email strategist. Generate a complete multi-email sequence based on the user's request.

Use the Fit Logic context below as your source of truth for brand positioning, services, audience, and tone.
If a detail is not in the user request, available segments, or the knowledge context, keep the copy general instead of inventing specifics.
Do not make medical guarantees, exaggerated claims, or unsupported statements about pricing, insurance, timelines, or locations.

${knowledgeContext}

${segmentContext}

Brand rules:
- Fit Logic is a functional medicine clinic focused on personalized, integrative care.
- Core offerings include BHRT, mindset coaching, gut health optimization, wellness retreats, fitness programs, and supplements.
- Default audience is adults seeking sustainable health improvement, especially around hormones, gut health, fatigue, chronic concerns, and preventive wellness.
- Tone should feel warm, human, educational, credible, and patient-centered.
- Emphasize personalized care, education, feeling heard, and long-term wellness.
- Avoid sounding like a generic SaaS CRM, hospital discharge note, or aggressive internet marketer.

You MUST use the generate_sequence tool to return your response.
Generate ${count} emails that build a cohesive sequence:
- Email 1: Clear introduction and value proposition. Short, personal, and asks one simple question.
- Email 2: Follow up naturally, referencing the first email. Add educational value, a patient-centered benefit, or gentle proof.
- Email 3: Use a new angle such as a different symptom cluster, lifestyle benefit, or service angle.
- Email 4 (if needed): Create relevant urgency or highlight a limited opportunity without sounding pushy.
- Email 5 (if needed): Close the loop with a respectful break-up email.

Keep subject lines 6-10 words. Keep each email distinct, helpful, and easy to reply to.

PERSONALIZATION (required):
- Always open the greeting with the recipient's first name using the variable {first_name} — e.g. "Hi {first_name}," or "Hey {first_name},"
- You may also use {first_name} once more naturally inside the body when it genuinely adds warmth.
- Do NOT use {name}, {last_name}, or any other variable — only {first_name}.
- These variables are substituted automatically at send time, so always include them in the generated HTML.

${TEXT_STYLE_FORMAT}

Suggest optimal timing and the best matching audience segment.`
      : `You are Fit Logic's campaign strategist. Generate a complete email campaign based on the user's request.

Use the Fit Logic context below as your source of truth for brand positioning, services, audience, and tone.
If a detail is not in the user request, available segments, or the knowledge context, keep the copy general instead of inventing specifics.
Do not make medical guarantees, exaggerated claims, or unsupported statements about pricing, insurance, timelines, or locations.

${knowledgeContext}

${segmentContext}

Brand rules:
- Fit Logic is a functional medicine clinic focused on personalized, integrative care.
- Core offerings include BHRT, mindset coaching, gut health optimization, wellness retreats, fitness programs, and supplements.
- Default audience is adults seeking sustainable health improvement, especially around hormones, gut health, fatigue, chronic concerns, and preventive wellness.
- Tone should feel warm, human, educational, credible, and patient-centered.
- Emphasize personalized care, education, feeling heard, and long-term wellness.
- Avoid sounding like a generic SaaS CRM, hospital discharge note, or aggressive internet marketer.

You MUST use the generate_campaign tool to return your response. Generate compelling, Fit Logic-specific content.
- Subject lines: 6-10 words, attention-grabbing but natural
- Determine the best category for this campaign (welcome, followup, promotional, educational, reactivation)
- Suggest the best matching segment from the available ones when possible
- Suggest optimal send timing based on the campaign type
- Match the message to the most relevant Fit Logic service, audience need, or lifecycle moment

PERSONALIZATION (required):
- Always open the greeting with the recipient's first name using the variable {first_name} — e.g. "Hi {first_name}," or "Hey {first_name},"
- You may also use {first_name} once more naturally inside the body when it genuinely adds warmth.
- Do NOT use {name}, {last_name}, or any other variable — only {first_name}.
- These variables are substituted automatically at send time, so always include them in the generated HTML.

EMAIL BODY FORMAT — choose based on the category you select:
- If category is "welcome" or "promotional" (recipient opted in, expects branding):
${PROMO_HTML_FORMAT}
- If category is "followup", "educational", or "reactivation" (personal outreach):
${TEXT_STYLE_FORMAT}`;

    const fnDeclaration = isSequence
      ? {
          name: "generate_sequence",
          description: "Generate a complete multi-email campaign sequence",
          parameters: {
            type: SchemaType.OBJECT,
            properties: {
              campaignName: { type: SchemaType.STRING },
              category: { type: SchemaType.STRING, enum: ["welcome", "followup", "promotional", "educational", "reactivation"] },
              suggestedSegment: { type: SchemaType.STRING },
              sendTimeRecommendation: { type: SchemaType.STRING },
              rationale: { type: SchemaType.STRING },
              emails: {
                type: SchemaType.ARRAY,
                items: {
                  type: SchemaType.OBJECT,
                  properties: {
                    step: { type: SchemaType.NUMBER },
                    subject: { type: SchemaType.STRING },
                    previewText: { type: SchemaType.STRING },
                    bodyHtml: { type: SchemaType.STRING },
                    delayDays: { type: SchemaType.NUMBER },
                    tip: { type: SchemaType.STRING },
                  },
                  required: ["step", "subject", "previewText", "bodyHtml", "delayDays", "tip"],
                },
              },
            },
            required: ["campaignName", "category", "suggestedSegment", "sendTimeRecommendation", "rationale", "emails"],
          },
        }
      : {
          name: "generate_campaign",
          description: "Generate a complete email campaign with all required fields",
          parameters: {
            type: SchemaType.OBJECT,
            properties: {
              campaignName: { type: SchemaType.STRING },
              subject: { type: SchemaType.STRING },
              previewText: { type: SchemaType.STRING },
              bodyHtml: { type: SchemaType.STRING },
              category: { type: SchemaType.STRING, enum: ["welcome", "followup", "promotional", "educational", "reactivation"] },
              suggestedSegment: { type: SchemaType.STRING },
              sendTimeRecommendation: { type: SchemaType.STRING },
              rationale: { type: SchemaType.STRING },
            },
            required: ["campaignName", "subject", "previewText", "bodyHtml", "category", "suggestedSegment", "sendTimeRecommendation", "rationale"],
          },
        };

    const toolName = isSequence ? "generate_sequence" : "generate_campaign";

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    
    const model = genAI.getGenerativeModel({
      model: "gemini-3-flash-preview",
      systemInstruction: systemPrompt,
      tools: [{ functionDeclarations: [fnDeclaration as unknown as FunctionDeclaration] }],
      toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.ANY, allowedFunctionNames: [toolName] } },
    });

    const result = await model.generateContent(prompt);
    const candidate = result.response.candidates?.[0];
    const fnCallPart = candidate?.content?.parts?.find((p) => p.functionCall?.args);
    const fnArgs = fnCallPart?.functionCall?.args;

    if (!fnArgs) {
      console.error("Gemini response:", JSON.stringify(result.response, null, 2));
      return NextResponse.json({ error: "AI did not generate a valid campaign" }, { status: 500 });
    }

    return NextResponse.json(fnArgs);
  } catch (e) {
    console.error("generate-campaign error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
