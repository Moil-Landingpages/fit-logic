/**
 * DOM helpers for the rich email editor.
 *
 * These live outside the React component for two reasons: the component was
 * approaching 1,700 lines, and — more importantly — logic buried in a component
 * body cannot be tested. Every function here is a pure DOM transformation that
 * runs against any Document, so it can be exercised under jsdom.
 *
 * None of these functions call `onChange` or touch React state. The caller
 * mutates, then snapshots, so each user action is exactly one undo step.
 */

import {
  type NewsletterDesign,
  resolveDesign,
  DEFAULT_BRAND_KIT,
} from "@/lib/newsletter-brand";

export type ImageAlign = "left" | "center" | "right";

/* -------------------------------------------------------------------------- */
/* Selection                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The top-level block (a direct child of `editor`) containing `node`.
 * Returns null when `node` is not inside the editor.
 */
export function topLevelBlockOf(editor: HTMLElement, node: HTMLElement): HTMLElement | null {
  if (!editor.contains(node)) return null;
  let cur: HTMLElement | null = node;
  while (cur && cur.parentElement && cur.parentElement !== editor) {
    cur = cur.parentElement;
  }
  return cur && cur.parentElement === editor ? cur : null;
}

/* -------------------------------------------------------------------------- */
/* Image controls                                                              */
/* -------------------------------------------------------------------------- */

export function setImageWidth(img: HTMLElement, pct: number): void {
  const clamped = Math.min(100, Math.max(5, Math.round(pct)));
  img.setAttribute("width", `${clamped}%`);
  img.style.width = `${clamped}%`;
  img.style.maxWidth = "100%";
  img.style.height = "auto";
}

export function setImageAlign(img: HTMLElement, align: ImageAlign): void {
  img.style.display = "block";
  img.style.marginLeft = align === "left" ? "0" : "auto";
  img.style.marginRight = align === "right" ? "0" : "auto";
  // Email clients honour a cell's align attribute more reliably than CSS
  // margins, so set both when the image sits in a table.
  const cell = img.closest("td");
  if (cell) cell.setAttribute("align", align);
}

export function setImageAlt(img: HTMLElement, alt: string): void {
  img.setAttribute("alt", alt);
}

/**
 * Point an existing image, or an AI-generated placeholder cell, at a real image
 * URL — in place. The placeholder case is why this exists: inserting a second
 * image below the placeholder was the behaviour being complained about.
 */
export function replaceImageTarget(target: HTMLElement, url: string): void {
  const safe = url.replace(/"/g, "&quot;");
  if (target.tagName === "IMG") {
    target.setAttribute("src", safe);
    return;
  }
  target.removeAttribute("data-nl-image-placeholder");
  target.removeAttribute("style");
  target.setAttribute("align", "center");
  target.innerHTML =
    `<img data-nl-image="1" src="${safe}" width="100%" alt="Newsletter image" ` +
    `style="display:block;width:100%;max-width:100%;height:auto;border:0;border-radius:8px;" />`;
}

/* -------------------------------------------------------------------------- */
/* Block controls                                                              */
/* -------------------------------------------------------------------------- */

/** Move a block among its siblings. Returns false when it cannot move further. */
export function moveBlock(editor: HTMLElement, block: HTMLElement, dir: -1 | 1): boolean {
  if (block.parentElement !== editor) return false;
  const sibling = dir === -1 ? block.previousElementSibling : block.nextElementSibling;
  if (!sibling) return false;
  if (dir === -1) editor.insertBefore(block, sibling);
  else editor.insertBefore(sibling, block);
  return true;
}

/** Insert a copy of `block` directly after it, without the selection outline. */
export function duplicateBlock(block: HTMLElement): HTMLElement | null {
  const parent = block.parentElement;
  if (!parent) return null;
  const clone = block.cloneNode(true) as HTMLElement;
  clone.style.outline = "";
  clone.style.outlineOffset = "";
  parent.insertBefore(clone, block.nextSibling);
  return clone;
}

/**
 * The node that should actually be removed for a given selection. Deleting an
 * image whose only purpose is to sit in a wrapper table removes the table too,
 * otherwise an empty grey box is left behind.
 */
export function deletionTargetFor(el: HTMLElement, kind: "image" | "block" | "placeholder"): HTMLElement {
  if (kind !== "image") return el;
  const table = el.closest("table");
  if (table && table.querySelectorAll("img").length === 1 && !table.textContent?.trim()) {
    return table as HTMLElement;
  }
  return el;
}

/* -------------------------------------------------------------------------- */
/* Restyling                                                                   */
/* -------------------------------------------------------------------------- */

/** Overwrite one declaration in an inline style attribute, preserving the rest. */
function setStyle(el: HTMLElement, prop: string, value: string): void {
  el.style.setProperty(prop, value);
}

/**
 * Apply design tokens to already-rendered newsletter HTML.
 *
 * The generator bakes typography into every element inline, because email
 * clients (Outlook above all) do not reliably inherit font styles from a
 * container. The consequence is that changing the Design panel had no effect on
 * content that was already generated — the shell updated and the baked-in
 * element styles won. This walks the content and rewrites those declarations so
 * the panel controls the copy, not just the frame.
 *
 * Only touches properties the panel owns. Anything the user set by hand that the
 * panel does not control (bold, alignment, custom colors on a single word) is
 * left alone.
 */
export function restyleNewsletterContent(
  container: HTMLElement,
  design?: NewsletterDesign | null,
): void {
  const d = resolveDesign(DEFAULT_BRAND_KIT, design);

  // Body copy
  container.querySelectorAll<HTMLElement>("p, li, td, div[data-nl-section]").forEach((el) => {
    // Skip the muted placeholder caption — it has its own deliberate styling.
    if (el.closest("[data-nl-image-placeholder]")) return;
    if (el.tagName === "P" || el.tagName === "LI") {
      setStyle(el, "font-family", d.bodyFont);
      setStyle(el, "font-size", `${d.bodySize}px`);
      setStyle(el, "line-height", String(d.lineHeight));
      setStyle(el, "color", d.bodyColor);
    }
  });

  // Lists carry their own font declarations in the generated markup.
  container.querySelectorAll<HTMLElement>("ul, ol").forEach((el) => {
    setStyle(el, "font-family", d.bodyFont);
    setStyle(el, "font-size", `${d.bodySize}px`);
    setStyle(el, "line-height", String(d.lineHeight));
    setStyle(el, "color", d.bodyColor);
  });

  // Headings scale with the headline size rather than tracking it exactly, so
  // section headings stay visibly smaller than the masthead.
  container.querySelectorAll<HTMLElement>("h1, h2, h3").forEach((el) => {
    setStyle(el, "font-family", d.headingFont);
    setStyle(el, "color", d.bodyColor);
    const scale = el.tagName === "H1" ? 1 : el.tagName === "H2" ? 0.72 : 0.6;
    setStyle(el, "font-size", `${Math.round(d.headingSize * scale)}px`);
  });

  // Section spacing
  container.querySelectorAll<HTMLElement>("[data-nl-section]").forEach((el) => {
    setStyle(el, "margin", `0 0 ${d.sectionSpacing}px`);
  });

  // CTA buttons — an anchor with a solid background is a button, not a link.
  container.querySelectorAll<HTMLElement>("a").forEach((el) => {
    const bg = el.style.backgroundColor || el.style.background;
    if (!bg || bg === "transparent") return;
    setStyle(el, "background", d.accentColor);
    setStyle(el, "font-family", d.bodyFont);
    setStyle(el, "font-size", `${d.bodySize}px`);
  });

  // The callout rule on "Did you know?"
  container.querySelectorAll<HTMLElement>("[data-nl-section='did_you_know'] td").forEach((el) => {
    setStyle(el, "border-left", `4px solid ${d.accentColor}`);
  });
}

/**
 * String-in / string-out wrapper for {@link restyleNewsletterContent}.
 * Returns the input unchanged when no DOM is available (SSR).
 */
export function restyleNewsletterHtml(html: string, design?: NewsletterDesign | null): string {
  if (typeof document === "undefined") return html;
  const host = document.createElement("div");
  host.innerHTML = html;
  restyleNewsletterContent(host, design);
  return host.innerHTML;
}
