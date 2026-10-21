-- Reply-To for campaign mail, and an opt-in branded layout for any email.
--
-- Context (client testing, Oct 2026):
--   * Replies to campaign mail went to the sending address (a Moil mailbox).
--     Settings now carries a Reply-To that is sent on every campaign email.
--   * The brand header/footer only applied to templates of kind 'newsletter'.
--     A branded_layout flag lets any single email template, and any sequence
--     campaign (every step), send inside the same brand shell.
--
-- Additive and idempotent; safe to run on the live database. Run AFTER
-- 20260901000001_newsletter_brand_kit.sql.

ALTER TABLE public.practice_settings
  ADD COLUMN IF NOT EXISTS email_reply_to TEXT;

COMMENT ON COLUMN public.practice_settings.email_reply_to IS
  'Reply-To address set on every campaign email so replies reach a Fit Logic mailbox regardless of the sending address.';

ALTER TABLE public.email_templates
  ADD COLUMN IF NOT EXISTS branded_layout BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS branded_layout BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.email_templates.branded_layout IS
  'When true the email is sent inside the brand shell (logo header, contact footer, disclaimer) even if template_kind is not newsletter.';
COMMENT ON COLUMN public.campaigns.branded_layout IS
  'Sequence campaigns: when true every step is sent inside the brand shell.';

NOTIFY pgrst, 'reload schema';
