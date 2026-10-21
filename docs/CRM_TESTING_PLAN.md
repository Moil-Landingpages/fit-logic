# Fit Logic CRM testing (Fiel, 2026-10-21): audit and implementation plan

Source: Fiel's email "Fit Logic CRM testing — saving errors and email setup" (cc Megan). Audited against `fit-logic` branch `claude/funny-shannon-cmbky0` at `602f97e`. Production database, DNS and mailbox state cannot be seen from code; those rows are marked **unverified**.

---

## 1. Audit — each finding, cause, and who acts

| # | What Fiel saw | Root cause | Evidence | Owner |
|---|---|---|---|---|
| 1 | Brand settings won't save | Migration `20260901000001` not applied in production, so `practice_settings` has no brand columns and the update is rejected. Same migration as #5. | Brand save writes `brand_*`, `clinic_*`, `website_url`, `social_links` (`BrandKitTab.tsx` `handleSave`); all added only by that migration. #5 proves the DB lacks it. | **Dev: run migration** |
| 1b | "Explain how saved branding applies to each tool" | Brand applies to **newsletters only**. See §2. | `loadNewsletterShellContext` returns null unless `template_kind = 'newsletter'`; sequences never get it. | Dev: document, then decide scope (Phase 3) |
| 2a | AI Wizard test email lacks teal header and contact details | **Separate from the save error.** The Wizard produces ordinary/sequence emails, which send in the generic wrapper. The branded shell is applied only to newsletter templates. Fixing the migration alone will not change this. | `wrapEmailHtml` (generic) vs `wrapNewsletter`; `AISequenceWizard` output is never `template_kind = 'newsletter'`. | Dev: Phase 3 |
| 2b | Recipe link plain text, not a button | By design for the non-newsletter formats: the generator prompt says near-plain-text, "one CTA as a plain `<a>` link". Fine for cold outreach, wrong for a recipe share. | `TEXT_STYLE_FORMAT` in `generate-campaign/route.ts` | Dev: Phase 3 |
| 2c | Sender shows `FitLogic <partners@moilapp.com>` | Two causes. Name: either `email_from_name` is empty (code falls back to the hard-coded `"FitLogic"`) or it was saved as "FitLogic" — **unverified which**. Address: `FROM_EMAIL` env var **overrides** the Settings value. | `process-campaign-queue`: `process.env.FROM_EMAIL ?? settings.email_from_address`, `settings.email_from_name ?? "FitLogic"` | Name: Fiel (Settings → Integrations). Address: Dev + DNS |
| 2d | "Sending account is connected to Outlook — will campaigns use it?" | **No.** Campaigns send through **Resend** with the From address above; Gmail is only a fallback if Resend fails. The Outlook connection powers inbox/calendar/one-off mail, not campaign sending. There is no Outlook sender path. | `sendEmail()` in `emailSender.ts`: Resend first, Gmail fallback only. `providers/microsoft.ts` used by mail/calendar routes only. | Dev: answer; Megan: decide |
| 2e | Where do replies go? | No `Reply-To` is ever set, so replies go to the From address, here a `moilapp.com` mailbox, i.e. **not Fit Logic's**. | No `reply_to` anywhere in `src/` or `app/` | Dev + Megan (§3) |
| 2f | Test email landed in Promotions | Normal for a first message from a new sender; reputation builds with engagement. The CRM tracked open and click correctly. | n/a | Process |
| 3a | Image instructions produce a placeholder | **Intended.** The AI does not generate images. | NEWSLETTER_WORKFLOW §8 | Product decision, §5 |
| 3b | Save error `'design' column of 'email_templates'` | Same missing migration as #1. | `handleAIAccept` inserts `design`, `template_kind`, etc. | **Dev: run migration** |
| 3c | **Draft disappeared; can it be recovered?** | **Code bug.** `handleAccept` calls `onAccept(...)` without waiting, then immediately clears the wizard state **and the localStorage draft** and closes the dialog, even when the save fails. | `AICampaignCreator.tsx` `handleAccept` → `handleReset()` + `onOpenChange(false)`; `handleAIAccept` returns on error after the toast. | Dev: fix (Phase 1) |
| 3d | Recovery of the lost draft | Not recoverable: the draft lived only in Fiel's browser storage and was deleted. Nothing was written to the database. Regenerate; Fiel should keep the source recipe text. | n/a | Fiel |
| 4 | Copy drifted from the recipe ("raw" → "toasted", "a lighter alternative") | Strict mode only forbids new *facts*, and explicitly allows "rewrite, reorganise, summarise". Ingredient state words are paraphrased freely. The accuracy checker did catch one. Temperature is already 0.2 in strict mode. | `STRICT_SOURCE_RULES`; `generationConfig.temperature` | Dev: Phase 2 |
| + | Generic wrapper has no postal address | Non-newsletter sends carry only "You received this email because you opted in" + unsubscribe. No physical address (CAN-SPAM). Found while checking 2a. | `wrapEmailHtml` footer | Dev: Phase 1 |

---

## 2. How branding applies today (the answer for Fiel/Megan)

| Tool | Gets brand header/footer? | Notes |
|---|---|---|
| AI Campaign Creator, email type **Newsletter** | Yes, after migration | Structured sections, teal button, image placeholder |
| Templates → "New issue from master" | Yes, after migration | |
| AI Wizard (single email or sequence) | **No** | Plain-text style by design; generic wrapper |
| Hand-built templates and campaigns | **No** unless the template is of kind newsletter | |
| Test send | Yes for newsletter shell; otherwise as above | Unsubscribe not clickable in a test |

---

## 3. Implementation plan

### Phase 0 — Setup (this week; unblocks retest)
| # | Task | Owner | Time |
|---|---|---|---|
| 0.1 | Run migration `20260901000001_newsletter_brand_kit.sql` in the Supabase SQL editor. Ends with `NOTIFY pgrst, 'reload schema'`. Confirm: Campaigns → Templates shows "Fit Logic Monthly Newsletter — Master". | Dev (Andres) | 5 min |
| 0.2 | Confirm bucket `emails` exists, is Public, allows authenticated upload (needed for logo). | Dev | 5 min |
| 0.3 | Settings → Integrations: set **From name** = "Fit Logic Functional Medicine". | Fiel | 2 min |
| 0.4 | Supply brand assets: PNG/JPG logo (transparent PNG, ~300–600 px wide), address, phone, website, socials, approved disclaimer. | Fiel / Megan | 20 min |
| 0.5 | Decide the sending domain (see 2.3). | Megan + Andres | decision |
| 0.6 | Deploy the branch so the fixes in Phase 1 are live. | Dev | — |

### Phase 1 — Fix now (code, small)
| # | Task | Acceptance |
|---|---|---|
| 1.1 | **Don't lose the draft on a failed save.** `onAccept` returns a promise; the wizard resets/closes only on success, keeps the localStorage draft on failure and shows the error inside the dialog. | Force a save error: dialog stays open, draft and source text intact, retry works. |
| 1.2 | Show the **exact** save error on Brand save (currently a generic toast), including "migration not applied" detection (missing-column message → plain-language hint). | Fiel can copy a meaningful message. |
| 1.3 | Postal address in the generic wrapper footer (from brand kit `clinic_address`), and block live sends with no address in **all** send paths, not only newsletters. | Send without address is refused with a clear message. |
| 1.4 | Start the From-name fallback from the practice name instead of the hard-coded "FitLogic". | Blank setting → "Fit Logic Functional Medicine" (or practice name). |

### Phase 2 — Keep copy closer to the source
| # | Task | Acceptance |
|---|---|---|
| 2.1 | Add a **"Preserve source wording"** mode (default on when source supplied): ingredients, quantities, preparation words and method steps copied verbatim; paraphrase only the intro and connective copy. Prompt rule plus structured `verbatimBlocks` output the renderer inserts untouched. | Run the pistachio recipe 5 times: ingredient list byte-identical each time. |
| 2.2 | Deterministic **source diff check** after generation: flag any output word of a risky class (ingredient/adjective/number/unit) that is not in the source. Shown in the Accuracy panel. Catches "toasted" without trusting the model to self-report. | "toasted" and "a lighter alternative" are both flagged. |
| 2.3 | Document: strict mode = no new facts, not no rewording. Add a short "recipe/article" prompt example to the workflow doc. | Doc updated. |

### Phase 3 — Branding on every email tool (needs a scope decision from Megan)
Options, recommended first:
- **A. (Recommended)** Add a per-template/campaign "Branded layout" switch. When on, any email (Wizard single email, hand-built template) sends in the brand shell, and the Wizard gets an "Email style: Plain / Branded" choice. Branded style produces a real button for the link.
- B. Brand shell on all campaign emails by default, with plain as opt-out. Simplest rule, but changes cold-outreach emails that are intentionally plain for deliverability.
- C. Newsletters only (today). Keep and just document.

Work for A: `template_kind`-independent shell flag, wizard format selection, sequence-step support (shell is currently skipped for sequences), tests that a branded single email and a sequence step both render header, button and footer. Include the clickable test-send unsubscribe.

### Phase 4 — Sender, replies, and staff access (needs Megan's security review first)
Facts: campaigns send via Resend from one address; replies go to that address; Outlook is for inbox/calendar only.

| # | Item | Notes |
|---|---|---|
| 4.1 | **Sending domain.** Move from `partners@moilapp.com` to an address on Fit Logic's own domain (e.g. `hello@fitlogicfunctionalmedicine.com`): add the domain in Resend, add SPF/DKIM/DMARC DNS records, remove or update the `FROM_EMAIL` env override so Settings controls it. | Needs whoever controls Fit Logic DNS. Up to 48 h to propagate. |
| 4.2 | **Reply-To setting.** Add `email_reply_to` to Settings → Integrations and send it as `reply_to` on every campaign email, so replies reach a Fit Logic mailbox regardless of the sending address. | Small code change. Requires the migration. |
| 4.3 | **Where replies are read and who can access them.** Options for Megan to evaluate: (a) a shared mailbox in Microsoft 365 with named staff granted access, no shared password; (b) a Microsoft 365 group/distribution list forwarding to named staff; (c) reading replies inside the CRM inbox via the connected mailbox. Review each for: who gets access, audit trail, PHI exposure, offboarding, MFA. | **No change until Megan approves.** I will not configure anything here. |
| 4.4 | **Outlook as a campaign sender.** Not supported and not recommended for bulk mail (Microsoft sending limits, and bulk mail through a personal mailbox risks the mailbox's reputation). Keep Resend; use Outlook for replies. | Answer for Fiel; revisit only if Megan wants it. |

### Phase 5 — Retest
Retest after Phase 0 and 1 (about one working day after the migration is run):
1. Save Brand (address, phone, website, socials, logo) and reload. Values persist.
2. Creator → Newsletter with the recipe as source: generate, replace the image placeholder, mark reviewed, save. Template exists in Templates.
3. Force a failure (e.g. disconnect) and confirm the draft survives.
4. Test send: teal header, contact footer, button, from-name "Fit Logic Functional Medicine".
5. Open the email in Gmail and Outlook. Record tab placement.

Retest of Phases 2–4 follows each phase.

---

## 4. Answer to "which items need fixes from you / from us / when can we retest?"

- **Fixes on the dev side:** run the migration (fixes #1 and #3b), draft-loss bug (1.1), exact save errors (1.2), address in footer (1.3), source-fidelity (Phase 2), branding on the Wizard (Phase 3), Reply-To (4.2).
- **Setup on Fit Logic's side:** From name (0.3), brand assets (0.4), domain decision and DNS access (0.5/4.1), Megan's access/security review (4.3).
- **Retest:** Phases 0 and 1 can be retested together as soon as the migration is run and the branch is deployed.

---

## 5. Open decisions

1. Branding scope: A, B or C (Phase 3).
2. Sending domain and who controls DNS (4.1).
3. Reply handling model, after Megan's review (4.3).
4. Images: stay with placeholders, or add stock-photo search / AI image generation (cost, medical-imagery licensing and accuracy concerns). Recommendation: placeholders for now.
