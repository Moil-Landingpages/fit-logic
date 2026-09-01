/**
 * Newsletter brand kit — the "master template" the client asked for.
 *
 * The fixed parts of every Fit Logic newsletter (logo, header band, brand
 * colors/fonts, clinic contact block, social links, medical disclaimer,
 * footer) live here as one deterministic wrapper. Each month only the
 * *variable* content — the body fragment produced by the AI wizard or the
 * editor — changes.
 *
 * Pure functions only: no Supabase client, no React. Imported by the
 * generate-campaign route (server), the send paths (server), and the editor
 * preview (client).
 */

export interface SocialLink {
  label: string;
  url: string;
}

/** Fixed brand elements, stored on the singleton practice_settings row. */
export interface BrandKit {
  practiceName: string;
  logoUrl?: string | null;
  primaryColor: string;
  accentColor: string;
  bgColor: string;
  bodyColor: string;
  headingFont: string;
  bodyFont: string;
  headingSize: number;
  bodySize: number;
  clinicAddress?: string | null;
  clinicPhone?: string | null;
  websiteUrl?: string | null;
  socialLinks: SocialLink[];
  medicalDisclaimer?: string | null;
  footerNote?: string | null;
}

/** Per-newsletter design overrides chosen in the wizard or the editor. */
export interface NewsletterDesign {
  bgColor?: string;
  cardColor?: string;
  accentColor?: string;
  bodyColor?: string;
  headingFont?: string;
  bodyFont?: string;
  headingSize?: number;
  bodySize?: number;
  lineHeight?: number;
  contentWidth?: number;
  sectionSpacing?: number;
}

export const DEFAULT_BRAND_KIT: BrandKit = {
  practiceName: "Fit Logic",
  logoUrl: null,
  primaryColor: "#0e9aa7",
  accentColor: "#0e9aa7",
  bgColor: "#f4f4f5",
  bodyColor: "#111827",
  headingFont: "Georgia, 'Times New Roman', serif",
  bodyFont: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  headingSize: 26,
  bodySize: 15,
  clinicAddress: null,
  clinicPhone: null,
  websiteUrl: null,
  socialLinks: [],
  medicalDisclaimer:
    "This newsletter is for general educational purposes only and is not medical advice, diagnosis, or treatment. Always consult your healthcare provider before making changes to your health regimen.",
  footerNote: null,
};

export const DEFAULT_NEWSLETTER_DESIGN: Required<NewsletterDesign> = {
  bgColor: "#f4f4f5",
  cardColor: "#ffffff",
  accentColor: "#0e9aa7",
  bodyColor: "#111827",
  headingFont: DEFAULT_BRAND_KIT.headingFont,
  bodyFont: DEFAULT_BRAND_KIT.bodyFont,
  headingSize: 26,
  bodySize: 15,
  lineHeight: 1.65,
  contentWidth: 600,
  sectionSpacing: 24,
};

/* -------------------------------------------------------------------------- */
/* Escaping                                                                    */
/* -------------------------------------------------------------------------- */

/** Escape text destined for an HTML text node or a quoted attribute value. */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Only allow values that are safe to drop into an inline `style` attribute.
 * Anything with quotes, semicolons, or `url(`/`expression(` is rejected and
 * the caller's fallback is used — design tokens come from user input.
 */
export function safeCssValue(value: string | undefined | null, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const v = value.trim();
  if (!v || v.length > 120) return fallback;
  if (/[<>;{}"\\]/.test(v)) return fallback;
  if (/url\s*\(|expression\s*\(|javascript:/i.test(v)) return fallback;
  return v;
}

/** Clamp a numeric design token into a sane range. */
export function safeNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Only http(s) URLs survive — blocks `javascript:` and `data:text/html`. */
export function safeUrl(value: string | undefined | null): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!/^https?:\/\//i.test(v)) return null;
  return escapeHtml(v);
}

/* -------------------------------------------------------------------------- */
/* Design resolution                                                           */
/* -------------------------------------------------------------------------- */

/** Merge brand defaults with per-newsletter overrides, sanitizing every token. */
export function resolveDesign(
  brand: BrandKit,
  design?: NewsletterDesign | null,
): Required<NewsletterDesign> {
  const d = design ?? {};
  return {
    bgColor: safeCssValue(d.bgColor, safeCssValue(brand.bgColor, DEFAULT_NEWSLETTER_DESIGN.bgColor)),
    cardColor: safeCssValue(d.cardColor, DEFAULT_NEWSLETTER_DESIGN.cardColor),
    accentColor: safeCssValue(d.accentColor, safeCssValue(brand.accentColor, DEFAULT_NEWSLETTER_DESIGN.accentColor)),
    bodyColor: safeCssValue(d.bodyColor, safeCssValue(brand.bodyColor, DEFAULT_NEWSLETTER_DESIGN.bodyColor)),
    headingFont: safeCssValue(d.headingFont, safeCssValue(brand.headingFont, DEFAULT_NEWSLETTER_DESIGN.headingFont)),
    bodyFont: safeCssValue(d.bodyFont, safeCssValue(brand.bodyFont, DEFAULT_NEWSLETTER_DESIGN.bodyFont)),
    headingSize: safeNumber(d.headingSize ?? brand.headingSize, DEFAULT_NEWSLETTER_DESIGN.headingSize, 14, 48),
    bodySize: safeNumber(d.bodySize ?? brand.bodySize, DEFAULT_NEWSLETTER_DESIGN.bodySize, 11, 24),
    lineHeight: safeNumber(d.lineHeight, DEFAULT_NEWSLETTER_DESIGN.lineHeight, 1.1, 2.4),
    contentWidth: safeNumber(d.contentWidth, DEFAULT_NEWSLETTER_DESIGN.contentWidth, 400, 800),
    sectionSpacing: safeNumber(d.sectionSpacing, DEFAULT_NEWSLETTER_DESIGN.sectionSpacing, 0, 64),
  };
}

/**
 * Normalize whatever shape practice_settings gives us into a BrandKit.
 * Every field falls back to the default, so a half-configured practice still
 * renders a complete newsletter.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function brandKitFromSettings(row: any | null | undefined): BrandKit {
  if (!row) return DEFAULT_BRAND_KIT;
  const rawSocial = Array.isArray(row.social_links) ? row.social_links : [];
  const socialLinks: SocialLink[] = rawSocial
    .filter((s: unknown): s is SocialLink =>
      !!s && typeof s === "object" && typeof (s as SocialLink).url === "string")
    .map((s: SocialLink) => ({ label: String(s.label ?? "Link"), url: String(s.url) }))
    .filter((s: SocialLink) => safeUrl(s.url) !== null);

  return {
    practiceName: row.practice_name || DEFAULT_BRAND_KIT.practiceName,
    logoUrl: row.brand_logo_url ?? null,
    primaryColor: row.brand_primary_color || DEFAULT_BRAND_KIT.primaryColor,
    accentColor: row.brand_accent_color || DEFAULT_BRAND_KIT.accentColor,
    bgColor: row.brand_bg_color || DEFAULT_BRAND_KIT.bgColor,
    bodyColor: row.brand_body_color || DEFAULT_BRAND_KIT.bodyColor,
    headingFont: row.brand_heading_font || DEFAULT_BRAND_KIT.headingFont,
    bodyFont: row.brand_body_font || DEFAULT_BRAND_KIT.bodyFont,
    headingSize: safeNumber(row.brand_heading_size, DEFAULT_BRAND_KIT.headingSize, 14, 48),
    bodySize: safeNumber(row.brand_body_size, DEFAULT_BRAND_KIT.bodySize, 11, 24),
    clinicAddress: row.clinic_address ?? null,
    clinicPhone: row.clinic_phone ?? null,
    websiteUrl: row.website_url ?? null,
    socialLinks,
    medicalDisclaimer: row.medical_disclaimer ?? DEFAULT_BRAND_KIT.medicalDisclaimer,
    footerNote: row.newsletter_footer_note ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/* Shell rendering                                                             */
/* -------------------------------------------------------------------------- */

export interface NewsletterShellOptions {
  /** Variable content for this issue — AI output or editor HTML. */
  bodyFragment: string;
  brand: BrandKit;
  design?: NewsletterDesign | null;
  /** e.g. "Monthly Newsletter" or "Issue 04". Rendered in the header band. */
  issueLabel?: string | null;
  /** Main title for this issue. Rendered under the logo. */
  title?: string | null;
  /** Set on preview so the disclaimer/footer render without a live unsub link. */
  unsubscribeUrl?: string | null;
}

/** The fixed branded header: logo band + issue label + title. */
export function renderNewsletterHeader(opts: NewsletterShellOptions): string {
  const { brand, issueLabel, title } = opts;
  const d = resolveDesign(brand, opts.design);
  const logo = safeUrl(brand.logoUrl);

  const logoHtml = logo
    ? `<img src="${logo}" alt="${escapeHtml(brand.practiceName)}" width="150" style="display:block;margin:0 auto;max-width:150px;height:auto;border:0;" />`
    : `<span style="font-family:${d.headingFont};font-size:22px;font-weight:700;color:${d.accentColor};letter-spacing:0.5px;">${escapeHtml(brand.practiceName)}</span>`;

  const labelHtml = issueLabel
    ? `<p style="margin:14px 0 0;font-family:${d.bodyFont};font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:${d.accentColor};">${escapeHtml(issueLabel)}</p>`
    : "";

  const titleHtml = title
    ? `<h1 style="margin:8px 0 0;font-family:${d.headingFont};font-size:${d.headingSize}px;line-height:1.25;color:${d.bodyColor};font-weight:700;">${escapeHtml(title)}</h1>`
    : "";

  return `<tr>
  <td align="center" style="padding:28px 24px 8px;border-bottom:3px solid ${d.accentColor};">
    ${logoHtml}
    ${labelHtml}
    ${titleHtml}
  </td>
</tr>`;
}

/** The fixed branded footer: contact block, socials, disclaimer, unsubscribe. */
export function renderNewsletterFooter(opts: NewsletterShellOptions): string {
  const { brand, unsubscribeUrl } = opts;
  const d = resolveDesign(brand, opts.design);

  const contactBits = [
    escapeHtml(brand.practiceName),
    brand.clinicAddress ? escapeHtml(brand.clinicAddress) : null,
    brand.clinicPhone ? escapeHtml(brand.clinicPhone) : null,
  ].filter(Boolean);

  const site = safeUrl(brand.websiteUrl);
  const siteHtml = site
    ? `<p style="margin:0 0 10px;"><a href="${site}" style="color:${d.accentColor};text-decoration:none;">${escapeHtml(
        brand.websiteUrl!.replace(/^https?:\/\//i, ""),
      )}</a></p>`
    : "";

  const socialHtml = brand.socialLinks.length
    ? `<p style="margin:0 0 12px;">${brand.socialLinks
        .map((s) => {
          const u = safeUrl(s.url);
          return u
            ? `<a href="${u}" style="color:${d.accentColor};text-decoration:none;margin:0 6px;">${escapeHtml(s.label)}</a>`
            : "";
        })
        .filter(Boolean)
        .join("<span style=\"color:#d1d5db;\">|</span>")}</p>`
    : "";

  const disclaimerHtml = brand.medicalDisclaimer
    ? `<p style="margin:14px 0 0;font-size:10px;line-height:1.5;color:#9ca3af;">${escapeHtml(brand.medicalDisclaimer)}</p>`
    : "";

  const noteHtml = brand.footerNote
    ? `<p style="margin:10px 0 0;font-size:10px;line-height:1.5;color:#9ca3af;">${escapeHtml(brand.footerNote)}</p>`
    : "";

  // The unsubscribe row is required by CAN-SPAM on every bulk send. In preview
  // (no url) we still show the label so the layout matches the real send.
  const unsubHtml = unsubscribeUrl
    ? `<a href="${escapeHtml(unsubscribeUrl)}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a>`
    : `<span style="color:#9ca3af;text-decoration:underline;">Unsubscribe</span>`;

  return `<tr>
  <td align="center" style="padding:24px;border-top:1px solid #e5e7eb;font-family:${d.bodyFont};font-size:11px;line-height:1.6;color:#9ca3af;">
    ${siteHtml}
    ${socialHtml}
    <p style="margin:0 0 8px;color:#6b7280;">${contactBits.join(" &middot; ")}</p>
    <p style="margin:0;">You received this email because you opted in. ${unsubHtml}</p>
    ${disclaimerHtml}
    ${noteHtml}
  </td>
</tr>`;
}

/**
 * Full branded newsletter document. Table-based, inline styles only, 600px
 * default — the layout email clients actually render.
 */
export function renderNewsletterShell(opts: NewsletterShellOptions): string {
  const d = resolveDesign(opts.brand, opts.design);
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light only" />
<title>&#8203;</title>
</head>
<body style="margin:0;padding:0;background:${d.bgColor};-webkit-text-size-adjust:100%;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${d.bgColor};">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="${d.contentWidth}" style="max-width:${d.contentWidth}px;width:100%;background:${d.cardColor};border-radius:10px;overflow:hidden;">
      ${renderNewsletterHeader(opts)}
      <tr>
        <td style="padding:${d.sectionSpacing}px 24px;font-family:${d.bodyFont};font-size:${d.bodySize}px;line-height:${d.lineHeight};color:${d.bodyColor};">
          ${opts.bodyFragment}
        </td>
      </tr>
      ${renderNewsletterFooter(opts)}
    </table>
  </td></tr>
</table>
</body>
</html>`;
}
