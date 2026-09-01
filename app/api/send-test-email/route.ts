import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase";
import { sendEmail, wrapEmailHtml, sanitizeEmailHtml } from "@/lib/emailSender";
import { applyEmailVars } from "@/lib/email-vars";
import { brandKitFromSettings, type NewsletterDesign } from "@/lib/newsletter-brand";
import { renderNewsletterShell } from "@/lib/newsletter-brand";

/**
 * Send one test copy of a draft email/newsletter to a single address.
 *
 * Before this route there was no way to see a campaign in a real inbox without
 * scheduling it to a live segment — the highest-risk step in the whole
 * workflow. Test sends never touch campaign_recipients, campaign_send_log, the
 * suppression list, or the daily send cap; they are a one-off preview.
 */

interface TestSendRequest {
  to: string;
  subject: string;
  html: string;
  previewText?: string | null;
  /** Wrap in the branded newsletter shell (header/logo/footer/disclaimer). */
  useNewsletterShell?: boolean;
  design?: NewsletterDesign | null;
  issueLabel?: string | null;
  title?: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: NextRequest) {
  const sb = serverClient();

  try {
    const body = (await req.json()) as TestSendRequest;
    const { to, subject, html, previewText, useNewsletterShell, design, issueLabel, title } = body;

    if (!to || !EMAIL_RE.test(to.trim())) {
      return NextResponse.json({ error: "A valid test recipient address is required" }, { status: 400 });
    }
    if (!subject || !html) {
      return NextResponse.json({ error: "Missing required fields: subject, html" }, { status: 400 });
    }

    const { data: settings } = await sb.from("practice_settings").select("*").limit(1).maybeSingle();

    const resendApiKey: string =
      process.env.RESEND_API_KEY ?? settings?.email_provider_api_key ?? "";
    const fromAddress = process.env.FROM_EMAIL ?? settings?.email_from_address ?? "";
    const fromName = settings?.email_from_name ?? "FitLogic";
    const fromHeader = fromName ? `${fromName} <${fromAddress}>` : fromAddress;
    const hasGmail = !!(settings as unknown as { google_gmail_token?: unknown })?.google_gmail_token;

    if (!resendApiKey && !hasGmail) {
      return NextResponse.json(
        { error: "No email provider configured. Connect Resend or Gmail in Settings." },
        { status: 400 },
      );
    }

    // Sample values so the reviewer sees what a real recipient sees rather
    // than raw {first_name} tokens.
    const sampleVars = {
      first_name: "Taylor",
      last_name: "Reed",
      name: "Taylor Reed",
      full_name: "Taylor Reed",
      email: to.trim(),
      company: settings?.practice_name ?? "Fit Logic",
    };

    const processedSubject = `[TEST] ${applyEmailVars(subject, sampleVars)}`;
    const processedBody = sanitizeEmailHtml(applyEmailVars(html, sampleVars));

    const finalHtml = useNewsletterShell
      ? renderNewsletterShell({
          bodyFragment: processedBody,
          brand: brandKitFromSettings(settings),
          design: design ?? null,
          issueLabel: issueLabel ?? null,
          title: title ?? null,
          // No live unsubscribe token for a test — the footer still renders
          // the row so the layout matches the real send.
          unsubscribeUrl: null,
        })
      : wrapEmailHtml({ bodyFragment: processedBody, preheader: previewText ?? undefined });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;

    const result = await sendEmail(
      resendApiKey,
      {
        to: to.trim(),
        toName: null,
        subject: processedSubject,
        html: finalHtml,
        from: fromHeader || undefined,
      },
      baseUrl,
      hasGmail,
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error ?? "Test send failed" }, { status: 502 });
    }

    return NextResponse.json({ success: true, provider: result.provider, messageId: result.messageId });
  } catch (err) {
    console.error("send-test-email error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
