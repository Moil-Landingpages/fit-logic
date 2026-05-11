import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase";
import { sendEmail, wrapEmailHtml, sanitizeEmailHtml } from "@/lib/emailSender";
import { applyEmailVars } from "@/lib/email-vars";
import { syncContactOnEmailSent } from "@/lib/contact-sync";

export async function POST(req: NextRequest) {
  try {
    const { inquiry_id, reply_text, html_content, variables, attachments } = await req.json();
    if (!inquiry_id || !reply_text?.trim()) {
      return NextResponse.json({ error: "inquiry_id and reply_text required" }, { status: 400 });
    }

    const sb = serverClient();

    const { data: inquiry, error: iqErr } = await sb
      .from("inquiries")
      .select("id, patient_name, patient_email, raw_content, patient_id, status")
      .eq("id", inquiry_id)
      .single();
    if (iqErr || !inquiry) return NextResponse.json({ error: "Inquiry not found" }, { status: 404 });
    if (!inquiry.patient_email) return NextResponse.json({ error: "No email address for this sender" }, { status: 400 });

    const { data: settings } = await sb
      .from("practice_settings")
      .select("email_provider_api_key, email_from_address, email_from_name, google_gmail_token")
      .limit(1)
      .single();

    const resendApiKey: string = process.env.RESEND_API_KEY ?? settings?.email_provider_api_key ?? "";
    const fromAddress: string = process.env.FROM_EMAIL ?? settings?.email_from_address ?? "";
    const fromName: string = settings?.email_from_name ?? "FitLogic";
    const fromHeader = fromName ? `${fromName} <${fromAddress}>` : fromAddress;
    const hasGmail = !!settings?.google_gmail_token;

    if (!resendApiKey && !hasGmail) {
      return NextResponse.json({ error: "Email provider not configured" }, { status: 500 });
    }

    const processedReplyText = applyEmailVars(reply_text, variables);
    const rawBody = html_content
      ? applyEmailVars(html_content, variables)
      : `<p>${processedReplyText.replace(/\n/g, "<br>")}</p>`;

    // Inquiries store raw_content as `${subject}\n\n${bodyText}` (see
    // app/api/sync-gmail/route.ts and app/api/mail/sync/route.ts). Pull the
    // original subject so we can produce a proper "Re:" line; fall back when
    // the row predates that convention.
    const raw = (inquiry.raw_content ?? "").toString();
    const splitIdx = raw.indexOf("\n\n");
    const originalSubject = splitIdx >= 0 ? raw.slice(0, splitIdx).trim() : "";
    const originalBody = splitIdx >= 0 ? raw.slice(splitIdx + 2).trim() : raw.trim();
    const replySubject = originalSubject
      ? (/^re:/i.test(originalSubject) ? originalSubject : `Re: ${originalSubject}`)
      : "Re: Your message to Fit Logic";

    // Standard "On <date>, <name> wrote:" quoted-body block. Plain HTML
    // <blockquote> with a left border so Gmail/Outlook render it as a quote.
    const quotedHtml = originalBody
      ? `<br><br>
<div style="font-size:12px;color:#6b7280;">
  On ${new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}, ${(inquiry.patient_name || inquiry.patient_email || "they")} wrote:
</div>
<blockquote style="margin:8px 0 0 0;padding:0 0 0 12px;border-left:3px solid #e5e7eb;color:#4b5563;">
${originalBody.split("\n").map((l) => l ? `<div>${l.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>` : "<br>").join("")}
</blockquote>`
      : "";

    const signature = `<p style="margin-top:24px;font-size:12px;color:#888;border-top:1px solid #eee;padding-top:12px;">
  Fit Logic · <a href="mailto:${fromAddress}" style="color:#888;">${fromAddress}</a>
</p>`;
    const safeBody = sanitizeEmailHtml(rawBody + quotedHtml + signature);
    const fullHtml = wrapEmailHtml({ bodyFragment: safeBody });

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      req.headers.get("origin") ||
      "http://localhost:3000";

    const result = await sendEmail(
      resendApiKey,
      {
        to: inquiry.patient_email,
        toName: inquiry.patient_name ?? null,
        subject: replySubject,
        html: fullHtml,
        from: fromHeader || undefined,
        attachments: Array.isArray(attachments) && attachments.length ? attachments : undefined,
      },
      baseUrl,
      hasGmail,
    );

    if (!result.success) {
      // Still log the failed attempt to the thread so the user can see what
      // went wrong instead of the message just vanishing.
      await (sb as any).from("inquiry_messages").insert({
        inquiry_id,
        direction: "outbound",
        subject: replySubject,
        body_text: processedReplyText,
        body_html: rawBody,
        attachments: Array.isArray(attachments) && attachments.length ? attachments : null,
        status: "failed",
        error_message: result.error ?? "Send failed",
      });
      return NextResponse.json({ error: `Email send failed: ${result.error}` }, { status: 502 });
    }

    // Record the outbound reply in the thread. We no longer auto-resolve the
    // inquiry — that's now an explicit user action so multiple replies can
    // accumulate in the same thread.
    await (sb as any).from("inquiry_messages").insert({
      inquiry_id,
      direction: "outbound",
      subject: replySubject,
      body_text: processedReplyText,
      body_html: rawBody,
      attachments: Array.isArray(attachments) && attachments.length ? attachments : null,
      provider: result.provider ?? null,
      message_id: result.messageId ?? null,
      status: "sent",
    });

    // Update the surface "last reply" text only. Status is intentionally
    // left untouched — "assigned" is reserved for the explicit staff
    // assignment action, and "resolved" for the explicit Resolve button.
    // A reply alone shouldn't reclassify the inquiry.
    await sb
      .from("inquiries")
      .update({ response_text: processedReplyText } as never)
      .eq("id", inquiry_id);

    // Sync the contact's pipeline state — same rule as the campaign queue.
    // Inquiries store patient_id when the sender matched a contact in our DB.
    const inquiryPatientId = (inquiry as { patient_id?: string | null }).patient_id;
    if (inquiryPatientId) {
      const { data: patientRow } = await (sb.from("patients") as unknown as {
        select: (cols: string) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: { id: string; status: string | null; pipeline_stage: string | null } | null }> } };
      })
        .select("id, status, pipeline_stage")
        .eq("id", inquiryPatientId)
        .maybeSingle();
      if (patientRow) {
        await syncContactOnEmailSent(sb, patientRow, new Date().toISOString());
      }
    }

    return NextResponse.json({ success: true, provider: result.provider });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
