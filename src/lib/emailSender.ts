/**
 * Shared email sender: tries Resend first, falls back to Gmail (per-user OAuth)
 * if Resend fails AND a Gmail token is connected for this practice.
 *
 * Used by:
 *  - app/api/process-campaign-queue/route.ts  (manual POST queue trigger)
 *  - app/api/cron/schedule/route.ts            (Vercel cron, 8am Texas time)
 *  - app/api/send-email/route.ts               (one-off compose from UI)
 */

export interface EmailAttachment {
  filename: string;
  /** Base64-encoded file content (no data: URL prefix). */
  content: string;
  mimeType: string;
}

export interface EmailPayload {
  to: string;
  toName?: string | null;
  subject: string;
  html: string;
  /** Required for Resend; ignored by Gmail (Gmail uses the OAuth account's identity). */
  from?: string;
  /** Used for List-Unsubscribe header on bulk sends. Optional for one-off compose. */
  listUnsubscribeUrl?: string;
  /** Reply-To header (Resend only; Gmail replies go to the connected account). */
  replyTo?: string;
  /** Tracking ID surfaced on Resend X-Tracking-ID header. */
  trackingId?: string;
  /** Optional file attachments. Forwarded to both Resend and Gmail. */
  attachments?: EmailAttachment[];
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  provider?: "resend" | "gmail";
}

async function sendViaResend(apiKey: string, payload: EmailPayload): Promise<SendResult> {
  if (!apiKey || !payload.from) {
    return { success: false, error: "Resend not configured (missing API key or from address)" };
  }

  const headers: Record<string, string> = {};
  if (payload.listUnsubscribeUrl) {
    headers["List-Unsubscribe"] = `<${payload.listUnsubscribeUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  if (payload.trackingId) {
    headers["X-Tracking-ID"] = payload.trackingId;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: payload.from,
        to: payload.toName ? [`${payload.toName} <${payload.to}>`] : [payload.to],
        subject: payload.subject,
        html: payload.html,
        ...(payload.replyTo ? { reply_to: payload.replyTo } : {}),
        ...(Object.keys(headers).length ? { headers } : {}),
        ...(payload.attachments?.length
          ? {
              attachments: payload.attachments.map((a) => ({
                filename: a.filename,
                content: a.content,
                content_type: a.mimeType,
              })),
            }
          : {}),
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return { success: true, messageId: data.id };
    }
    return { success: false, error: `Resend ${res.status}: ${await res.text()}` };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function sendViaGmail(payload: EmailPayload, baseUrl: string): Promise<SendResult> {
  try {
    const res = await fetch(`${baseUrl}/api/send-gmail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: payload.to,
        toName: payload.toName,
        subject: payload.subject,
        html: payload.html,
        attachments: payload.attachments,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return { success: true, messageId: data.messageId };
    }
    return { success: false, error: `Gmail ${res.status}: ${await res.text()}` };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Send an email. Always tries Resend first; only falls back to Gmail when
 * Resend fails AND `hasGmail` is true (i.e. the practice has connected a Gmail
 * account in Settings).
 */
export async function sendEmail(
  resendApiKey: string,
  payload: EmailPayload,
  baseUrl: string,
  hasGmail: boolean,
): Promise<SendResult> {
  const resendResult = await sendViaResend(resendApiKey, payload);
  if (resendResult.success) {
    return { ...resendResult, provider: "resend" };
  }

  if (hasGmail) {
    console.log(`[emailSender] Resend failed (${resendResult.error}); trying Gmail fallback...`);
    const gmailResult = await sendViaGmail(payload, baseUrl);
    if (gmailResult.success) {
      return { ...gmailResult, provider: "gmail" };
    }
    return {
      success: false,
      error: `Resend: ${resendResult.error}; Gmail: ${gmailResult.error}`,
    };
  }

  return resendResult;
}

/**
 * Strip script/iframe/event-handler vectors from admin-authored HTML before
 * we ship it to Resend or Gmail. The threat model is a campaign admin who
 * pastes in untrusted markup (or a compromised admin account) — recipient
 * email clients also strip most of these, but stripping at our boundary
 * protects forward chains, web previews, and our own debug logs.
 *
 * NOT a full DOMPurify equivalent — this is a regex pass focused on the
 * vectors that matter for outbound email. Inline styles and table layout
 * (which we need for email compatibility) are intentionally preserved.
 */
export function sanitizeEmailHtml(html: string): string {
  if (!html) return "";

  // Remove dangerous tags entirely (open + close + content).
  const dangerousTags = ["script", "iframe", "object", "embed", "applet", "form", "input", "button", "textarea", "select", "meta", "link", "base", "frame", "frameset"];
  let out = html;
  for (const tag of dangerousTags) {
    // <tag ...>...</tag>
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"), "");
    // self-closing or unclosed <tag ...>
    out = out.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, "gi"), "");
  }

  // Strip on* event handler attributes (onclick, onload, onerror, etc.)
  // Matches both quoted and unquoted attribute values.
  out = out.replace(/[\s/]on[a-z]+\s*=\s*"[^"]*"/gi, "");
  out = out.replace(/[\s/]on[a-z]+\s*=\s*'[^']*'/gi, "");
  out = out.replace(/[\s/]on[a-z]+\s*=\s*[^\s>]+/gi, "");

  // Neutralize javascript: and vbscript: URLs in href/src.
  out = out.replace(/(\s(?:href|src|action|formaction)\s*=\s*["']?)\s*(?:javascript|vbscript|data:text\/html)\s*:[^"'\s>]*/gi, '$1#');

  return out;
}

/**
 * Wrap a body fragment in an email-client-safe HTML document.
 * - DOCTYPE + html/head/body so Outlook desktop renders predictably
 * - Single outer table with role=presentation (Gmail/Outlook safe)
 * - Inline styles only — no external CSS
 * - Web-safe font stack (no @font-face, which Outlook strips)
 *
 * Pass `bodyFragment` already-rendered HTML for the message; pass tracking
 * pixel + unsubscribe footer in the optional fields for bulk sends.
 */
export function wrapEmailHtml(opts: {
  bodyFragment: string;
  trackingPixelUrl?: string;
  unsubscribeUrl?: string;
  preheader?: string;
  /** Physical postal address (CAN-SPAM). Shown in the footer when set. */
  postalAddress?: string | null;
}): string {
  const { bodyFragment, trackingPixelUrl, unsubscribeUrl, preheader, postalAddress } = opts;

  const preheaderHtml = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#ffffff;">${preheader}</div>`
    : "";

  const trackingPixelHtml = trackingPixelUrl
    ? `<tr><td style="line-height:0;font-size:0;"><img src="${trackingPixelUrl}" width="1" height="1" style="display:block;border:0;" alt="" /></td></tr>`
    : "";

  const unsubscribeHtml = unsubscribeUrl
    ? `<tr>
    <td style="padding:32px 24px 24px;border-top:1px solid #e5e7eb;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;color:#9ca3af;">
      ${postalAddress ? `<p style="margin:0 0 8px;">${postalAddress.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br />")}</p>` : ""}
      <p style="margin:0 0 8px;">You received this email because you opted in.</p>
      <a href="${unsubscribeUrl}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a>
    </td>
  </tr>`
    : "";

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light" />
<title>&#8203;</title>
<!--[if mso]>
<style type="text/css">
table, td { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
</style>
<![endif]-->
</head>
<body style="margin:0;padding:0;background:#f4f4f5;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
${preheaderHtml}
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f4f4f5;">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;">
        <tr>
          <td style="padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#111827;">
            ${bodyFragment}
          </td>
        </tr>
        ${unsubscribeHtml}
        ${trackingPixelHtml}
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
