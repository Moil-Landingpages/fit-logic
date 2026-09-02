import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType, FunctionCallingMode, type FunctionDeclaration } from "@google/generative-ai";
import { buildFitlogicKnowledgeContext } from "@/lib/fitlogic-knowledge";
import { serverClient } from "@/lib/supabase";
import { brandKitFromSettings, DEFAULT_BRAND_KIT, resolveDesign, type NewsletterDesign } from "@/lib/newsletter-brand";
import { normalizeSections, renderSections } from "@/lib/newsletter-render";

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

/**
 * Anti-fabrication rules. The client reported the wizard inventing a month
 * ("September Science-Backed Wellness Newsletter") that appeared in neither the
 * prompt nor the source article. For patient-facing health content that is a
 * compliance problem, not a cosmetic one — so grounding is now explicit, and
 * anything the model could not ground gets reported back for human review.
 */
const GROUNDING_RULES = `
FACTUAL GROUNDING — NON-NEGOTIABLE (patient-facing health content):
- NEVER invent a month, season, date, issue number, or year. If the user did not supply one, omit it entirely from the title, subject line and body.
- NEVER invent statistics, percentages, study results, sample sizes, or citations. Only use numbers that appear verbatim in the SOURCE MATERIAL or the user's prompt.
- NEVER invent named studies, institutions, practitioners, testimonials, patient stories, prices, insurance details, timelines, guarantees, or locations.
- NEVER state a medical claim as certain. Use "may", "can", "some people find" — and only for mechanisms present in the source material or the Fit Logic context.
- Do not name specific supplements, dosages, or protocols unless they appear in the source material.
- If a section would need a fact you do not have, write the section without it or leave a clearly-marked placeholder in square brackets (e.g. "[add your clinic's stat here]") rather than guessing.
- Every claim you output must be traceable to (a) the SOURCE MATERIAL, (b) the user's prompt, or (c) the Fit Logic brand context. Nothing else.

REPORTING (required):
- List in "factsUsed" every specific factual claim, number, or study reference you included, and where it came from.
- List in "unverifiedClaims" anything a human must confirm before this is sent to patients — including anything you generalised, any wellness claim, and any placeholder you left. If you genuinely used no external facts, return an empty list.
`;

const STRICT_SOURCE_RULES = `
STRICT SOURCE MODE IS ON:
- The SOURCE MATERIAL below is the ONLY permitted source of factual content, statistics, mechanisms, and claims.
- You may rewrite, reorganise, summarise and add connective/brand copy, but you may NOT add any new fact that is not in the source.
- If the source does not support a section you were asked to write, produce that section as brand/educational framing with no factual claims, and add a note to "unverifiedClaims".
- Set "groundedInSource" to true only if every factual statement traces to the source material.
`;

/** Newsletter structure contract — used for the sectioned newsletter path. */
function buildNewsletterFormat(opts: {
  sectionCount: number;
  includeHeroImage: boolean;
  includeCtaButton: boolean;
  imageDirectives: string;
  designNotes: string;
}) {
  return `
NEWSLETTER STRUCTURE — return SECTIONS, not styled HTML.
You are writing a monthly newsletter for an existing, opted-in audience. Do NOT compress the source into a short email; this should read like a real newsletter issue.

Produce a "sections" array in this order:
1. ${opts.includeHeroImage ? `A "hero_image" section with an imagePrompt describing the photo to use.` : `(no hero image requested — skip)`}
2. An "intro" section: 2-3 sentences that set up the topic and speak directly to the reader.
3. ${opts.sectionCount} "article" section(s): the main content, each with a heading and 2-3 paragraphs.
4. A "key_insights" section: heading plus 3-5 short, scannable bullets.
5. A "did_you_know" section: one short, interesting, source-supported fact framed as a callout. Omit this section entirely if you have no source-supported fact — do NOT invent one.
6. An "approach" section titled around how Fit Logic approaches this topic: heading plus bullets or a short paragraph.
7. ${opts.includeCtaButton ? `A "cta" section with one sentence of lead-in, a ctaLabel of 3-5 words, and the CTA destination.` : `A closing "custom" section with a soft, single call to action in the copy.`}

SECTION FIELD RULES:
- "paragraphs" and "bullets" are PLAIN TEXT ONLY. No HTML tags, no markdown, no asterisks — the app renders the styling.
- "heading" is a short phrase in sentence case, no emoji.
- Set "imagePrompt" on any section that should carry a photo. Describe the photo concretely.
${opts.imageDirectives}
${opts.designNotes}
`;
}

const ALLOWED_EMAIL_TYPES = ["cold_outreach", "newsletter", "educational", "reengagement", "promotional"] as const;
type EmailType = (typeof ALLOWED_EMAIL_TYPES)[number];

/** Trim source material so a pasted article can't blow the context budget. */
const MAX_SOURCE_CHARS = 24_000;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      prompt,
      segments,
      mode,
      emailCount,
      emailType,
      ctaUrl,
      // Newsletter additions
      sourceMaterial,
      strictGrounding,
      design,
      issueLabel,
      imageDirectives,
      sectionCount,
      includeHeroImage,
      includeCtaButton,
      designNotes,
    } = body ?? {};

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    // A2.5 — campaign type biases the system prompt. Validate to a known set
    // so a typo upstream doesn't poison the model context.
    const safeEmailType: EmailType | null =
      typeof emailType === "string" && (ALLOWED_EMAIL_TYPES as readonly string[]).includes(emailType)
        ? (emailType as EmailType)
        : null;

    const emailTypeBlock = safeEmailType
      ? (() => {
          switch (safeEmailType) {
            case "cold_outreach":
              return "EMAIL TYPE: Cold outreach. Recipient does not yet know Fit Logic. Lead with a question hook (\"Are you still struggling with…\", \"You may be wondering why…\"). Make the email about the recipient, not about Megan or the practice. Avoid \"I wanted to share\" or \"I want to tell you\" openers — they feel practitioner-centric.";
            case "newsletter":
              return "EMAIL TYPE: Newsletter. Existing opted-in audience. Warm, editorial, educational. Lead with one short observation, then developed sections. End with a single soft CTA.";
            case "educational":
              return "EMAIL TYPE: Educational. Teach one thing well. Open with a question or quick anecdote, explain the mechanism plainly, end with a soft CTA to learn more.";
            case "reengagement":
              return "EMAIL TYPE: Re-engagement. Recipient went quiet. Keep it short and human. Acknowledge time has passed. Offer one easy way back in (book a call, reply with a question).";
            case "promotional":
              return "EMAIL TYPE: Promotional. Time-bound offer. State the offer in plain English in the first sentence. Clear CTA. Avoid all-caps and aggressive scarcity language.";
          }
        })()
      : "";

    const brandVoiceGuardrail = `BRAND VOICE GUARDRAILS (apply to every email you generate):
- Make the email about the RECIPIENT, not the practitioner. Default to "you" framing, not "I want to share" / "I'm writing to tell you".
- Prefer question hooks for cold audiences ("Are you still…", "You may be wondering…", "What if…").
- Avoid "I wanted to share a quick thought", "I want to tell you about", and similar practitioner-centric openers.
- Avoid hospital-discharge tone, generic SaaS phrasing, and aggressive marketer hype.
- One clear, single CTA per email.`;

    const ctaUrlBlock = typeof ctaUrl === "string" && ctaUrl.startsWith("http")
      ? `CTA DESTINATION: Use this exact URL on the call-to-action button — do not invent or modify it: ${ctaUrl}`
      : "";

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: "GEMINI_API_KEY is not configured" }, { status: 500 });
    }

    const segmentContext = segments?.length
      ? `Available audience segments: ${segments.map((s: { name: string; estimatedCount: number; description: string }) => `"${s.name}" (${s.estimatedCount} recipients, ${s.description})`).join(", ")}`
      : "";

    // Newsletter mode is explicit — it is no longer inferred from the category
    // the model happens to pick. That inference is why the same prompt produced
    // a branded email with an image placeholder one run and a bare plain-text
    // email the next: category "promotional" got the HTML format while
    // "educational" got the no-images text format.
    const isNewsletter = mode === "newsletter" || safeEmailType === "newsletter";
    const isSequence = !isNewsletter && (mode === "sequence" || (emailCount && emailCount > 1));
    const count = emailCount || 3;

    const trimmedSource =
      typeof sourceMaterial === "string" && sourceMaterial.trim()
        ? sourceMaterial.trim().slice(0, MAX_SOURCE_CHARS)
        : "";
    const useStrictSource = Boolean(strictGrounding) && trimmedSource.length > 0;

    const sourceBlock = trimmedSource
      ? `SOURCE MATERIAL (the article/notes the user supplied — treat as the factual basis for this newsletter):\n"""\n${trimmedSource}\n"""`
      : `SOURCE MATERIAL: none supplied. You have NO article to draw facts from — write educational framing only and put every claim that would need verification into "unverifiedClaims".`;

    const knowledgeContext = buildFitlogicKnowledgeContext(
      [prompt, segmentContext, mode].filter(Boolean).join("\n"),
      { intent: "campaign", heading: "Fit Logic brand and business context" },
    );

    const BRAND_RULES = `Brand rules:
- Fit Logic is a functional medicine clinic focused on personalized, integrative care.
- Core offerings include BHRT, mindset coaching, gut health optimization, wellness retreats, fitness programs, and supplements.
- Default audience is adults seeking sustainable health improvement, especially around hormones, gut health, fatigue, chronic concerns, and preventive wellness.
- Tone should feel warm, human, educational, credible, and patient-centered.
- Emphasize personalized care, education, feeling heard, and long-term wellness.
- Avoid sounding like a generic SaaS CRM, hospital discharge note, or aggressive internet marketer.`;

    const PERSONALIZATION = `PERSONALIZATION (required):
- Always open the greeting with the recipient's first name using the variable {first_name} — e.g. "Hi {first_name}," or "Hey {first_name},"
- You may also use {first_name} once more naturally inside the body when it genuinely adds warmth.
- Do NOT use {name}, {last_name}, or any other variable — only {first_name}.
- These variables are substituted automatically at send time, so always include them in the generated HTML.`;

    /* ---------------------------------------------------------------- */
    /* Newsletter path — structured sections + deterministic rendering   */
    /* ---------------------------------------------------------------- */
    if (isNewsletter) {
      const safeSectionCount = Math.min(5, Math.max(1, Number(sectionCount) || 2));
      const wantsHero = includeHeroImage !== false;
      const wantsCta = includeCtaButton !== false;

      const imageDirectiveBlock =
        typeof imageDirectives === "string" && imageDirectives.trim()
          ? `- The user asked for these specific images. Honour them via imagePrompt on the right sections: ${imageDirectives.trim()}`
          : "";
      const designNoteBlock =
        typeof designNotes === "string" && designNotes.trim()
          ? `\nDESIGN DIRECTION FROM THE USER (affects copy length and emphasis; the app applies the actual colors and fonts): ${designNotes.trim()}`
          : "";

      const issueBlock = issueLabel && String(issueLabel).trim()
        ? `ISSUE LABEL: The user supplied "${String(issueLabel).trim()}". Use it verbatim where an issue label belongs. Do not alter or extend it.`
        : `ISSUE LABEL: none supplied. Do NOT put a month, season, or issue number in the title or subject line.`;

      const systemPrompt = `You are Fit Logic's newsletter editor. Produce one monthly newsletter issue.

Use the Fit Logic context below as your source of truth for brand positioning, services, audience, and tone.

${knowledgeContext}

${segmentContext}

${BRAND_RULES}

${issueBlock}

${sourceBlock}

${GROUNDING_RULES}
${useStrictSource ? STRICT_SOURCE_RULES : ""}

${emailTypeBlock}

${brandVoiceGuardrail}

${ctaUrlBlock}

${PERSONALIZATION}

${buildNewsletterFormat({
  sectionCount: safeSectionCount,
  includeHeroImage: wantsHero,
  includeCtaButton: wantsCta,
  imageDirectives: imageDirectiveBlock,
  designNotes: designNoteBlock,
})}

You MUST use the generate_newsletter tool to return your response.`;

      const fn: FunctionDeclaration = {
        name: "generate_newsletter",
        description: "Generate one structured newsletter issue",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            campaignName: { type: SchemaType.STRING, description: "Internal name. No invented month unless the user supplied one." },
            title: { type: SchemaType.STRING, description: "Newsletter headline shown in the branded header." },
            subject: { type: SchemaType.STRING },
            previewText: { type: SchemaType.STRING },
            suggestedSegment: { type: SchemaType.STRING },
            sendTimeRecommendation: { type: SchemaType.STRING },
            rationale: { type: SchemaType.STRING },
            groundedInSource: { type: SchemaType.BOOLEAN, description: "True only if every factual statement traces to the supplied source material." },
            factsUsed: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
            unverifiedClaims: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
            sections: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  kind: {
                    type: SchemaType.STRING,
                    enum: ["intro", "hero_image", "article", "key_insights", "did_you_know", "approach", "provider_message", "announcement", "cta", "custom"],
                  },
                  heading: { type: SchemaType.STRING },
                  paragraphs: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
                  bullets: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
                  imagePrompt: { type: SchemaType.STRING },
                  ctaLabel: { type: SchemaType.STRING },
                  ctaUrl: { type: SchemaType.STRING },
                },
                required: ["kind"],
              },
            },
          },
          required: [
            "campaignName", "title", "subject", "previewText", "suggestedSegment",
            "sendTimeRecommendation", "rationale", "sections", "factsUsed", "unverifiedClaims", "groundedInSource",
          ],
        },
      } as unknown as FunctionDeclaration;

      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({
        model: "gemini-3-flash-preview",
        systemInstruction: systemPrompt,
        tools: [{ functionDeclarations: [fn] }],
        toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.ANY, allowedFunctionNames: ["generate_newsletter"] } },
        // Low temperature in strict mode: less improvisation means fewer
        // invented dates and statistics.
        generationConfig: { temperature: useStrictSource ? 0.2 : 0.7 },
      });

      const result = await model.generateContent(prompt);
      const fnArgs = result.response.candidates?.[0]?.content?.parts?.find((p) => p.functionCall?.args)?.functionCall?.args as
        | Record<string, unknown>
        | undefined;

      if (!fnArgs) {
        console.error("generate-campaign: no newsletter function call returned");
        return NextResponse.json({ error: "AI did not generate a valid newsletter" }, { status: 500 });
      }

      // Brand kit drives the deterministic render, so every issue looks the
      // same regardless of how the prompt was phrased.
      let brand = DEFAULT_BRAND_KIT;
      try {
        const sb = serverClient();
        const { data: settings } = await sb.from("practice_settings").select("*").limit(1).maybeSingle();
        brand = brandKitFromSettings(settings);
      } catch (e) {
        console.error("generate-campaign: brand kit load failed, using defaults", e);
      }

      const sections = normalizeSections(fnArgs.sections);
      if (!sections.length) {
        return NextResponse.json({ error: "AI returned no newsletter sections" }, { status: 500 });
      }

      // Backfill the CTA destination the user picked if the model omitted it.
      if (typeof ctaUrl === "string" && ctaUrl.startsWith("http")) {
        for (const s of sections) {
          if ((s.kind === "cta" || s.ctaLabel) && !s.ctaUrl) s.ctaUrl = ctaUrl;
        }
      }

      // A button with no destination renders as href="#": it looks fine in the
      // preview, does nothing when clicked, and is skipped by click tracking so
      // it reads as "nobody clicked" rather than "the button was broken".
      // Surface it on the checklist the user has to acknowledge.
      const extraWarnings: string[] = [];
      const deadCta = sections.some(
        (s) => (s.kind === "cta" || s.ctaLabel) && !(typeof s.ctaUrl === "string" && /^https?:\/\//i.test(s.ctaUrl)),
      );
      if (deadCta) {
        extraWarnings.push(
          "The call-to-action button has no destination link yet. Set one in the editor (or pick a saved CTA link) before sending — it will otherwise do nothing when clicked.",
        );
      }

      const resolvedDesign = resolveDesign(brand, (design ?? null) as NewsletterDesign | null);
      const bodyHtml = renderSections({ sections, brand, design: resolvedDesign });

      return NextResponse.json({
        kind: "newsletter",
        campaignName: fnArgs.campaignName,
        title: fnArgs.title,
        subject: fnArgs.subject,
        previewText: fnArgs.previewText,
        category: "educational",
        suggestedSegment: fnArgs.suggestedSegment,
        sendTimeRecommendation: fnArgs.sendTimeRecommendation,
        rationale: fnArgs.rationale,
        sections,
        bodyHtml,
        design: resolvedDesign,
        issueLabel: issueLabel ?? null,
        verification: {
          groundedInSource: Boolean(fnArgs.groundedInSource) && useStrictSource,
          hadSourceMaterial: trimmedSource.length > 0,
          strictMode: useStrictSource,
          factsUsed: Array.isArray(fnArgs.factsUsed) ? fnArgs.factsUsed : [],
          unverifiedClaims: [
            ...(Array.isArray(fnArgs.unverifiedClaims) ? (fnArgs.unverifiedClaims as string[]) : []),
            ...extraWarnings,
          ],
        },
      });
    }

    /* ---------------------------------------------------------------- */
    /* Existing single-email / sequence paths (unchanged behaviour)      */
    /* ---------------------------------------------------------------- */
    const systemPrompt = isSequence
      ? `You are Fit Logic's email strategist. Generate a complete multi-email sequence based on the user's request.

Use the Fit Logic context below as your source of truth for brand positioning, services, audience, and tone.
If a detail is not in the user request, available segments, or the knowledge context, keep the copy general instead of inventing specifics.
Do not make medical guarantees, exaggerated claims, or unsupported statements about pricing, insurance, timelines, or locations.

${knowledgeContext}

${segmentContext}

${BRAND_RULES}

${sourceBlock}

${GROUNDING_RULES}
${useStrictSource ? STRICT_SOURCE_RULES : ""}

You MUST use the generate_sequence tool to return your response.
Generate ${count} emails that build a cohesive sequence:
- Email 1: Clear introduction and value proposition. Short, personal, and asks one simple question.
- Email 2: Follow up naturally, referencing the first email. Add educational value, a patient-centered benefit, or gentle proof.
- Email 3: Use a new angle such as a different symptom cluster, lifestyle benefit, or service angle.
- Email 4 (if needed): Create relevant urgency or highlight a limited opportunity without sounding pushy.
- Email 5 (if needed): Close the loop with a respectful break-up email.

Keep subject lines 6-10 words. Keep each email distinct, helpful, and easy to reply to.

${emailTypeBlock}

${brandVoiceGuardrail}

${ctaUrlBlock}

${PERSONALIZATION}

${TEXT_STYLE_FORMAT}

Suggest optimal timing and the best matching audience segment.`
      : `You are Fit Logic's campaign strategist. Generate a complete email campaign based on the user's request.

Use the Fit Logic context below as your source of truth for brand positioning, services, audience, and tone.
If a detail is not in the user request, available segments, or the knowledge context, keep the copy general instead of inventing specifics.
Do not make medical guarantees, exaggerated claims, or unsupported statements about pricing, insurance, timelines, or locations.

${knowledgeContext}

${segmentContext}

${BRAND_RULES}

${sourceBlock}

${GROUNDING_RULES}
${useStrictSource ? STRICT_SOURCE_RULES : ""}

You MUST use the generate_campaign tool to return your response. Generate compelling, Fit Logic-specific content.
- Subject lines: 6-10 words, attention-grabbing but natural
- Determine the best category for this campaign (welcome, followup, promotional, educational, reactivation)
- Suggest the best matching segment from the available ones when possible
- Suggest optimal send timing based on the campaign type
- Match the message to the most relevant Fit Logic service, audience need, or lifecycle moment

${emailTypeBlock}

${brandVoiceGuardrail}

${ctaUrlBlock}

${PERSONALIZATION}

EMAIL BODY FORMAT — choose based on the category you select:
- If category is "welcome" or "promotional" (recipient opted in, expects branding):
${PROMO_HTML_FORMAT}
- If category is "followup", "educational", or "reactivation" (personal outreach):
${TEXT_STYLE_FORMAT}`;

    // factsUsed / unverifiedClaims are appended to both legacy schemas so the
    // review step can show the same verification checklist everywhere.
    const auditProps = {
      factsUsed: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
      unverifiedClaims: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    };

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
              ...auditProps,
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
            required: ["campaignName", "category", "suggestedSegment", "sendTimeRecommendation", "rationale", "emails", "factsUsed", "unverifiedClaims"],
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
              ...auditProps,
            },
            required: ["campaignName", "subject", "previewText", "bodyHtml", "category", "suggestedSegment", "sendTimeRecommendation", "rationale", "factsUsed", "unverifiedClaims"],
          },
        };

    const toolName = isSequence ? "generate_sequence" : "generate_campaign";

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

    const model = genAI.getGenerativeModel({
      model: "gemini-3-flash-preview",
      systemInstruction: systemPrompt,
      tools: [{ functionDeclarations: [fnDeclaration as unknown as FunctionDeclaration] }],
      toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.ANY, allowedFunctionNames: [toolName] } },
      generationConfig: { temperature: useStrictSource ? 0.2 : 0.7 },
    });

    const result = await model.generateContent(prompt);
    const candidate = result.response.candidates?.[0];
    const fnCallPart = candidate?.content?.parts?.find((p) => p.functionCall?.args);
    const fnArgs = fnCallPart?.functionCall?.args as Record<string, unknown> | undefined;

    if (!fnArgs) {
      console.error("Gemini response:", JSON.stringify(result.response, null, 2));
      return NextResponse.json({ error: "AI did not generate a valid campaign" }, { status: 500 });
    }

    return NextResponse.json({
      ...fnArgs,
      verification: {
        groundedInSource: useStrictSource,
        hadSourceMaterial: trimmedSource.length > 0,
        strictMode: useStrictSource,
        factsUsed: Array.isArray(fnArgs.factsUsed) ? fnArgs.factsUsed : [],
        unverifiedClaims: Array.isArray(fnArgs.unverifiedClaims) ? fnArgs.unverifiedClaims : [],
      },
    });
  } catch (e) {
    console.error("generate-campaign error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
