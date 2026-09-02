-- Newsletter production support: brand kit, master templates, version history.
--
-- Context (client feedback, Sept 2026):
--   * Newsletters need a reusable master template carrying fixed brand
--     elements (logo, colors, fonts, clinic contact, socials, disclaimer)
--     so each month only the variable content changes.
--   * Editors need a "save a version before major edits" / restore path
--     because contentEditable undo is not a substitute for versioning.
--   * The AI wizard needs to record which source material a newsletter was
--     grounded in, and which generated claims still need human verification
--     before a patient-facing health email goes out.
--
-- All additions are additive + IF NOT EXISTS so existing campaigns, templates
-- and the send queue keep working untouched.

-- ---------------------------------------------------------------------------
-- 1. Brand kit on the singleton practice_settings row.
-- ---------------------------------------------------------------------------
ALTER TABLE public.practice_settings
  ADD COLUMN IF NOT EXISTS brand_logo_url        TEXT,
  ADD COLUMN IF NOT EXISTS brand_primary_color   TEXT NOT NULL DEFAULT '#0e9aa7',
  ADD COLUMN IF NOT EXISTS brand_accent_color    TEXT NOT NULL DEFAULT '#0e9aa7',
  ADD COLUMN IF NOT EXISTS brand_bg_color        TEXT NOT NULL DEFAULT '#f4f4f5',
  ADD COLUMN IF NOT EXISTS brand_body_color      TEXT NOT NULL DEFAULT '#111827',
  ADD COLUMN IF NOT EXISTS brand_heading_font    TEXT NOT NULL DEFAULT 'Georgia, ''Times New Roman'', serif',
  ADD COLUMN IF NOT EXISTS brand_body_font       TEXT NOT NULL DEFAULT '-apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, Helvetica, Arial, sans-serif',
  ADD COLUMN IF NOT EXISTS brand_heading_size    INTEGER NOT NULL DEFAULT 26,
  ADD COLUMN IF NOT EXISTS brand_body_size       INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS clinic_address        TEXT,
  ADD COLUMN IF NOT EXISTS clinic_phone          TEXT,
  ADD COLUMN IF NOT EXISTS website_url           TEXT,
  ADD COLUMN IF NOT EXISTS social_links          JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS medical_disclaimer    TEXT,
  ADD COLUMN IF NOT EXISTS newsletter_footer_note TEXT;

COMMENT ON COLUMN public.practice_settings.social_links IS
  'Array of {label, url} used in the newsletter footer.';
COMMENT ON COLUMN public.practice_settings.medical_disclaimer IS
  'Educational/medical disclaimer appended to every newsletter footer. Required for patient-facing health content.';

-- Seed a sensible default disclaimer on the existing singleton row so the
-- first newsletter is compliant out of the box. Only fills NULLs.
UPDATE public.practice_settings
SET medical_disclaimer = 'This newsletter is for general educational purposes only and is not medical advice, diagnosis, or treatment. Always consult your healthcare provider before making changes to your health regimen.'
WHERE medical_disclaimer IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Master / reusable newsletter templates.
-- ---------------------------------------------------------------------------
ALTER TABLE public.email_templates
  ADD COLUMN IF NOT EXISTS template_kind TEXT NOT NULL DEFAULT 'email'
    CHECK (template_kind IN ('email', 'newsletter')),
  ADD COLUMN IF NOT EXISTS is_master BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS design JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS source_material TEXT,
  ADD COLUMN IF NOT EXISTS verification_notes JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by TEXT;

COMMENT ON COLUMN public.email_templates.is_master IS
  'Marks the reusable master newsletter shell. Duplicated each month; only the variable content changes.';
COMMENT ON COLUMN public.email_templates.design IS
  'Per-template design tokens (bg color, accent, fonts, sizes, content width) applied by the editor and the send-time wrapper.';
COMMENT ON COLUMN public.email_templates.verification_notes IS
  'AI grounding audit: {factsUsed: [], unverifiedClaims: [], groundedInSource: bool}. Surfaced as a pre-send checklist.';

-- At most one master per kind. Partial unique index keeps the invariant in the
-- database rather than relying on the UI.
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_templates_single_master
  ON public.email_templates (template_kind)
  WHERE is_master;

-- ---------------------------------------------------------------------------
-- 3. Version history — "save a version before major edits" + restore.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_template_versions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  UUID REFERENCES public.email_templates(id) ON DELETE CASCADE,
  sequence_id  UUID REFERENCES public.campaign_sequences(id) ON DELETE CASCADE,
  label        TEXT,
  subject      TEXT,
  preview_text TEXT,
  body_html    TEXT NOT NULL,
  design       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A version belongs to exactly one owner.
  CONSTRAINT email_template_versions_one_owner
    CHECK (num_nonnulls(template_id, sequence_id) = 1)
);

CREATE INDEX IF NOT EXISTS idx_email_template_versions_template
  ON public.email_template_versions (template_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_template_versions_sequence
  ON public.email_template_versions (sequence_id, created_at DESC);

ALTER TABLE public.email_template_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_template_versions read"  ON public.email_template_versions;
DROP POLICY IF EXISTS "email_template_versions write" ON public.email_template_versions;

CREATE POLICY "email_template_versions read"  ON public.email_template_versions
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "email_template_versions write" ON public.email_template_versions
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- 4. Seed the reusable master newsletter template.
--
-- The skeleton mirrors what the AI wizard's section renderer produces
-- (`data-nl-section` / `data-nl-image-placeholder` markers), so the editor's
-- move / duplicate / delete / replace-image controls work on it immediately.
-- Only inserted when no newsletter master exists yet.
-- ---------------------------------------------------------------------------
INSERT INTO public.email_templates (name, subject, preview_text, category, template_kind, is_master, body_html, design)
SELECT
  'Fit Logic Monthly Newsletter — Master',
  'Your monthly wellness update from Fit Logic',
  'This month: one topic, explained simply.',
  'educational',
  'newsletter',
  true,
  $html$<div data-nl-section="hero_image" style="margin:0 0 24px;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 24px;"><tr><td align="center" data-nl-image-placeholder="1" style="background:#eef2f4;border:1px dashed #b6c2c7;border-radius:8px;padding:36px 20px;text-align:center;font-size:12px;line-height:1.5;color:#6b7280;">
  <strong style="display:block;margin-bottom:4px;color:#4b5563;">Image placeholder</strong>
  Hero photo for this month's topic — click to replace
</td></tr></table>
</div>
<div data-nl-section="intro" style="margin:0 0 24px;">
<p style="margin:0 0 12px;">Hi {first_name},</p>
<p style="margin:0 0 12px;">Open with two or three sentences that set up this month's topic and speak directly to the reader.</p>
</div>
<div data-nl-section="article" style="margin:0 0 24px;">
<h2 style="margin:0 0 10px;font-size:19px;line-height:1.3;font-weight:700;">This month's topic</h2>
<p style="margin:0 0 12px;">Main article copy goes here. Keep paragraphs short and explain the mechanism plainly.</p>
</div>
<div data-nl-section="key_insights" style="margin:0 0 24px;">
<h2 style="margin:0 0 10px;font-size:19px;line-height:1.3;font-weight:700;">Key takeaways</h2>
<ul style="margin:0 0 12px;padding-left:20px;">
<li style="margin:0 0 7px;">First takeaway</li>
<li style="margin:0 0 7px;">Second takeaway</li>
<li style="margin:0 0 7px;">Third takeaway</li>
</ul>
</div>
<div data-nl-section="did_you_know" style="margin:0 0 24px;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="background:#f6fbfc;border-left:4px solid #0e9aa7;border-radius:6px;padding:18px 20px 8px;">
<h2 style="margin:0 0 10px;font-size:19px;line-height:1.3;font-weight:700;">Did you know?</h2>
<p style="margin:0 0 12px;">One short, source-supported fact. Delete this section if you do not have one — do not guess.</p>
</td></tr></table>
</div>
<div data-nl-section="approach" style="margin:0 0 24px;">
<h2 style="margin:0 0 10px;font-size:19px;line-height:1.3;font-weight:700;">The Fit Logic approach</h2>
<p style="margin:0 0 12px;">How the practice thinks about this topic and what care actually looks like.</p>
</div>
<div data-nl-section="cta" style="margin:0 0 24px;">
<p style="margin:0 0 12px;text-align:center;">Ready to talk about your own plan?</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 24px;"><tr><td align="center">
  <a href="#" style="display:inline-block;background:#0e9aa7;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:13px 30px;border-radius:6px;">Book a consultation</a>
</td></tr></table>
</div>$html$,
  '{}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.email_templates WHERE template_kind = 'newsletter' AND is_master
);
