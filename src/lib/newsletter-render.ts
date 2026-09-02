/**
 * Deterministic newsletter section renderer.
 *
 * The AI wizard used to hand back a blob of styled HTML, which is why two runs
 * of the same prompt produced structurally different emails (one with a photo
 * placeholder, one without). Instead the model now returns *structured
 * sections* and this module renders them, so:
 *
 *   - every issue has the same skeleton regardless of prompt wording,
 *   - design tokens (colors, fonts, sizes, spacing) are honored exactly,
 *   - image placeholders and the CTA button are guaranteed when requested,
 *   - each section carries `data-nl-section`, which lets the editor move,
 *     duplicate or delete whole sections after generation.
 */

import {
  type NewsletterDesign,
  type BrandKit,
  DEFAULT_NEWSLETTER_DESIGN,
  escapeHtml,
  resolveDesign,
  safeUrl,
} from "@/lib/newsletter-brand";

export const SECTION_KINDS = [
  "intro",
  "hero_image",
  "article",
  "key_insights",
  "did_you_know",
  "approach",
  "provider_message",
  "announcement",
  "cta",
  "custom",
] as const;

export type SectionKind = (typeof SECTION_KINDS)[number];

export interface NewsletterSection {
  kind: SectionKind;
  /** Section heading. Omitted for intro/hero/cta. */
  heading?: string | null;
  /** Paragraph copy. Rendered as separate <p> blocks. */
  paragraphs?: string[] | null;
  /** Bullet list, used by key_insights and approach. */
  bullets?: string[] | null;
  /** Describes the image the client should drop in. Renders a placeholder. */
  imagePrompt?: string | null;
  /** Live image URL, once the client replaces the placeholder. */
  imageUrl?: string | null;
  /** CTA button label + destination. */
  ctaLabel?: string | null;
  ctaUrl?: string | null;
}

export interface RenderSectionsOptions {
  sections: NewsletterSection[];
  brand: BrandKit;
  design?: NewsletterDesign | null;
}

function p(text: string, style: string): string {
  return `<p style="${style}">${escapeHtml(text)}</p>`;
}

/**
 * Image placeholder the client can click and replace in-place. The editor
 * recognises `data-nl-image` and swaps the `src` rather than inserting a
 * second image below it — the exact complaint in the feedback.
 */
function imageBlock(section: NewsletterSection, d: Required<NewsletterDesign>): string {
  const url = safeUrl(section.imageUrl);
  const alt = escapeHtml(section.imagePrompt || "Newsletter image");
  if (url) {
    return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 ${d.sectionSpacing}px;"><tr><td align="center">
  <img data-nl-image="1" src="${url}" alt="${alt}" width="100%" style="display:block;width:100%;max-width:100%;height:auto;border:0;border-radius:8px;" />
</td></tr></table>`;
  }
  // Placeholder: a labelled grey block that carries the AI's image direction
  // so whoever edits knows exactly what picture to drop in.
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 ${d.sectionSpacing}px;"><tr><td align="center" data-nl-image-placeholder="1" style="background:#eef2f4;border:1px dashed #b6c2c7;border-radius:8px;padding:36px 20px;text-align:center;font-family:${d.bodyFont};font-size:12px;line-height:1.5;color:#6b7280;">
  <strong style="display:block;margin-bottom:4px;color:#4b5563;">Image placeholder</strong>
  ${alt}
</td></tr></table>`;
}

function ctaBlock(section: NewsletterSection, d: Required<NewsletterDesign>): string {
  const label = escapeHtml(section.ctaLabel || "Learn more");
  const url = safeUrl(section.ctaUrl) ?? "#";
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 ${d.sectionSpacing}px;"><tr><td align="center">
  <a href="${url}" style="display:inline-block;background:${d.accentColor};color:#ffffff;font-family:${d.bodyFont};font-size:${d.bodySize}px;font-weight:600;text-decoration:none;padding:13px 30px;border-radius:6px;">${label}</a>
</td></tr></table>`;
}

/** Render one section to email-safe HTML. */
export function renderSection(
  section: NewsletterSection,
  d: Required<NewsletterDesign>,
): string {
  const bodyStyle = `margin:0 0 12px;font-family:${d.bodyFont};font-size:${d.bodySize}px;line-height:${d.lineHeight};color:${d.bodyColor};`;
  const headingStyle = `margin:0 0 10px;font-family:${d.headingFont};font-size:${Math.round(
    d.headingSize * 0.72,
  )}px;line-height:1.3;color:${d.bodyColor};font-weight:700;`;

  const parts: string[] = [];

  if (section.kind === "hero_image") {
    parts.push(imageBlock(section, d));
  } else if (section.kind === "cta") {
    if (section.paragraphs?.length) {
      parts.push(...section.paragraphs.map((t) => p(t, `${bodyStyle}text-align:center;`)));
    }
    parts.push(ctaBlock(section, d));
  } else {
    if (section.heading) {
      parts.push(`<h2 style="${headingStyle}">${escapeHtml(section.heading)}</h2>`);
    }
    if (section.imagePrompt || section.imageUrl) {
      parts.push(imageBlock(section, d));
    }
    if (section.paragraphs?.length) {
      parts.push(...section.paragraphs.map((t) => p(t, bodyStyle)));
    }
    if (section.bullets?.length) {
      parts.push(
        `<ul style="margin:0 0 12px;padding-left:20px;font-family:${d.bodyFont};font-size:${d.bodySize}px;line-height:${d.lineHeight};color:${d.bodyColor};">` +
          section.bullets.map((b) => `<li style="margin:0 0 7px;">${escapeHtml(b)}</li>`).join("") +
          `</ul>`,
      );
    }
    if (section.ctaLabel) {
      parts.push(ctaBlock(section, d));
    }
  }

  // "Did you know" gets a tinted callout card so it reads as a distinct block.
  const isCallout = section.kind === "did_you_know";
  const inner = parts.join("\n");
  const body = isCallout
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="background:#f6fbfc;border-left:4px solid ${d.accentColor};border-radius:6px;padding:18px 20px 8px;">${inner}</td></tr></table>`
    : inner;

  return `<div data-nl-section="${escapeHtml(section.kind)}" style="margin:0 0 ${d.sectionSpacing}px;">
${body}
</div>`;
}

/** Render the full variable-content fragment (everything between header and footer). */
export function renderSections(opts: RenderSectionsOptions): string {
  const d = resolveDesign(opts.brand, opts.design);
  const sections = Array.isArray(opts.sections) ? opts.sections : [];
  if (!sections.length) return "";
  return sections.map((s) => renderSection(s, d)).join("\n");
}

/** Guard: coerce whatever the model returned into valid sections. */
export function normalizeSections(raw: unknown): NewsletterSection[] {
  if (!Array.isArray(raw)) return [];
  const kinds = new Set<string>(SECTION_KINDS);
  const asStrings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];

  return raw
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((s) => {
      const kind = typeof s.kind === "string" && kinds.has(s.kind) ? (s.kind as SectionKind) : "custom";
      return {
        kind,
        heading: typeof s.heading === "string" && s.heading.trim() ? s.heading : null,
        paragraphs: asStrings(s.paragraphs),
        bullets: asStrings(s.bullets),
        imagePrompt: typeof s.imagePrompt === "string" && s.imagePrompt.trim() ? s.imagePrompt : null,
        imageUrl: typeof s.imageUrl === "string" ? s.imageUrl : null,
        ctaLabel: typeof s.ctaLabel === "string" && s.ctaLabel.trim() ? s.ctaLabel : null,
        ctaUrl: typeof s.ctaUrl === "string" ? s.ctaUrl : null,
      } satisfies NewsletterSection;
    })
    // Drop sections that would render to nothing.
    .filter(
      (s) =>
        s.heading ||
        s.paragraphs?.length ||
        s.bullets?.length ||
        s.imagePrompt ||
        s.imageUrl ||
        s.ctaLabel,
    );
}

export { DEFAULT_NEWSLETTER_DESIGN };
