import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase";
import { sendEmail, wrapEmailHtml, sanitizeEmailHtml } from "@/lib/emailSender";
import { applyEmailVars } from "@/lib/email-vars";
import { syncContactOnEmailSent } from "@/lib/contact-sync";

interface SendEmailAttachment {
  filename: string;
  /** Base64-encoded content, no data: URL prefix. */
  content: string;
  mimeType: string;
}

interface SendEmailRequest {
  to: string;
  toName?: string | null;
  subject: string;
  html: string;
  /** Replaces {{key}} tokens in subject/html before sending. */
  variables?: Record<string, string | number | null | undefined>;
  attachments?: SendEmailAttachment[];
  /** Optional — when present, the patient gets last_contacted_at stamped
   *  and (if status='lead' + pipeline_stage='new_lead') promoted to
   *  pipeline_stage='contacted'. Pass from compose dialogs. */
  patient_id?: string;
}

// Variable substitution moved to @/lib/email-vars (applyEmailVars) — accepts
// both `{key}` and `{{key}}` so the same template works regardless of which
// editor it came out of.

/**
 * One-off email send used by the Compose dialog in Patients.
 * Tries Resend first; falls back to Gmail (per-user OAuth) only if Resend fails
 * AND the practice has connected a Gmail account in Settings.
 */
export async function POST(req: NextRequest) {
  const sb = serverClient();

  try {
    const body = (await req.json()) as SendEmailRequest;
    const { to, toName, subject, html, variables, attachments, patient_id } = body;

    if (!to || !subject || !html) {
      return NextResponse.json(
        { error: "Missing required fields: to, subject, html" },
        { status: 400 },
      );
    }

    const { data: settings } = await sb
      .from("practice_settings")
      .select(
        "email_provider_api_key, email_from_address, email_from_name, google_gmail_token",
      )
      .limit(1)
      .single();

    const resendApiKey: string =
      process.env.RESEND_API_KEY ?? settings?.email_provider_api_key ?? "";
    const fromAddress = process.env.FROM_EMAIL ?? settings?.email_from_address ?? "";
    const fromName = settings?.email_from_name ?? "FitLogic";
    const fromHeader = fromName ? `${fromName} <${fromAddress}>` : fromAddress;
    const hasGmail = !!(settings as unknown as { google_gmail_token?: unknown })
      ?.google_gmail_token;

    if (!resendApiKey && !hasGmail) {
      return NextResponse.json(
        { error: "No email provider configured. Connect Resend or Gmail in Settings." },
        { status: 400 },
      );
    }

    const processedSubject = applyEmailVars(subject, variables);
    const processedBody = sanitizeEmailHtml(applyEmailVars(html, variables));
    const wrappedHtml = wrapEmailHtml({ bodyFragment: processedBody });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;

    const result = await sendEmail(
      resendApiKey,
      {
        to,
        toName: toName ?? null,
        subject: processedSubject,
        html: wrappedHtml,
        from: fromHeader || undefined,
        attachments: attachments?.length ? attachments : undefined,
      },
      baseUrl,
      hasGmail,
    );

    // Log the send to contact_email_log so the Mailing tab on the contact
    // shows it (campaign sends live in campaign_send_log; this is the
    // equivalent for ad-hoc compose sends). Failed sends are logged too.
    if (patient_id) {
      // Cast through any — auto-generated supabase types in
      // src/integrations/supabase/types.ts predate this table (added in
      // migration 20260510000001).
      await (sb as any).from("contact_email_log").insert({
        patient_id,
        to_address: to,
        to_name: toName ?? null,
        subject: processedSubject,
        body_html: processedBody,
        status: result.success ? "sent" : "failed",
        provider: result.success ? result.provider ?? null : null,
        message_id: result.success ? result.messageId ?? null : null,
        error_message: result.success ? null : result.error ?? null,
        sent_at: new Date().toISOString(),
      });
    }

    if (!result.success) {
      return NextResponse.json(
        { error: result.error ?? "Send failed" },
        { status: 502 },
      );
    }

    // Sync the contact's pipeline state. Best-effort — sync errors are
    // logged inside the helper and never block the success response.
    if (patient_id) {
      const { data: patientRow } = await (sb.from("patients") as unknown as {
        select: (cols: string) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: { id: string; status: string | null; pipeline_stage: string | null } | null }> } };
      })
        .select("id, status, pipeline_stage")
        .eq("id", patient_id)
        .maybeSingle();
      if (patientRow) {
        await syncContactOnEmailSent(sb, patientRow, new Date().toISOString());
      }
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      provider: result.provider,
    });
  } catch (err) {
    console.error("send-email error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
