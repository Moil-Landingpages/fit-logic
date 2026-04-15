-- Add missing updated_at triggers and performance indexes identified in the audit.

-- ─── updated_at helper (reuse pattern from existing migrations) ───────────────

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ─── Add updated_at column + trigger to tables that are missing them ──────────

-- inquiries
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP TRIGGER IF EXISTS inquiries_updated_at ON inquiries;
CREATE TRIGGER inquiries_updated_at
  BEFORE UPDATE ON inquiries
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- segments
ALTER TABLE segments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP TRIGGER IF EXISTS segments_updated_at ON segments;
CREATE TRIGGER segments_updated_at
  BEFORE UPDATE ON segments
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- campaign_sequences
ALTER TABLE campaign_sequences ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP TRIGGER IF EXISTS campaign_sequences_updated_at ON campaign_sequences;
CREATE TRIGGER campaign_sequences_updated_at
  BEFORE UPDATE ON campaign_sequences
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- campaign_recipients
ALTER TABLE campaign_recipients ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP TRIGGER IF EXISTS campaign_recipients_updated_at ON campaign_recipients;
CREATE TRIGGER campaign_recipients_updated_at
  BEFORE UPDATE ON campaign_recipients
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- referrals
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP TRIGGER IF EXISTS referrals_updated_at ON referrals;
CREATE TRIGGER referrals_updated_at
  BEFORE UPDATE ON referrals
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- staff
ALTER TABLE staff ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP TRIGGER IF EXISTS staff_updated_at ON staff;
CREATE TRIGGER staff_updated_at
  BEFORE UPDATE ON staff
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- intake_submissions
ALTER TABLE intake_submissions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP TRIGGER IF EXISTS intake_submissions_updated_at ON intake_submissions;
CREATE TRIGGER intake_submissions_updated_at
  BEFORE UPDATE ON intake_submissions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ─── Missing indexes ──────────────────────────────────────────────────────────

-- audit_log: fast lookups by table + record
CREATE INDEX IF NOT EXISTS idx_audit_log_record
  ON audit_log (table_name, record_id);

-- audit_log: chronological queries per table
CREATE INDEX IF NOT EXISTS idx_audit_log_performed_at
  ON audit_log (performed_at DESC);

-- faqs: filter by category
CREATE INDEX IF NOT EXISTS idx_faqs_category
  ON faqs (category) WHERE active = TRUE;

-- inquiries: list by status + created_at (common in Inbox view)
CREATE INDEX IF NOT EXISTS idx_inquiries_status_created
  ON inquiries (status, created_at DESC);

-- campaign_sequences: join by campaign
CREATE INDEX IF NOT EXISTS idx_campaign_sequences_campaign
  ON campaign_sequences (campaign_id, step_number);

-- intake_submissions: filter by form
CREATE INDEX IF NOT EXISTS idx_intake_submissions_form
  ON intake_submissions (form_id, submitted_at DESC);

-- referrals: lookup by code (used for redemption)
CREATE INDEX IF NOT EXISTS idx_referrals_code
  ON referrals (referral_code);

-- staff: unique email enforcement
ALTER TABLE staff ADD CONSTRAINT staff_email_unique UNIQUE (email)
  DEFERRABLE INITIALLY DEFERRED;

-- segments: list by creation date
CREATE INDEX IF NOT EXISTS idx_segments_created
  ON segments (created_at DESC);
