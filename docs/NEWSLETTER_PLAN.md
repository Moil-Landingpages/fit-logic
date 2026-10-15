# Newsletter — status audit and execution plan

Audit date: 2026-10-15. Source: Megan's newsletter-testing feedback (mock-up PDF + questions), checked against `fit-logic` `main` (commit `fa26377`, PR #9) and this branch.

Verified in this audit: `tsc --noEmit` clean, `next build` passes. Production state (DB, env vars, DNS) cannot be verified from code and is marked **unverified**.

---

## 1. Megan's questions — resolved or not

| # | Feedback item | Status | Evidence |
|---|---|---|---|
| 1 | Detailed prompt gives a better newsletter than a short one | **Resolved** | Newsletter is now an explicit mode returning structured sections; shape no longer depends on prompt length (`generate-campaign/route.ts`, `newsletter-render.ts`) |
| 2 | Photo placeholder present in one run, missing in another | **Resolved** | Root cause was category-driven format selection; hero image is now a toggle and always rendered when on |
| 3 | AI invented "September" | **Resolved in code** | Grounding rules, Issue label input, strict-source mode, temperature drop, `factsUsed` / `unverifiedClaims` checklist |
| 4 | What to verify manually | **Resolved** | Accuracy-check panel + `NEWSLETTER_WORKFLOW.md` §2 |
| 5 | Add/remove/resize/reposition images, replace placeholder in place | **Resolved in code** | Image controls and `data-nl-image-placeholder` replace-in-place in `RichEmailEditor.tsx` |
| 6 | Fonts, sizes, spacing, backgrounds | **Resolved in code** | Design panel (`EmailDesignTools.tsx`) |
| 7 | Rearrange sections | **Resolved in code** | Section move/duplicate/delete |
| 8 | Undo unreliable | **Resolved in code** | App-owned snapshot stack (`use-editor-history.ts`) |
| 9 | Save a version before big edits | **Resolved, needs migration** | `email_template_versions` table — **migration unverified in prod** |
| 10 | Design instructions in the prompt | **Partly** | Design direction + image directions fields exist; exact colours/fonts deliberately go through the Design panel, not the prompt. Explain this to Megan rather than build more |
| 11 | Canva-style editor | **Not planned** | Partially covered by controls above. Side-by-side columns are not a section type. See Phase 4 |
| 12 | Reusable master template | **Resolved, needs migration + brand data** | Brand kit, master flag, "New issue from master", seeded master |
| 13 | Test sending | **Resolved in code** | `/api/send-test-email`. Was unauthenticated, fixed in this branch |

Net: the feature work is essentially done. What remains is **production setup, hardening, and verification**.

---

## 2. Done in this branch

- **Auth on send/AI routes.** `requireUser()` (`src/lib/api-auth.ts`) now guards `send-test-email`, `send-email`, `mail/send`, `send-inquiry-reply`, `process-campaign-queue`, `generate-campaign`, `generate-faq-answer`. Previously anyone on the internet could POST to `process-campaign-queue` (bulk send) or `send-email`. All in-app callers now use `apiFetch()` (`src/lib/api-fetch.ts`), which attaches the Supabase session token. Cron keeps its `CRON_SECRET` check.
- **Server-side send guard.** `findNewsletterSendBlockers()` blocks a live newsletter send if the saved body still contains an image placeholder, a `#`/empty link, or `[add your …]` bracket text. Enforced in both `process-campaign-queue` and `cron/schedule`; the reason surfaces in the Send Now toast via `first_error`. Previously this was only a client-side hint.

---

## 3. Execution plan

### Phase 0 — Production setup (blocks first send) — owners: dev / Fiel / Megan
Not verifiable from code. Detail in `NEWSLETTER_ACTION_ITEMS.md`.
1. Apply migration `20260901000001_newsletter_brand_kit.sql`.
2. `GEMINI_API_KEY` set on the **production** Vercel environment.
3. Public `emails` storage bucket + authenticated upload policy.
4. Fill Settings → Brand, including the **postal address (CAN-SPAM)**. Megan approves the disclaimer wording.
5. Verify the sending domain (SPF/DKIM/DMARC); set `email_from_address` on it. Start first — DNS lag.
6. Clean the recipient segment (opted-in only, no role addresses, most engaged first).
7. **Turn off `test_mode_only`** in Settings → Campaign Defaults. It defaults to **on**, and while on only contacts flagged `is_test_contact` receive anything. This is not in the existing action list and is the most likely reason a first send "succeeds" to nobody.
8. Deploy this branch and set `CRON_SECRET` if not already set.

### Phase 1 — Verify end to end on real infrastructure (before first send)
Needs a deployed environment; none of this can be tested from static code.
1. Generate with Source material + strict mode; confirm no month/date appears and the accuracy panel populates.
2. Replace the hero placeholder, add alt text, move a section, change a design colour, undo/redo each.
3. Save a version, edit, restore.
4. Test send → Gmail and Outlook; confirm SPF/DKIM/DMARC pass, logo loads, every link works, unsubscribe row present.
5. Create a campaign from the master template; confirm the send guard blocks a draft with a leftover placeholder, then passes once fixed.
6. Small live send to the internal segment; check the unsubscribe link actually unsubscribes.

### Phase 2 — Hardening (this week, not blocking)
1. Regenerate `src/integrations/supabase/types.ts` after the migration and remove the `as any` / `as unknown as` casts in the newsletter and queue code. Needs Supabase project access.
2. Add minimal automated tests for the pure logic (`newsletter-render`, `normalizeSections`, `findNewsletterSendBlockers`, `sanitizeEmailHtml`, `applyEmailVars`). The repo has no test runner; adding Vitest is small and these modules are pure.
3. Configure ESLint (`next lint` currently prompts interactively because there is no config).
4. Resolve the issues from the independent code review (section 5).
5. Rate-limit `generate-campaign` (paid Gemini calls) and `send-test-email`.

### Phase 3 — Process
1. Agree cadence, owners (writer / medical reviewer / sender), `max_sends_per_day` above list size.
2. Record baseline open/click/unsubscribe/complaint rates after the first send.
3. Megan's workflow doc: fold `NEWSLETTER_WORKFLOW.md` into whatever she is already documenting.

### Phase 4 — Product backlog (decide, don't assume)
- Side-by-side image/text columns.
- AI-generated imagery or a stock-photo picker.
- Interpreting free-text design instructions into the Design panel automatically.
- Custom brand fonts (limited by Outlook/Gmail, so likely never).

---

## 4. Repository note

`Fitlogic/FITLOGIC-CRM` (second repo in this session) is **behind** `Moil-Landingpages/fit-logic`: none of the newsletter work exists there (no `newsletter-*` files, no docs). All work above is in `fit-logic`. Decide which repo is canonical before anyone deploys from the other one.

---

## 5. Independent code review

_Pending — see below._
