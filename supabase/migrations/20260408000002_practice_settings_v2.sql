-- ── Practice settings extensions ────────────────────────────────────────────
-- Adds referral_base_url for configurable referral link domain,
-- and app_config rows for the Supabase URL/anon key (used by the cron job).

ALTER TABLE public.practice_settings
  ADD COLUMN IF NOT EXISTS referral_base_url text NOT NULL DEFAULT 'https://your-domain.com';
