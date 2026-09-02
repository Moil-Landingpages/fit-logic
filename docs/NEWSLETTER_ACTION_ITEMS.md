# Action items — what we must do before the first newsletter goes out

Everything in this list is on **us**, not the code. The build is merged; none of
it does anything until these steps are done.

Ordered so that each step unblocks the next. Realistic total: about 2 hours of
work plus whatever the DNS records take to propagate.

---

## Blockers — the first newsletter cannot be sent until these are done

### 1. Apply the database migration
**Owner: dev · 5 minutes**

Run `supabase/migrations/20260901000001_newsletter_brand_kit.sql` against the
production Supabase project (SQL editor, or `supabase db push`).

It adds the brand-kit columns, master-template flags, and the
`email_template_versions` table, and seeds the starter master newsletter.

Everything is additive and guarded with `IF NOT EXISTS`, so it is safe to run on
the live database. Until it runs:
- Settings → Brand saves will fail
- Version history will not save snapshots
- Newsletters send inside the old generic wrapper instead of the branded shell

**How to confirm it worked:** open Campaigns → Templates. A template named
"Fit Logic Monthly Newsletter — Master" with a ⭐ Master badge should be there.

---

### 2. Confirm `GEMINI_API_KEY` is set in production
**Owner: dev · 2 minutes**

The AI wizard returns a 500 without it. Check the Vercel project environment
variables for the production environment specifically — a key set only on
preview will not help the live site.

---

### 3. Create the `emails` storage bucket and make it public
**Owner: dev · 5 minutes**

Logo uploads and newsletter image uploads both write to a Supabase Storage
bucket named `emails`, then embed the **public URL** in the email HTML.

In Supabase → Storage:
- Bucket `emails` exists
- It is marked **Public** (a private bucket produces broken images in every
  recipient's inbox — the URL will 400)
- Upload policy allows authenticated users to insert

**How to confirm:** upload a logo in Settings → Brand, then open the preview
pane. If the logo renders there, it will render in email.

---

### 4. Fill in the brand kit
**Owner: Fiel / Megan · 20 minutes**

Settings → **Brand**. This is the fixed half of every newsletter, so it is worth
getting right once.

- [ ] Logo (PNG with transparent background, roughly 300–600px wide, under 2 MB)
- [ ] Accent colour — used for buttons, the header rule, and links
- [ ] Page background, card background, body text colour
- [ ] Heading font and body font
- [ ] **Clinic mailing address — legally required.** CAN-SPAM requires a
      physical postal address on every marketing email. Without it we risk
      penalties and spam-folder placement.
- [ ] Phone and website
- [ ] Social links
- [ ] Review the seeded medical disclaimer. A default is provided, but **Megan
      should approve the exact wording** since this is patient-facing health
      content.

The preview pane on the right shows the real shell as you type.

---

### 5. Verify the sending domain
**Owner: dev + whoever controls DNS · 15 minutes of work, up to 48h to propagate**

This is the single biggest determinant of whether the newsletter lands in the
inbox or in spam, and it is the item most likely to delay the send — start it
first even though it is listed fifth.

- [ ] Add the domain in the Resend dashboard
- [ ] Add the SPF, DKIM and DMARC records it gives you to DNS
- [ ] Wait for Resend to show "Verified"
- [ ] Set `email_from_address` in Settings → Integrations to an address on that
      verified domain — **not** a gmail.com or yahoo.com address. Gmail and
      Yahoo reject bulk mail that claims to be `from` their domains.
- [ ] Set `email_from_name` to something recipients recognise ("Fit Logic" or
      "Megan at Fit Logic")

**How to confirm:** send a test to a Gmail address, open it, and use "Show
original". SPF, DKIM and DMARC should all read PASS.

---

### 6. Confirm the recipient list is genuinely opted in
**Owner: Fiel / Megan · 30 minutes**

Before the first bulk send, review the segment that will receive it.

- [ ] Every contact opted in to marketing email — no scraped, purchased, or
      inferred addresses
- [ ] Remove role addresses (`info@`, `admin@`, `contact@`) — they hurt
      deliverability and rarely convert
- [ ] Remove anything obviously stale (no interaction in 12+ months) from the
      *first* send. Send to your most engaged contacts first; a strong opening
      reputation makes later sends land better.
- [ ] Confirm the suppression list is respected (it is, automatically — this is
      just a sanity check that it is not empty when it should not be)

If the list is over ~500 and has never been mailed, send in batches over
several days rather than all at once.

---

## Before each individual newsletter

### 7. Run the pre-send checklist
**Owner: whoever builds the issue · 15 minutes per issue**

- [ ] Paste the source article into **Source material** and leave **"Only use
      facts from source"** on
- [ ] Read the **Accuracy check** panel top to bottom. Confirm every item under
      "Facts the AI used" actually appears in your source, and resolve
      everything under "Needs your confirmation"
- [ ] **Megan reviews any medical or wellness claim before send.** The app
      blocks saving until someone ticks the box; that box means a human read it,
      not that the AI checked itself.
- [ ] Replace every image placeholder with a real photo
- [ ] Confirm you have the rights to every image used
- [ ] Add alt text to every image (accessibility, and it is what shows when a
      client blocks images by default — many do)
- [ ] Click **Test send**. Open it on **desktop and phone**. Click **every**
      link including the CTA button and the unsubscribe link.
- [ ] Confirm the subject line and preview text read well together in the inbox
      list, not just in the editor

---

## Should do soon, not blocking the first send

### 8. Add authentication to the send API routes
**Owner: dev · half a day**

`/api/send-test-email` has no auth check. Neither does the pre-existing
`/api/send-email`. An unauthenticated POST to either could send mail through our
provider and our domain reputation.

Test send is capped at one recipient with a forced `[TEST]` subject prefix, so
the blast radius is small — but this should be fixed across all send routes
together rather than patched one at a time. Not a first-send blocker; do it in
the same week.

### 9. Regenerate the Supabase TypeScript types
**Owner: dev · 15 minutes**

`src/integrations/supabase/types.ts` predates several migrations. The new
newsletter code casts through `any` in a handful of places as a result, which
means the compiler is not checking those queries. Regenerate after the migration
lands and remove the casts.

### 10. Decide the sending cadence and put it on the calendar
**Owner: Fiel / Megan · 15 minutes**

- What day and time each month? (Tuesday–Thursday mornings usually perform best)
- Who writes the draft, who reviews the medical claims, who presses send?
- Check `max_sends_per_day` in Settings → Campaigns is above the list size, or
  the send will spread across several days without warning.

### 11. Set a baseline for what "working" means
**Owner: Fiel · after the first send**

Record open rate, click rate, unsubscribes and spam complaints from the first
issue. Without a baseline there is no way to tell whether issue two is better.

Watch the complaint rate especially — above 0.1% is a deliverability problem
that compounds across every future send.

---

## Known limits to set expectations around

These are current product limits, not bugs. Worth knowing before someone asks.

- Fonts are limited to web-safe stacks. Custom brand fonts do not render
  reliably in Outlook or Gmail, so they are not offered.
- Images are single-column and full-width. Side-by-side image/text columns are
  not a section type yet.
- The AI does not generate images. It produces labelled placeholders describing
  the photo to use.
- Version history keeps the 50 most recent snapshots per template.
- Undo covers the current editing session only. For anything larger, save a
  version first.

---

## Quick reference

| Item | Owner | Time | Blocks first send? |
|---|---|---|---|
| 1. Apply migration | dev | 5 min | Yes |
| 2. `GEMINI_API_KEY` in prod | dev | 2 min | Yes |
| 3. Public `emails` bucket | dev | 5 min | Yes |
| 4. Fill brand kit | Fiel / Megan | 20 min | Yes |
| 5. Verify sending domain | dev + DNS | 15 min + propagation | Yes — start first |
| 6. Review recipient list | Fiel / Megan | 30 min | Yes |
| 7. Pre-send checklist | issue author | 15 min/issue | Every issue |
| 8. Auth on send routes | dev | half a day | No |
| 9. Regenerate Supabase types | dev | 15 min | No |
| 10. Cadence and owners | Fiel / Megan | 15 min | No |
| 11. Baseline metrics | Fiel | after send | No |

The full feature walkthrough is in
[`NEWSLETTER_WORKFLOW.md`](./NEWSLETTER_WORKFLOW.md).
