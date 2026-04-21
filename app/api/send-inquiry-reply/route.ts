import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { inquiry_id, reply_text } = await req.json();
    if (!inquiry_id || !reply_text?.trim()) {
      return NextResponse.json({ error: "inquiry_id and reply_text required" }, { status: 400 });
    }

    const sb = serverClient();

    const { data: inquiry, error: iqErr } = await sb
      .from("inquiries")
      .select("id, patient_name, patient_email, raw_content")
      .eq("id", inquiry_id)
      .single();
    if (iqErr || !inquiry) return NextResponse.json({ error: "Inquiry not found" }, { status: 404 });
    if (!inquiry.patient_email) return NextResponse.json({ error: "No email address for this sender" }, { status: 400 });

    const { data: settings } = await sb
      .from("practice_settings")
      .select("email_provider_api_key, email_from_address, email_from_name")
      .limit(1)
      .single();

    const emailApiKey: string = process.env.RESEND_API_KEY ?? settings?.email_provider_api_key ?? "";
    const fromAddress: string = process.env.FROM_EMAIL ?? settings?.email_from_address ?? "";
    const fromName: string = settings?.email_from_name ?? "FitLogic";
    const fromHeader = fromName ? `${fromName} <${fromAddress}>` : fromAddress;

    if (!emailApiKey || !fromAddress) {
      return NextResponse.json({ error: "Email provider not configured" }, { status: 500 });
    }

    const html = `<p>${reply_text.replace(/\n/g, "<br>")}</p>
<p style="margin-top:24px;font-size:12px;color:#888;border-top:1px solid #eee;padding-top:12px;">
  Fit Logic · <a href="mailto:${fromAddress}" style="color:#888;">${fromAddress}</a>
</p>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${emailApiKey}` },
      body: JSON.stringify({
        from: fromHeader,
        to: [inquiry.patient_email],
        subject: `Re: Your message to Fit Logic`,
        html,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: `Email send failed: ${errText}` }, { status: 502 });
    }

    const updates = {
      response_text: reply_text,
      status: "resolved",
      resolved_at: new Date().toISOString(),
    };
    await sb.from("inquiries").update(updates).eq("id", inquiry_id);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
