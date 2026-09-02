const B = require("../.build/lib/newsletter-brand.js");
const R = require("../.build/lib/newsletter-render.js");
const S = require("../.build/lib/emailSender.js");
const V = require("../.build/lib/email-vars.js");

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, detail ? "\n        " + detail : ""); }
};

const brand = B.DEFAULT_BRAND_KIT;
const sections = [
  { kind: "hero_image", imagePrompt: "A woman looking at her hair in a mirror" },
  { kind: "intro", paragraphs: ["Hi {first_name},", "Short intro paragraph."] },
  { kind: "article", heading: "Why hormones matter", paragraphs: ["Body copy one.", "Body copy two."] },
  { kind: "key_insights", heading: "Key takeaways", bullets: ["One", "Two", "Three"] },
  { kind: "did_you_know", heading: "Did you know?", paragraphs: ["A grounded fact."] },
  { kind: "cta", paragraphs: ["Ready to talk?"], ctaLabel: "Book a consultation", ctaUrl: "https://fitlogic.com/book" },
];

console.log("\n== T1: sanitizeEmailHtml must not damage rendered sections ==");
const body = R.renderSections({ sections, brand, design: null });
const sanitized = S.sanitizeEmailHtml(body);
check("output survives the send-time sanitizer byte-for-byte", sanitized === body,
  sanitized === body ? "" : "diff length " + (body.length - sanitized.length));
check("data-nl-section markers survive", (sanitized.match(/data-nl-section=/g) || []).length === 6);
check("image placeholder marker survives", sanitized.includes("data-nl-image-placeholder"));

console.log("\n== T2: does the Design panel actually restyle generated content? ==");
const d1 = B.resolveDesign(brand, null);
const d2 = B.resolveDesign(brand, { bodySize: 22, bodyFont: "Verdana, Geneva, sans-serif", accentColor: "#ff0000", bodyColor: "#333333" });
const bodyDefault = R.renderSections({ sections, brand, design: d1 });
const bodyRestyled = R.renderSections({ sections, brand, design: d2 });
check("re-rendering from sections DOES honour new design", bodyDefault !== bodyRestyled);
check("  -> new body size lands in the HTML", bodyRestyled.includes("font-size:22px"));
check("  -> new accent lands on the CTA button", bodyRestyled.includes("background:#ff0000"));
// The real question: the editor stores HTML, not sections. Changing design later
// only re-renders the SHELL. Does the stored body still carry the OLD typography?
const shellNew = B.renderNewsletterShell({ bodyFragment: bodyDefault, brand, design: d2 });
check("stored body keeps its baked typography (why restyle-on-change exists)",
  shellNew.includes("font-size:15px"),
  "shell says " + (shellNew.match(/font-size:22px/) ? "22px" : "?") + " but the baked <p> styles still say 15px");

console.log("\n== T3: hostile brand + design values must not escape the style attribute ==");
const evilBrand = B.brandKitFromSettings({
  practice_name: '</td></tr></table><script>alert(1)</script>',
  brand_accent_color: 'red;background:url(javascript:alert(1))',
  brand_heading_font: 'x" onload="alert(1)',
  brand_logo_url: 'javascript:alert(1)',
  website_url: 'javascript:alert(1)',
  social_links: [{ label: "<img src=x onerror=alert(1)>", url: "javascript:alert(1)" }],
  medical_disclaimer: '<script>alert(1)</script>',
});
const evilShell = B.renderNewsletterShell({ bodyFragment: "<p>ok</p>", brand: evilBrand, design: null, title: '"><script>alert(1)</script>' });
check("no <script> tag reaches the output", !/<script/i.test(evilShell));
check("no javascript: URL reaches the output", !/javascript:/i.test(evilShell));
check("no onload/onerror handler reaches the output", !/\son(load|error)\s*=/i.test(evilShell));
check("hostile font value rejected, fallback used", evilShell.includes("Georgia"));
check("hostile accent value rejected", !evilShell.includes("url(javascript"));

console.log("\n== T4: normalizeSections against hostile model output ==");
check("null -> []", R.normalizeSections(null).length === 0);
check("string -> []", R.normalizeSections("nope").length === 0);
check("array of junk -> []", R.normalizeSections([null, 3, "x", {}]).length === 0);
check("unknown kind coerced to custom",
  R.normalizeSections([{ kind: "wat", paragraphs: ["hi"] }])[0].kind === "custom");
check("non-string paragraphs dropped",
  JSON.stringify(R.normalizeSections([{ kind: "intro", paragraphs: ["a", 5, null, "b"] }])[0].paragraphs) === '["a","b"]');
check("empty section dropped entirely", R.normalizeSections([{ kind: "intro" }]).length === 0);

console.log("\n== T5: resolveDesign clamping ==");
const clamped = B.resolveDesign(brand, { bodySize: 9999, headingSize: -5, lineHeight: 99, contentWidth: 1, sectionSpacing: -10 });
check("bodySize clamped to <= 24", clamped.bodySize === 24, "got " + clamped.bodySize);
check("headingSize clamped to >= 14", clamped.headingSize === 14, "got " + clamped.headingSize);
check("lineHeight clamped to <= 2.4", clamped.lineHeight === 2.4, "got " + clamped.lineHeight);
check("contentWidth clamped to >= 400", clamped.contentWidth === 400, "got " + clamped.contentWidth);
check("sectionSpacing clamped to >= 0", clamped.sectionSpacing === 0, "got " + clamped.sectionSpacing);
check("NaN falls back to default", B.resolveDesign(brand, { bodySize: NaN }).bodySize === 15);

console.log("\n== T6: merge variables through the full pipeline ==");
const merged = V.applyEmailVars(body, V.buildPatientVars({ firstName: "Fiel", lastName: "Q", email: "f@x.com" }));
check("{first_name} substituted inside a rendered section", merged.includes("Hi Fiel,"));
check("no raw placeholder left", !merged.includes("{first_name}"));

console.log("\n== T7: brand shell compliance elements ==");
const shell = B.renderNewsletterShell({
  bodyFragment: body,
  brand: B.brandKitFromSettings({ practice_name: "Fit Logic", clinic_address: "1 Main St, Austin TX", clinic_phone: "555", website_url: "https://fitlogic.com" }),
  design: null, issueLabel: "Monthly Newsletter", title: "Hormones 101",
  unsubscribeUrl: "https://app/unsub?t=1",
});
check("unsubscribe link present", shell.includes('href="https://app/unsub?t=1"'));
check("physical address present (CAN-SPAM)", shell.includes("1 Main St, Austin TX"));
check("medical disclaimer present", shell.includes("not medical advice"));
check("issue label rendered", shell.includes("Monthly Newsletter"));
check("title rendered", shell.includes("Hormones 101"));

console.log("\n== T8: CTA with no destination ==");
// Rendering intentionally still emits href="#" (removing the button would lose
// the CTA). The safeguard is at the generation layer: the route appends an
// explicit warning to unverifiedClaims, which the user must acknowledge.
const noUrl = R.renderSections({ sections: [{ kind: "cta", ctaLabel: "Book now" }], brand, design: null });
check("a CTA with no destination renders href=\"#\" (flagged on the checklist)", noUrl.includes('href="#"'));

console.log("\n" + "=".repeat(60));
console.log(`RESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
