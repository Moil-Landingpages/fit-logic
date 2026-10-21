/**
 * Who a campaign email is from, where replies go, and the postal address that
 * must appear in the footer. Derived from practice_settings (select("*") so it
 * also works on databases that predate the newer columns).
 */

export const DEFAULT_FROM_NAME = "Fit Logic Functional Medicine";

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;

export interface SendIdentity {
  fromName: string;
  replyTo: string | null;
  postalAddress: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sendIdentityFromSettings(settings: any | null | undefined): SendIdentity {
  const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const replyTo = clean(settings?.email_reply_to);
  return {
    // `||` not `??`: an empty string must also fall back.
    fromName: clean(settings?.email_from_name) || clean(settings?.practice_name) || DEFAULT_FROM_NAME,
    replyTo: EMAIL_RE.test(replyTo) ? replyTo : null,
    postalAddress: clean(settings?.clinic_address) || null,
  };
}

/** Strip characters that could break out of an RFC 5322 display name. */
export function formatFromHeader(name: string, address: string): string {
  const safeName = name.replace(/["<>\r\n]/g, "").trim();
  return safeName ? `${safeName} <${address}>` : address;
}
