import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType, FunctionCallingMode, type FunctionDeclaration } from "@google/generative-ai";

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
