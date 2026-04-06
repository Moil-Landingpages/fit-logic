-- Phase 1.1: Add CRM-specific columns to patients table
-- Replaces the semantic misuse of gender/insurance_provider/insurance_id

-- Add proper CRM fields
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS pipeline_stage text NOT NULL DEFAULT 'new_lead',
  ADD COLUMN IF NOT EXISTS lead_source text,
  ADD COLUMN IF NOT EXISTS company text,
  ADD COLUMN IF NOT EXISTS deal_value numeric(12, 2);

-- Migrate existing data: preserve whatever was stored in the misused fields
UPDATE patients
SET
  lead_source = COALESCE(lead_source, gender),
  company     = COALESCE(company, insurance_provider)
WHERE gender IS NOT NULL OR insurance_provider IS NOT NULL;

-- Add a check constraint for valid pipeline stages
ALTER TABLE patients
  ADD CONSTRAINT patients_pipeline_stage_check
  CHECK (pipeline_stage IN (
    'new_lead', 'contacted', 'qualified',
    'proposal', 'negotiation', 'won', 'lost'
  ));

-- Index for fast kanban lane queries
CREATE INDEX IF NOT EXISTS idx_patients_pipeline_stage ON patients (pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_patients_lead_source    ON patients (lead_source);

-- RLS (open — consistent with existing policies)
-- No new RLS needed; existing public policy on patients covers new columns
