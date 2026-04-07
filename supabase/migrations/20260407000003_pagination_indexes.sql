-- Phase C3: Additional indexes for large contact lists and efficient pagination

-- patients: composite index covering common filter + sort patterns
CREATE INDEX IF NOT EXISTS idx_patients_pipeline_stage
  ON patients (pipeline_stage, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_patients_lead_source
  ON patients (lead_source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_patients_status
  ON patients (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_patients_email_lower
  ON patients (lower(email))
  WHERE email IS NOT NULL;

-- Full-text search on name + company
CREATE INDEX IF NOT EXISTS idx_patients_fts
  ON patients USING gin(
    to_tsvector('english',
      coalesce(first_name, '') || ' ' ||
      coalesce(last_name,  '') || ' ' ||
      coalesce(company,    '') || ' ' ||
      coalesce(email,      '')
    )
  );

-- campaigns
CREATE INDEX IF NOT EXISTS idx_campaigns_status_scheduled
  ON campaigns (status, scheduled_at)
  WHERE status IN ('scheduled', 'sending');

-- inquiries
CREATE INDEX IF NOT EXISTS idx_inquiries_status_created
  ON inquiries (status, created_at DESC);

-- intake_submissions
CREATE INDEX IF NOT EXISTS idx_intake_submissions_form_created
  ON intake_submissions (form_id, created_at DESC);
