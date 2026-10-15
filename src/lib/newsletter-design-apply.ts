/**
 * Apply design-token changes to already-rendered newsletter HTML.
 *
 * Generated sections carry their typography and accent colours as inline
 * styles, which beat anything the shell sets. So changing "Body font" in the
 * Design panel used to do nothing to the copy. This rewrites those inline
 * styles in place, for only the tokens that changed, so manual per-element
 * edits survive tweaks to unrelated tokens. Browser-only (uses DOMParser).
 */

import { DEFAULT_NEWSLETTER_DESIGN, safeCssValue, safeNumber, type NewsletterDesign } from "@/lib/newsletter-brand";

const PX_HEADING_RATIO = 0.72; // mirrors renderSection's h2 sizing

function setStyle(el: HTMLElement, prop: string, value: string) {
  el.style.setProperty(prop, value);
}

export function applyDesignToHtml(
  html: string,
  prev: NewsletterDesign | null | undefined,
  next: NewsletterDesign,
): string {
  if (!html || typeof DOMParser === "undefined") return html;
  // Resolve against defaults so "Reset" (empty design) restyles the copy back
  // instead of being ignored.
  const p = { ...DEFAULT_NEWSLETTER_DESIGN, ...(prev ?? {}) };
  next = { ...DEFAULT_NEWSLETTER_DESIGN, ...next };
  const changed = (k: keyof NewsletterDesign) => p[k] !== next[k];

  const doc = new DOMParser().parseFromString(`<div id="nl-root">${html}</div>`, "text/html");
  const root = doc.getElementById("nl-root");
  if (!root) return html;

  const bodyEls = root.querySelectorAll<HTMLElement>("p, li, ul");
  const headingEls = root.querySelectorAll<HTMLElement>("h2, h3");
  const ctaEls = root.querySelectorAll<HTMLElement>("a[style*='display:inline-block'], a[style*='display: inline-block']");
  const calloutEls = root.querySelectorAll<HTMLElement>("td[style*='border-left']");
  const sectionEls = root.querySelectorAll<HTMLElement>("[data-nl-section]");

  if (changed("bodyFont")) {
    const v = safeCssValue(next.bodyFont, "");
    if (v) { bodyEls.forEach((e) => setStyle(e, "font-family", v)); ctaEls.forEach((e) => setStyle(e, "font-family", v)); }
  }
  if (changed("bodySize")) {
    const v = safeNumber(next.bodySize, 15, 11, 24);
    bodyEls.forEach((e) => setStyle(e, "font-size", `${v}px`));
    ctaEls.forEach((e) => setStyle(e, "font-size", `${v}px`));
  }
  if (changed("lineHeight")) {
    const v = safeNumber(next.lineHeight, 1.6, 1.1, 2.4);
    bodyEls.forEach((e) => setStyle(e, "line-height", String(v)));
  }
  if (changed("bodyColor")) {
    const v = safeCssValue(next.bodyColor, "");
    if (v) { bodyEls.forEach((e) => setStyle(e, "color", v)); headingEls.forEach((e) => setStyle(e, "color", v)); }
  }
  if (changed("headingFont")) {
    const v = safeCssValue(next.headingFont, "");
    if (v) headingEls.forEach((e) => setStyle(e, "font-family", v));
  }
  if (changed("headingSize")) {
    const v = safeNumber(next.headingSize, 26, 14, 48);
    headingEls.forEach((e) => setStyle(e, "font-size", `${Math.round(v * PX_HEADING_RATIO)}px`));
  }
  if (changed("accentColor")) {
    const v = safeCssValue(next.accentColor, "");
    if (v) {
      ctaEls.forEach((e) => setStyle(e, "background", v));
      calloutEls.forEach((e) => setStyle(e, "border-left-color", v));
    }
  }
  if (changed("sectionSpacing")) {
    const v = safeNumber(next.sectionSpacing, 28, 0, 64);
    sectionEls.forEach((e) => setStyle(e, "margin-bottom", `${v}px`));
  }

  return root.innerHTML;
}
