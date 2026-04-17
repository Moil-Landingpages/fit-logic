import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
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

    const existingContext = (existingFaqs || [])
      .map((f: { question: string; answer: string }) => `Q: ${f.question}\nA: ${f.answer}`)
      .join("\n\n");

    const prompt = `You are an expert FAQ writer for FitLogic, a functional medicine and wellness practice.

Business context:
- Located in Austin, TX (also serves clients virtually nationwide)
- Programs range from $1,500-$4,500
- Out-of-network provider, accepts HSA/FSA
- Comprehensive lab work included in all programs
- Focus on root-cause medicine

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

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-3-flash-preview",
      systemInstruction: "You write clear, helpful FAQ answers for a functional medicine practice. Be specific, warm, and professional.",
    });

    const result = await model.generateContent(prompt);
    const answer = result.response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";

    return NextResponse.json({ answer });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
