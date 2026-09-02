# Newsletter workflow — Fit Logic

This is the answer to the questions raised while building the first monthly
newsletter, plus the recommended end-to-end process. Everything described here
is in the app; nothing needs a developer.

---

## 1. The short version — recommended monthly workflow

1. **Settings → Brand** — set once. Logo, colors, fonts, clinic address, phone,
   website, social links, medical disclaimer. Every newsletter is built inside
   this shell, so recipients see the same masthead and footer each month.
2. **Campaigns → Templates → "New issue from master"** — duplicates the master
   newsletter. Only the variable content changes: topic, hero image, article,
   takeaways, CTA.
   *(Or start from the AI wizard instead — step 3.)*
3. **AI Campaign Creator → Email type: Newsletter.**
   - Paste the source article into **Source material**.
   - Leave **"Only use facts from source"** on.
   - Set the issue label, section count, hero image, CTA button and image
     directions.
4. **Review step** — read the **Accuracy check** panel, fix anything flagged,
   tick the confirmation box. Saving is blocked until you do.
5. **Edit** — resize/replace/move images and sections, adjust colors and fonts
   with the **Design** panel. Save a snapshot from **Versions** before any big
   change.
6. **Test send** — send yourself a copy, open it on desktop *and* phone, click
   every link.
7. Assign the segment, schedule, send.

---

## 2. "Why did it invent 'September'?"

It used to. The generator was free-form: it filled gaps with plausible-sounding
detail, including months, issue names and statistics that were in neither the
prompt nor the article.

That is now closed off:

- The model is explicitly forbidden to invent a month, season, date, issue
  number, statistic, study, testimonial, price, timeline or location.
- **Issue label** is an input. Leave it blank and no date appears anywhere. Fill
  it in and it is used verbatim.
- **Source material + "Only use facts from source"** makes the pasted article
  the only permitted source of fact. Generation temperature drops in this mode,
  so output is more literal and more repeatable.
- Every run returns two lists shown in the **Accuracy check** panel:
  - **Facts the AI used** — each specific claim and where it came from.
  - **Needs your confirmation** — anything generalised, any wellness claim, any
    placeholder left behind.

### What to always verify before publishing

Regardless of settings, check these four every time (the panel lists them):

| Check | Why |
|---|---|
| Dates, months, issue names | Model-invented time references were the original failure |
| Statistics, percentages, studies | Must appear verbatim in your source |
| Medical claims | Nothing may read as diagnosis, guarantee or treatment promise |
| Links and CTA | Only a test send proves a link actually works |

**Answering the direct questions:** the wizard draws on (a) your prompt, (b) the
source material, and (c) the built-in Fit Logic brand context. With strict mode
on it may not add anything else. With strict mode off — or with no source
material at all — it can still generalise, so the panel marks the draft
high-risk and lists everything for review.

---

## 3. "Why did one version have a photo placeholder and the other didn't?"

That was a real bug, and it is fixed.

The old generator picked a *category* (welcome / promotional / educational /
…), and the output format was chosen from that category. Two of those
categories got a branded HTML format that allowed one image; the rest got a
deliberately plain, **image-free** text format tuned for cold outreach reply
rates. Same prompt, different category guess, structurally different email.

Now: choosing **Email type: Newsletter** routes to a dedicated newsletter
generator regardless of category. The model returns *structured sections*
(intro, article, key insights, did-you-know, approach, CTA), and the app renders
them with a fixed layout. Consequences:

- Every issue has the same skeleton, whatever wording the prompt uses.
- The hero image and CTA button appear because you toggled them on, not because
  the model felt like it.
- Design tokens are applied by the app, so colors and fonts are exact.
- Because sections are real blocks, they can be reordered after generation.

The detailed prompt approach you preferred is now the default shape of the
output — you no longer have to prompt your way to it.

---

## 4. Editing after generation

Click anything in the editor to select it. A control bar appears above the
editor.

**Images**
- Width: 25% / 50% / 75% / 100%
- Align: left / center / right
- Alt text (accessibility — also what shows if images are blocked)
- **Replace**: swaps the image in place. On an AI **image placeholder** it turns
  the placeholder into the real photo rather than adding a second image below
  it.
- Delete: removes the image and its wrapper box, no empty grey block left.

**Sections**
- Move up / move down — reorder after generation
- Duplicate
- Delete

**Design panel** (toolbar → *Design*)
- Page background, card background, accent/button color, body text color
- Heading font, body font
- Headline size, body size, line height, section spacing, content width
- Background presets including light blue
- Reset to brand defaults

All of it applies without regenerating the email, and it restyles content that
already exists — including copy the AI generated and copy you typed yourself.
Changing the body size moves the actual paragraphs, not just the frame around
them. Each design change is one Ctrl/Cmd+Z step, so you can try something and
back out of it.

### Prompting for design

Design *direction* ("clean minimal wellness aesthetic", "larger headline") can
go in the **Design direction** field, and image requests ("a photo of a woman
looking at her hair in a mirror") in **Image directions** — each becomes a
labelled placeholder you click to replace. Exact colors, fonts and sizes are set
in the Design panel rather than by prompt, because that is deterministic and
reversible.

---

## 5. Undo, versions, and recovering an earlier draft

**Undo was genuinely broken.** It relied on the browser's native undo, which
only sees typing — not toolbar actions, image edits, inserted buttons, or
anything the app changed programmatically. Those edits were unrecoverable.

The editor now keeps its own history:

- **Ctrl/Cmd + Z** undoes anything: typing, formatting, image resize, section
  move, delete.
- **Ctrl/Cmd + Shift + Z** (or Ctrl + Y) redoes.
- Typing is grouped into sensible steps rather than one character at a time.
- Up to 80 steps are kept.

Undo covers the **current editing session**. For anything larger, use
**Versions**:

- **Save version** — snapshot the email with an optional label. Do this before
  any major edit.
- **Restore** — bring any earlier snapshot back. Undo still works afterwards, so
  a restore is itself reversible.
- Versions attach to a saved template or sequence step, so save the template
  once before snapshotting.

---

## 6. The reusable master template

**Settings → Brand** holds the fixed elements, applied automatically to every
newsletter send and test send:

- Logo and header band
- Brand fonts and colors
- Clinic name, address, phone, website
- Social links
- Educational/medical disclaimer
- Unsubscribe row

**Campaigns → Templates** holds the master body skeleton. A starter master is
seeded on install: hero image, intro, article, key takeaways, did-you-know,
Fit Logic approach, CTA.

- ⭐ marks the master. Click the star on any template to promote it.
- **New issue from master** duplicates it for this month. The copy is never
  marked verified — the new content still needs review.
- **Duplicate** works on any template.

Editing the master changes future issues only; already-created issues are
independent copies.

---

## 7. Test sending

Toolbar → **Test send** (in the AI wizard's editor, the template editor, and the
campaign email editor).

- Sends one copy to any address, subject prefixed `[TEST]`.
- Merge variables are filled with sample values, so you see `Hi Taylor,` rather
  than `Hi {first_name},`.
- Wrapped exactly the way the real send will be: newsletters get the branded
  shell, plain outreach emails and sequence steps do not. A test that added
  branding the real email will never have would be worse than no test.
- Nothing is logged to the campaign, no recipient is enrolled, the daily send
  cap and suppression list are untouched.

Test sends require an email provider connected in **Settings → Integrations**.

---

## 8. Known limits

- Fonts are limited to web-safe stacks. Custom brand fonts do not render
  reliably in Outlook or Gmail, so the app does not offer them.
- Images are single-column and full-width by default. Side-by-side image/text
  columns are not yet a section type.
- The AI does not generate images; it produces labelled placeholders describing
  the photo to use.
- Version history keeps the 50 most recent snapshots per template.
- Undo keeps 80 steps. Typing is grouped; each toolbar action, image edit,
  section move and design change is its own separate step.
