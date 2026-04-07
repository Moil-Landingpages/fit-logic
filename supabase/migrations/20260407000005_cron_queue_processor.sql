-- Schedule the campaign queue processor to run every minute.
-- Requires: pg_cron and pg_net extensions (enabled in 20260407180209).
-- The edge function has verify_jwt = false so no Authorization header is needed.
--
-- To verify the job after deploying:
--   SELECT * FROM cron.job;
--
-- To manually trigger immediately (e.g. from Supabase SQL editor):
--   SELECT net.http_post(
--     url := 'https://dqsdxrsfrsjnqisphwhs.supabase.co/functions/v1/process-campaign-queue',
--     headers := '{"Content-Type": "application/json"}'::jsonb,
--     body := '{}'::jsonb
--   );

SELECT cron.schedule(
  'process-campaign-queue-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://dqsdxrsfrsjnqisphwhs.supabase.co/functions/v1/process-campaign-queue',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);
