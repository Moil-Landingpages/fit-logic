import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { buildFitlogicKnowledgeContext } from "@/lib/fitlogic-knowledge";
import { serverClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { question, category } = await req.json();
    if (!question) return NextResponse.json({ error: "question is required" }, { status: 400 });

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) return NextResponse.json({ error: "GEMINI_API_KEY is not configured" }, { status: 500 });
    const sb = serverClient();

    const { data: existingFaqs } = await sb
      .from("faqs")
      .select("question, answer, category")
      .eq("active", true);

    const toneReferenceFaqs = ((existingFaqs || []).filter((faq: { category: string }) => !category || faq.category === category).slice(0, 5));
    const faqExamples = toneReferenceFaqs.length > 0 ? toneReferenceFaqs : (existingFaqs || []).slice(0, 5);
    const existingContext = faqExamples
      .map((f: { question: string; answer: string }) => `Q: ${f.question}\nA: ${f.answer}`)
      .join("\n\n");
    const knowledgeContext = buildFitlogicKnowledgeContext(
      [category, question].filter(Boolean).join("\n"),
      {
        intent: "faq",
        category,
        heading: "Fit Logic reference knowledge",
      },
    );

    const prompt = `You are writing a public-facing FAQ answer for Fit Logic.

Use the Fit Logic knowledge below as your factual grounding. Existing FAQs are there for tone and structure.
If a detail is not present in the knowledge context, existing FAQs, or the question itself, do not invent it. Instead, answer helpfully at a high level and invite the reader to contact Fit Logic for specifics.
Do not make diagnostic claims, guarantee outcomes, or state unsupported pricing, insurance, scheduling, or location details.

${knowledgeContext}

Existing FAQs for tone/style reference:
${existingContext}

Write a clear, helpful, and professional answer for this FAQ question. The answer should:
1. Be warm, conversational, and authoritative
2. Use specific Fit Logic details only when they are supported by the context above
3. Include concrete steps, timelines, or examples when relevant and supported
4. Be 2-4 short paragraphs max
5. End with a soft next step when appropriate
6. Match the tone of the existing FAQs without copying them

Category: ${category ?? "General_Info"}
Question: ${question}

Respond with ONLY the answer text, no preamble.`;

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-3-flash-preview",
      systemInstruction: "You write grounded, helpful FAQ answers for Fit Logic. Be warm and professional, and stay consistent with the provided business context.",
    });

    const result = await model.generateContent(prompt);
    const answer = result.response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";

    return NextResponse.json({ answer });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
