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
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Returns the shell context when `templateId` points at a newsletter template,
 * or null when it does not (or when the schema predates newsletters).
 */
export async function loadNewsletterShellContext(
  sb: any,
  templateId: string | null | undefined,
): Promise<NewsletterShellContext | null> {
  if (!templateId) return null;

  try {
    const { data: tpl, error } = await sb
      .from("email_templates")
      .select("name, template_kind, design")
      .eq("id", templateId)
      .maybeSingle();

    if (error || !tpl || tpl.template_kind !== "newsletter") return null;

    const { data: settings } = await sb.from("practice_settings").select("*").limit(1).maybeSingle();

    const design = (tpl.design ?? null) as NewsletterDesign | null;
    return {
      brand: brandKitFromSettings(settings),
      design,
      issueLabel: (design as any)?.issueLabel ?? null,
      title: tpl.name ?? null,
    };
  } catch (e) {
    console.warn("[newsletter-send] shell context unavailable, falling back to standard wrapper", e);
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
