-- Phase A: Email delivery infrastructure
-- Adds columns to campaign_send_log for real delivery tracking

ALTER TABLE campaign_send_log
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS bounce_type         text,
  ADD COLUMN IF NOT EXISTS complaint_at        timestamptz,
  ADD COLUMN IF NOT EXISTS provider            text;

-- Compound indexes for queue performance at 3500+ recipients
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_queue
  ON campaign_recipients (campaign_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_campaign_send_log_campaign_date
  ON campaign_send_log (campaign_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_campaign_send_log_tracking
  ON campaign_send_log (tracking_id)
  WHERE tracking_id IS NOT NULL;

-- Add suppression list table (bounces + hard complaints)
CREATE TABLE IF NOT EXISTS email_suppressions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text NOT NULL,
  reason       text NOT NULL CHECK (reason IN ('hard_bounce', 'soft_bounce', 'complaint', 'manual')),
  campaign_id  uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_suppressions_email
  ON email_suppressions (lower(email));

ALTER TABLE email_suppressions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access email_suppressions"
  ON email_suppressions FOR ALL USING (true) WITH CHECK (true);
