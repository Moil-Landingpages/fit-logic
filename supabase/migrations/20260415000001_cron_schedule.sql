-- Schedule process-campaign-queue to run every 2 minutes via pg_cron + pg_net.
-- pg_cron and pg_net must already be enabled (see migrations 20260321002231 and 20260407180209).
--
-- The function makes an HTTP POST to the Supabase edge function.
-- Set SUPABASE_PROJECT_ID and SUPABASE_SERVICE_ROLE_KEY in the Supabase dashboard
-- under Settings > Database > Vault / Environment.

-- Remove any previously registered job with the same name (idempotent migration)
SELECT cron.unschedule('process-campaign-queue')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'process-campaign-queue'
  );

-- Schedule every 2 minutes
SELECT cron.schedule(
  'process-campaign-queue',
  '*/2 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://' || current_setting('app.settings.supabase_project_id', true) || '.supabase.co/functions/v1/process-campaign-queue',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body    := '{}'::jsonb
    );
  $$
);

-- ─────────────────────────────────────────────────────────────────────────────
-- IMPORTANT: You must set these database parameters in the Supabase dashboard
-- (Settings > Database > Configuration > Custom config) or via SQL:
--
--   ALTER DATABASE postgres SET app.settings.supabase_project_id = '<your-project-ref>';
--   ALTER DATABASE postgres SET app.settings.service_role_key     = '<your-service-role-key>';
--
-- These are read at runtime by cron.schedule above.
-- Alternatively, hardcode the values directly (less portable but simpler).
-- ─────────────────────────────────────────────────────────────────────────────
