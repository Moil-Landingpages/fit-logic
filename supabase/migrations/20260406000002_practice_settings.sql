-- Phase 1.2: Add practice_settings table
-- Stores practice-wide config, campaign defaults, and integration tokens

CREATE TABLE IF NOT EXISTS practice_settings (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_name           text NOT NULL DEFAULT 'My Practice',
  timezone                text NOT NULL DEFAULT 'America/New_York',
  business_hours_start    integer NOT NULL DEFAULT 8,
  business_hours_end      integer NOT NULL DEFAULT 18,
  business_days           text[] NOT NULL DEFAULT ARRAY['Mon','Tue','Wed','Thu','Fri'],
  max_sends_per_day       integer NOT NULL DEFAULT 500,
  escalation_staff_id     uuid REFERENCES staff(id) ON DELETE SET NULL,
  -- Integration tokens stored as JSONB (structure: {access_token, refresh_token, expiry, scope})
  google_calendar_token   jsonb,
  google_gmail_token      jsonb,
  -- Email delivery provider: 'resend' | 'sendgrid' | 'smtp'
  email_provider          text NOT NULL DEFAULT 'resend',
  email_provider_api_key  text,
  email_from_address      text,
  email_from_name         text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Only one settings row per installation
CREATE UNIQUE INDEX IF NOT EXISTS practice_settings_singleton ON practice_settings ((true));

-- Seed default row
INSERT INTO practice_settings (practice_name) VALUES ('FitLogic Practice')
ON CONFLICT DO NOTHING;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_practice_settings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_practice_settings_updated_at ON practice_settings;
CREATE TRIGGER trg_practice_settings_updated_at
  BEFORE UPDATE ON practice_settings
  FOR EACH ROW EXECUTE FUNCTION update_practice_settings_updated_at();

-- RLS: open (consistent with rest of schema — lock down when auth is added)
ALTER TABLE practice_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access practice_settings" ON practice_settings;
CREATE POLICY "Public access practice_settings"
  ON practice_settings FOR ALL USING (true) WITH CHECK (true);

-- Fix B5: remove duplicate audit trigger created by migration 20260315143838
-- That migration re-created trg_audit_patients which already existed from 20260314185455
DROP TRIGGER IF EXISTS trg_audit_patients ON patients;

-- Re-create it once cleanly so audit logging is correct (single trigger)
CREATE TRIGGER trg_audit_patients
  AFTER INSERT OR UPDATE OR DELETE ON patients
  FOR EACH ROW EXECUTE FUNCTION audit_patient_changes();
