const { JSDOM } = require("jsdom");
const dom = new JSDOM("<!doctype html><html><body></body></html>");
global.document = dom.window.document;
const E = require("../.build/lib/editor-dom.js");
const R = require("../.build/lib/newsletter-render.js");
const B = require("../.build/lib/newsletter-brand.js");
const S = require("../.build/lib/emailSender.js");

let pass = 0, fail = 0;
const check = (n, c, d = "") => { c ? (pass++, console.log("  PASS", n)) : (fail++, console.log("  FAIL", n, d ? "\n        " + d : "")); };

const sections = [
  { kind: "hero_image", imagePrompt: "mirror" },
  { kind: "intro", paragraphs: ["Hi {first_name},"] },
  { kind: "key_insights", heading: "Takeaways", bullets: ["a", "b"] },
  { kind: "cta", ctaLabel: "Book", ctaUrl: "https://x.com/b" },
];

console.log("\n== R1: restyled content still survives the send-time sanitizer ==");
const ed = document.createElement("div");
ed.innerHTML = R.renderSections({ sections, brand: B.DEFAULT_BRAND_KIT, design: null });
E.restyleNewsletterContent(ed, { bodySize: 19, accentColor: "#123456", bodyFont: "Verdana, Geneva, sans-serif" });
const html = ed.innerHTML;
const clean = S.sanitizeEmailHtml(html);
check("sanitizer leaves restyled HTML untouched", clean === html,
  clean === html ? "" : "lost " + (html.length - clean.length) + " chars");
check("no event handlers introduced by jsdom serialization", !/\son[a-z]+=/i.test(html));
check("section markers survive restyle", (html.match(/data-nl-section=/g) || []).length === 4);
check("merge variable survives restyle", html.includes("{first_name}"));

console.log("\n== R2: issue label round-trips into the branded shell (F3) ==");
const ctx = {
  brand: B.brandKitFromSettings({ practice_name: "Fit Logic", clinic_address: "1 Main St" }),
  design: { issueLabel: "Monthly Newsletter · Issue 01", accentColor: "#0e9aa7" },
  issueLabel: null, title: "Hormones 101",
};
// Mirror what loadNewsletterShellContext does with a stored design.
ctx.issueLabel = ctx.design.issueLabel ?? null;
const shell = B.renderNewsletterShell({
  bodyFragment: "<p>x</p>", brand: ctx.brand, design: ctx.design,
  issueLabel: ctx.issueLabel, title: ctx.title, unsubscribeUrl: "https://u",
});
check("stored issue label reaches the real send", shell.includes("Monthly Newsletter · Issue 01"));
check("no label stored -> nothing invented", !B.renderNewsletterShell({
  bodyFragment: "<p>x</p>", brand: ctx.brand, design: {}, issueLabel: null, title: "T",
}).match(/January|February|March|April|May|June|July|August|September|October|November|December/));

console.log("\n== R3: design tokens are not a style-injection vector ==");
const ed3 = document.createElement("div");
ed3.innerHTML = "<p>hi</p>";
E.restyleNewsletterContent(ed3, { bodyColor: 'red;} body{display:none', bodyFont: 'x";onload="alert(1)' });
check("hostile color rejected, default used", !ed3.innerHTML.includes("display:none"));
check("hostile font rejected", !/onload/i.test(ed3.innerHTML));

console.log("\n== R4: restyle on non-newsletter content is harmless ==");
const ed4 = document.createElement("div");
const plain = '<p>Hi {first_name},</p><p>Short personal note.</p><p>— Megan</p>';
ed4.innerHTML = plain;
E.restyleNewsletterContent(ed4, {});
check("plain-text-style email keeps all its paragraphs", ed4.querySelectorAll("p").length === 3);
check("no tables or images introduced", !ed4.querySelector("table, img"));

console.log("\n" + "=".repeat(60));
console.log(`RESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
