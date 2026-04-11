-- ── Campaign queue automated trigger ───────────────────────────────────────
-- Schedules process-campaign-queue to run every 5 minutes via pg_cron + pg_net.
-- pg_cron and pg_net were enabled in migration 20260321002231.
--
-- SETUP REQUIRED after deploying this migration:
--   Run once in the Supabase SQL editor (replace values for your project):
--
--   INSERT INTO public.app_config (key, value) VALUES
--     ('supabase_url',      'https://YOUR_PROJECT_REF.supabase.co'),
--     ('supabase_anon_key', 'YOUR_ANON_KEY')
--   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
--
--   Your anon key is found in: Supabase dashboard → Project Settings → API
-- ──────────────────────────────────────────────────────────────────────────

-- Lightweight config table to hold the project URL and anon key
CREATE TABLE IF NOT EXISTS public.app_config (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- Only authenticated users can read/write config (service role bypasses RLS)
CREATE POLICY "authenticated_app_config"
  ON public.app_config FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ── Wrapper function called by pg_cron ───────────────────────────────────────
-- Reads URL + anon key from app_config, fires an HTTP POST to the edge function.
CREATE OR REPLACE FUNCTION public.trigger_campaign_queue()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url      text;
  v_anon_key text;
BEGIN
  SELECT value INTO v_url      FROM public.app_config WHERE key = 'supabase_url';
  SELECT value INTO v_anon_key FROM public.app_config WHERE key = 'supabase_anon_key';

  -- If not configured yet, skip silently
  IF v_url IS NULL OR v_anon_key IS NULL THEN
    RAISE LOG 'trigger_campaign_queue: app_config not yet set — skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url || '/functions/v1/process-campaign-queue',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_anon_key
    ),
    body    := '{}'::jsonb
  );
END;
$$;

-- ── Schedule the job ─────────────────────────────────────────────────────────
-- Remove any existing job with the same name before re-registering.
SELECT cron.unschedule('process-campaign-queue') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'process-campaign-queue'
);

SELECT cron.schedule(
  'process-campaign-queue',    -- unique job name
  '*/5 * * * *',               -- every 5 minutes
  'SELECT public.trigger_campaign_queue()'
);
