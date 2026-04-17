import { NextRequest, NextResponse } from "next/server";
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

    const aiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: "You write clear, helpful FAQ answers for a functional medicine practice. Be specific, warm, and professional." }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        }),
      }
    );

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) return NextResponse.json({ error: "Rate limited — please try again in a moment" }, { status: 429 });
      const errText = await aiResponse.text();
      throw new Error(`Gemini API error: ${aiResponse.status} ${errText}`);
    }

    const aiData = await aiResponse.json();
    const answer = aiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

    return NextResponse.json({ answer });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
