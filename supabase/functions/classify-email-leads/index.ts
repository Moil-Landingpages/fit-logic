import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Main handler — classifies un-scored email_messages as leads / not leads
// ---------------------------------------------------------------------------
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({})) as {
      batch_size?: number;
      email_id?: string;  // optionally classify a single message
    };

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const aiApiKey = Deno.env.get("LOVABLE_API_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Fetch un-classified messages (lead_score IS NULL)
    let query = sb
      .from("email_messages")
      .select("id, from_email, from_name, to_email, subject, snippet, body_text")
      .is("lead_score", null)
      .order("received_at", { ascending: false });

    if (body.email_id) {
      query = query.eq("id", body.email_id);
    } else {
      query = query.limit(body.batch_size ?? 20);
    }

    const { data: emails, error: fetchErr } = await query;
    if (fetchErr) throw new Error(fetchErr.message);
    if (!emails || emails.length === 0) {
      return json({ success: true, classified: 0, message: "No unclassified emails" });
    }

    // Build a batch prompt — classify multiple emails in one AI call for efficiency
    const emailSummaries = emails.map((e, i) => {
      const preview = (e.body_text || e.snippet || "").substring(0, 500);
      return `--- Email ${i + 1} (id: ${e.id}) ---
From: ${e.from_name ?? ""} <${e.from_email}>
To: ${e.to_email ?? ""}
Subject: ${e.subject ?? "(no subject)"}
Preview: ${preview}`;
    }).join("\n\n");

    const prompt = `You are an AI lead-scoring assistant for FitLogic, a functional medicine / health & wellness sales platform.

Analyze the following email(s) and determine if each one is a potential LEAD (someone interested in services, consultations, programs, or products).

For each email, classify:
- is_lead: true if the sender appears to be a potential client/customer showing interest, asking about services, pricing, scheduling, or referral. false for newsletters, spam, internal comms, automated notifications, receipts, or unrelated personal messages.
- lead_score: 0.0 to 1.0 (how likely this is a valuable lead)
- lead_category: one of "new_client", "returning_client", "referral", "vendor", "not_a_lead"
- lead_summary: one-sentence summary of why this is or isn't a lead

${emailSummaries}

Respond with a JSON array, one object per email, in the same order:
[
  { "id": "email_id", "is_lead": true/false, "lead_score": 0.0-1.0, "lead_category": "...", "lead_summary": "..." },
  ...
]`;

    const aiRes = await fetch("https://ai.lovable.dev/api/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${aiApiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "You are a lead classification engine. Always respond with valid JSON only — a JSON array of classification objects.",
          },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const err = await aiRes.text();
      throw new Error(`AI API error: ${aiRes.status} ${err}`);
    }

    const aiData = await aiRes.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "[]";
    let classifications: Array<{
      id: string;
      is_lead: boolean;
      lead_score: number;
      lead_category: string;
      lead_summary: string;
    }>;

    // The AI may return { results: [...] } or just [...]
    const parsed = JSON.parse(rawContent);
    classifications = Array.isArray(parsed) ? parsed : (parsed.results ?? parsed.emails ?? []);

    // Update each email in the database
    let classified = 0;
    let newLeads = 0;
    for (const c of classifications) {
      const { error: updateErr } = await sb
        .from("email_messages")
        .update({
          is_lead: c.is_lead ?? false,
          lead_score: c.lead_score ?? 0,
          lead_category: c.lead_category ?? "not_a_lead",
          lead_summary: c.lead_summary ?? null,
        })
        .eq("id", c.id);

      if (!updateErr) {
        classified++;
        if (c.is_lead) newLeads++;
      }
    }

    // Create notifications for new leads
    if (newLeads > 0) {
      await sb.from("notifications").insert({
        type: "new_lead",
        title: `${newLeads} new lead${newLeads === 1 ? "" : "s"} detected`,
        message: `AI identified ${newLeads} potential lead${newLeads === 1 ? "" : "s"} in your recent emails.`,
        link: "/inbox",
      });
    }

    return json({ success: true, classified, newLeads });
  } catch (error) {
    console.error("classify-email-leads error:", error);
    return json(
      { error: error instanceof Error ? error.message : String(error) },
      500,
    );
  }
});
