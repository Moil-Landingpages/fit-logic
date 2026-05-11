import { NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase";
import { getActiveProvider } from "@/lib/providers";
import { applyEmailVars } from "@/lib/email-vars";
import { sanitizeEmailHtml } from "@/lib/emailSender";

export async function POST(req: Request) {
  const sb = serverClient();
  try {
    const body = await req.json() as {
      to: string;
      toName?: string;
      subject: string;
      html: string;
      text?: string;
      attachments?: { filename: string; content: string; mimeType: string }[];
      variables?: Record<string, string | number | null | undefined>;
    };

    if (!body.to || !body.subject) {
      return NextResponse.json({ error: "Missing required fields: to, subject" }, { status: 400 });
    }

    const active = await getActiveProvider();
    if (!active) return NextResponse.json({ error: "No mail provider connected" }, { status: 400 });

    const subject = applyEmailVars(body.subject, body.variables);
    const html = sanitizeEmailHtml(applyEmailVars(body.html, body.variables));

    const { data: settings } = await sb
      .from("practice_settings")
      .select("provider_email, email_from_address, email_from_name")
      .limit(1)
      .single();

    const fromAddress = (settings as any)?.email_from_address || (settings as any)?.provider_email || "noreply@example.com";
    const fromName = (settings as any)?.email_from_name || "FitLogic";

    const result = await active.provider.sendEmail(
      { to: body.to, toName: body.toName, subject, html, text: body.text, attachments: body.attachments },
      fromAddress,
      fromName,
    );

    const sourceTag = active.provider.name === "google" ? "gmail_sent" : "outlook_sent";
    await sb.from("inquiries").insert({
      source: sourceTag,
      source_id: result.id,
      patient_email: body.to,
      patient_name: body.toName || body.to,
      raw_content: `Subject: ${subject}\n\n${html}`,
      status: "resolved",
      category: "Sent_Email",
    } as any);

    return NextResponse.json({ success: true, messageId: result.id, provider: active.provider.name });
  } catch (err) {
    console.error("mail/send error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
