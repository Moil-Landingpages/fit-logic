const { JSDOM } = require("jsdom");
const dom = new JSDOM("<!doctype html><html><body></body></html>");
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;

const E = require("../.build/lib/editor-dom.js");
const R = require("../.build/lib/newsletter-render.js");
const B = require("../.build/lib/newsletter-brand.js");

let pass = 0, fail = 0;
const check = (n, c, d = "") => { c ? (pass++, console.log("  PASS", n)) : (fail++, console.log("  FAIL", n, d ? "\n        " + d : "")); };

const sections = [
  { kind: "hero_image", imagePrompt: "woman looking in a mirror" },
  { kind: "intro", paragraphs: ["Hi {first_name},"] },
  { kind: "article", heading: "Why hormones matter", paragraphs: ["Copy."] },
  { kind: "key_insights", heading: "Key takeaways", bullets: ["One", "Two"] },
  { kind: "did_you_know", heading: "Did you know?", paragraphs: ["A fact."] },
  { kind: "cta", paragraphs: ["Ready?"], ctaLabel: "Book", ctaUrl: "https://x.com/b" },
];
const makeEditor = () => {
  const ed = document.createElement("div");
  ed.innerHTML = R.renderSections({ sections, brand: B.DEFAULT_BRAND_KIT, design: null });
  return ed;
};

console.log("\n== D1: generated HTML is addressable as top-level blocks ==");
let ed = makeEditor();
const blocks = Array.from(ed.children);
check("every section is a direct child of the editor", blocks.length === 6, "got " + blocks.length);
check("each carries data-nl-section", blocks.every(b => b.hasAttribute("data-nl-section")));
const innerP = ed.querySelector("[data-nl-section='article'] p");
check("topLevelBlockOf climbs from a nested <p> to its section",
  E.topLevelBlockOf(ed, innerP)?.getAttribute("data-nl-section") === "article");
check("topLevelBlockOf returns null for an outside node",
  E.topLevelBlockOf(ed, document.createElement("p")) === null);

console.log("\n== D2: section reordering ==");
ed = makeEditor();
const before = Array.from(ed.children).map(b => b.getAttribute("data-nl-section"));
E.moveBlock(ed, ed.children[2], -1);
const after = Array.from(ed.children).map(b => b.getAttribute("data-nl-section"));
check("move up swaps with the previous section",
  after[1] === before[2] && after[2] === before[1], before + " -> " + after);
check("move up at the top is a no-op", E.moveBlock(ed, ed.children[0], -1) === false);
check("move down at the bottom is a no-op", E.moveBlock(ed, ed.children[5], 1) === false);
E.moveBlock(ed, ed.children[0], 1);
check("move down works", ed.children[0].getAttribute("data-nl-section") === after[1]);
check("no sections lost during moves", ed.children.length === 6);

console.log("\n== D3: duplicate + delete ==");
ed = makeEditor();
E.duplicateBlock(ed.children[1]);
check("duplicate inserts directly after the original", ed.children.length === 7 &&
  ed.children[1].getAttribute("data-nl-section") === ed.children[2].getAttribute("data-nl-section"));
ed = makeEditor();
ed.querySelector("[data-nl-image-placeholder]");
const heroImgHtml = '<div data-nl-section="hero_image"><table><tr><td align="center"><img src="a.png"></td></tr></table></div>';
const ed2 = document.createElement("div"); ed2.innerHTML = heroImgHtml;
const img = ed2.querySelector("img");
check("deleting a lone image targets its wrapper table",
  E.deletionTargetFor(img, "image").tagName === "TABLE");
const ed3 = document.createElement("div");
ed3.innerHTML = '<table><tr><td>caption text<img src="a.png"></td></tr></table>';
check("deleting an image beside text targets only the image",
  E.deletionTargetFor(ed3.querySelector("img"), "image").tagName === "IMG");

console.log("\n== D4: image controls ==");
const ed4 = document.createElement("div");
ed4.innerHTML = '<table><tr><td align="center"><img src="a.png" width="100%"></td></tr></table>';
const i4 = ed4.querySelector("img");
E.setImageWidth(i4, 50);
check("width attribute set for email clients", i4.getAttribute("width") === "50%");
check("width style set for modern clients", i4.style.width === "50%");
E.setImageWidth(i4, 9999);
check("width clamped to 100%", i4.getAttribute("width") === "100%");
E.setImageAlign(i4, "left");
check("align left sets margins", i4.style.marginLeft === "0px" || i4.style.marginLeft === "0");
check("align left updates the cell attribute", ed4.querySelector("td").getAttribute("align") === "left");
E.setImageAlign(i4, "right");
check("align right flips the margins", i4.style.marginRight === "0px" || i4.style.marginRight === "0");
E.setImageAlt(i4, 'a "quoted" alt');
check("alt text set", i4.getAttribute("alt") === 'a "quoted" alt');

console.log("\n== D5: replace an AI placeholder in place (the reported complaint) ==");
ed = makeEditor();
const ph = ed.querySelector("[data-nl-image-placeholder]");
check("placeholder exists before replace", !!ph);
const imgsBefore = ed.querySelectorAll("img").length;
E.replaceImageTarget(ph, "https://cdn/photo.jpg");
check("exactly one image now exists", ed.querySelectorAll("img").length === imgsBefore + 1);
check("placeholder marker is gone", !ed.querySelector("[data-nl-image-placeholder]"));
check("no second image added below", ed.querySelectorAll("[data-nl-section='hero_image'] img").length === 1);
check("hero section count unchanged", ed.children.length === 6);
const ed5 = document.createElement("div");
ed5.innerHTML = '<img src="old.png">';
E.replaceImageTarget(ed5.querySelector("img"), 'https://cdn/x.jpg?a="b');
check("quotes in a replacement URL cannot break out of the attribute",
  !ed5.innerHTML.includes('src="https://cdn/x.jpg?a="b"'));

console.log("\n== D6: design panel restyles ALREADY-GENERATED content (F1 fix) ==");
ed = makeEditor();
check("starts at the default body size", ed.innerHTML.includes("font-size:15px"));
E.restyleNewsletterContent(ed, { bodySize: 21, bodyFont: "Verdana, Geneva, sans-serif", accentColor: "#ff0000", lineHeight: 2, sectionSpacing: 40 });
const p = ed.querySelector("[data-nl-section='article'] p");
check("paragraph font-size follows the panel", p.style.fontSize === "21px", "got " + p.style.fontSize);
check("paragraph font-family follows the panel", p.style.fontFamily.includes("Verdana"));
check("line-height follows the panel", p.style.lineHeight === "2");
const li = ed.querySelector("li");
check("list items restyled too", li.style.fontSize === "21px");
const btn = ed.querySelector("[data-nl-section='cta'] a");
check("CTA button takes the new accent", /rgb\(255, 0, 0\)|#ff0000/.test(btn.style.background || btn.style.backgroundColor));
const sec = ed.querySelector("[data-nl-section='intro']");
check("section spacing follows the panel", sec.style.margin.includes("40px"), "got " + sec.style.margin);
const h2 = ed.querySelector("h2");
check("headings restyled", h2.style.fontFamily.length > 0);
check("the CTA href is untouched by restyling", ed.querySelector("[data-nl-section='cta'] a").getAttribute("href") === "https://x.com/b");
check("no sections lost during restyle", ed.children.length === 6);
E.restyleNewsletterContent(ed, {});
check("restyle is idempotent-safe / resets to brand defaults",
  ed.querySelector("[data-nl-section='article'] p").style.fontSize === "15px");

console.log("\n== D7: restyle must not corrupt hand-authored content ==");
const ed7 = document.createElement("div");
ed7.innerHTML = '<p style="font-size:15px;text-align:center"><strong>Bold</strong> and <a href="https://x.com">a link</a></p>';
E.restyleNewsletterContent(ed7, { bodySize: 18 });
check("text-align preserved", ed7.querySelector("p").style.textAlign === "center");
check("<strong> preserved", !!ed7.querySelector("strong"));
check("plain link left alone (no background = not a button)",
  !ed7.querySelector("a").style.background);
check("href preserved", ed7.querySelector("a").getAttribute("href") === "https://x.com");

console.log("\n" + "=".repeat(60));
console.log(`RESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
