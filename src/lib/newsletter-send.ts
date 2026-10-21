/**
 * Send-time newsletter wrapping.
 *
 * A campaign whose template is marked `template_kind = 'newsletter'` goes out
 * inside the branded shell (logo header, issue label, clinic footer, social
 * links, medical disclaimer) instead of the generic `wrapEmailHtml` chrome.
 * That is what makes each month's issue recognisable to recipients — the
 * "reusable master template" requirement — without the editor having to carry
 * the boilerplate in every body.
 *
 * Every lookup is defensive: on a database that has not run migration
 * 20260901000001 the columns are missing, the helper returns null, and the
 * caller falls back to the previous wrapper. Existing campaigns are unaffected.
 */

import { brandKitFromSettings, renderNewsletterShell, type BrandKit, type NewsletterDesign } from "@/lib/newsletter-brand";

export interface NewsletterShellContext {
  brand: BrandKit;
  design: NewsletterDesign | null;
  issueLabel: string | null;
  title: string | null;
  /** When a person signed off the accuracy check; null = not reviewed. */
  verifiedAt: string | null;
  /** True for real newsletters, which need the accuracy sign-off before sending. */
  requiresReview: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

async function loadBrand(sb: any): Promise<BrandKit> {
  const { data: settings } = await sb.from("practice_settings").select("*").limit(1).maybeSingle();
  return brandKitFromSettings(settings);
}

/**
 * Returns the shell context when `templateId` points at a newsletter template
 * or a template with the branded layout switched on, or null otherwise (or
 * when the schema predates newsletters).
 */
export async function loadNewsletterShellContext(
  sb: any,
  templateId: string | null | undefined,
): Promise<NewsletterShellContext | null> {
  if (!templateId) return null;

  try {
    // branded_layout comes from a later migration; retry without it so a
    // database that only has the newsletter migration keeps working.
    let res = await sb
      .from("email_templates")
      .select("name, template_kind, design, verified_at, branded_layout")
      .eq("id", templateId)
      .maybeSingle();
    if (res.error) {
      res = await sb
        .from("email_templates")
        .select("name, template_kind, design, verified_at")
        .eq("id", templateId)
        .maybeSingle();
    }
    const { data: tpl, error } = res;

    if (error || !tpl) return null;
    const isNewsletter = tpl.template_kind === "newsletter";
    if (!isNewsletter && !tpl.branded_layout) return null;

    const design = (tpl.design ?? null) as NewsletterDesign | null;
    return {
      brand: await loadBrand(sb),
      design,
      issueLabel: (design as any)?.issueLabel ?? null,
      // Internal template names ("... — Master") must never become the visible
      // <h1>; only an explicit design.title does.
      title: ((design as any)?.title as string | undefined) ?? null,
      verifiedAt: (tpl.verified_at as string | null) ?? null,
      requiresReview: isNewsletter,
    };
  } catch (e) {
    console.warn("[newsletter-send] shell context unavailable, falling back to standard wrapper", e);
    return null;
  }
}

/**
 * Shell context for a sequence campaign with the branded layout on. Applies to
 * every step. Returns null when the flag is off or the column does not exist.
 */
export async function loadBrandedCampaignContext(
  sb: any,
  campaign: { branded_layout?: boolean | null } | null | undefined,
): Promise<NewsletterShellContext | null> {
  if (!campaign?.branded_layout) return null;
  try {
    return {
      brand: await loadBrand(sb),
      design: null,
      issueLabel: null,
      title: null,
      verifiedAt: null,
      requiresReview: false,
    };
  } catch (e) {
    console.warn("[newsletter-send] branded campaign context unavailable", e);
    return null;
  }
}

/** Render a newsletter body inside the branded shell. */
export function wrapNewsletter(opts: {
  ctx: NewsletterShellContext;
  bodyFragment: string;
  unsubscribeUrl?: string | null;
  trackingPixelUrl?: string | null;
}): string {
  const html = renderNewsletterShell({
    bodyFragment: opts.bodyFragment,
    brand: opts.ctx.brand,
    design: opts.ctx.design,
    issueLabel: opts.ctx.issueLabel,
    title: opts.ctx.title,
    unsubscribeUrl: opts.unsubscribeUrl ?? null,
  });

  if (!opts.trackingPixelUrl) return html;
  // Append the open pixel just before </body> so it ships with the shell.
  return html.replace(
    "</body>",
    `<img src="${opts.trackingPixelUrl}" width="1" height="1" style="display:block;border:0;" alt="" />\n</body>`,
  );
}

/**
 * Server-side last line of defence for live newsletter sends. The editor warns
 * about these, but a draft saved with an image placeholder or a dead CTA link
 * must never reach a real inbox. Returns human-readable blockers (empty = ok).
 */
export function findNewsletterSendBlockers(html: string): string[] {
  const blockers: string[] = [];
  if (/data-nl-image-placeholder/i.test(html) || /Image placeholder/i.test(html)) {
    blockers.push("an image placeholder has not been replaced with a real photo");
  }
  if (/href\s*=\s*["']\s*(#|)\s*["']/i.test(html)) {
    blockers.push("a link or CTA button has no destination (href is empty or '#')");
  }
  if (/\[[^\]]*(add|insert|your)[^\]]*\]/i.test(html.replace(/<[^>]+>/g, " "))) {
    blockers.push("bracketed placeholder text (e.g. \"[add your stat here]\") is still in the copy");
  }
  return blockers;
}
