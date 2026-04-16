-- =============================================================================
-- FitLogic Sales Engine — Consolidated Schema Migration
-- Run this on a fresh Supabase project to set up the entire database.
-- Every statement is idempotent (IF NOT EXISTS / DROP … IF EXISTS) so it is
-- safe to re-run or apply after the existing incremental migrations.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron    WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net     WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- Utility: updated_at trigger function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- TABLE: audit_log  (HIPAA compliance — written by trigger)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name   text        NOT NULL,
  record_id    uuid        NOT NULL,
  action       text        NOT NULL,
  old_data     jsonb,
  new_data     jsonb,
  performed_at timestamptz NOT NULL DEFAULT now(),
  performed_by text
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to audit_log"   ON public.audit_log;
DROP POLICY IF EXISTS "Authenticated read audit_log"    ON public.audit_log;
CREATE POLICY "Authenticated read audit_log"
  ON public.audit_log FOR SELECT
  USING (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- TABLE: patients
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.patients (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name        text        NOT NULL,
  last_name         text        NOT NULL,
  email             text,
  phone             text,
  date_of_birth     date,
  gender            text,
  address           text,
  city              text,
  state             text,
  zip_code          text,
  insurance_provider text,
  insurance_id      text,
  status            text        NOT NULL DEFAULT 'active',
  tags              text[]      DEFAULT '{}',
  notes             text,
  -- CRM fields
  pipeline_stage    text        NOT NULL DEFAULT 'new_lead',
  lead_source       text,
  company           text,
  deal_value        numeric(12,2),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patients_pipeline_stage_check CHECK (
    pipeline_stage IN ('new_lead','contacted','qualified','proposal','negotiation','won','lost')
  )
);

CREATE INDEX IF NOT EXISTS idx_patients_pipeline_stage ON public.patients (pipeline_stage, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patients_lead_source    ON public.patients (lead_source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patients_status         ON public.patients (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patients_email_lower    ON public.patients (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patients_fts            ON public.patients USING gin(
  to_tsvector('english',
    coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' ||
    coalesce(company,'')    || ' ' || coalesce(email,'')
  )
);

ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to patients"     ON public.patients;
DROP POLICY IF EXISTS "Public access patients"           ON public.patients;
DROP POLICY IF EXISTS "Allow all patients"               ON public.patients;
DROP POLICY IF EXISTS "Authenticated access patients"    ON public.patients;
CREATE POLICY "Authenticated access patients"
  ON public.patients FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Audit trigger
CREATE OR REPLACE FUNCTION public.audit_patient_changes()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log(table_name, record_id, action, new_data)
    VALUES ('patients', NEW.id, 'INSERT', to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_log(table_name, record_id, action, old_data, new_data)
    VALUES ('patients', NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log(table_name, record_id, action, old_data)
    VALUES (OLD.id, OLD.id, 'DELETE', to_jsonb(OLD));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS patients_updated_at       ON public.patients;
DROP TRIGGER IF EXISTS trg_update_patients_updated_at ON public.patients;
CREATE TRIGGER patients_updated_at
  BEFORE UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS patients_audit            ON public.patients;
DROP TRIGGER IF EXISTS trg_audit_patients        ON public.patients;
CREATE TRIGGER trg_audit_patients
  AFTER INSERT OR UPDATE OR DELETE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.audit_patient_changes();

-- ---------------------------------------------------------------------------
-- TABLE: staff
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text        NOT NULL,
  role               text        NOT NULL DEFAULT 'receptionist',
  email              text        NOT NULL,
  categories_handled text[]      DEFAULT '{}',
  active             boolean     NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_staff"              ON public.staff;
DROP POLICY IF EXISTS "Authenticated access staff" ON public.staff;
CREATE POLICY "Authenticated access staff"
  ON public.staff FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- TABLE: practice_settings  (singleton row)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.practice_settings (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_name           text        NOT NULL DEFAULT 'FitLogic Functional Medicine',
  timezone                text        NOT NULL DEFAULT 'America/New_York',
  business_hours_start    integer     NOT NULL DEFAULT 8,
  business_hours_end      integer     NOT NULL DEFAULT 18,
  business_days           text[]      NOT NULL DEFAULT '{Mon,Tue,Wed,Thu,Fri}',
  max_sends_per_day       integer     NOT NULL DEFAULT 50,
  escalation_staff_id     uuid        REFERENCES public.staff(id) ON DELETE SET NULL,
  google_calendar_token   jsonb,
  google_gmail_token      jsonb,
  email_provider          text        NOT NULL DEFAULT 'resend',
  email_provider_api_key  text,
  email_from_address      text,
  email_from_name         text        DEFAULT 'FitLogic',
  email_api_key_secret_id uuid,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS practice_settings_singleton ON public.practice_settings ((true));

INSERT INTO public.practice_settings (practice_name)
VALUES ('FitLogic')
ON CONFLICT DO NOTHING;

DROP TRIGGER IF EXISTS trg_practice_settings_updated_at ON public.practice_settings;
CREATE TRIGGER trg_practice_settings_updated_at
  BEFORE UPDATE ON public.practice_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.practice_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public access practice_settings"       ON public.practice_settings;
DROP POLICY IF EXISTS "Allow all practice_settings"           ON public.practice_settings;
DROP POLICY IF EXISTS "Authenticated access practice_settings" ON public.practice_settings;
DROP POLICY IF EXISTS "authenticated_practice_settings"       ON public.practice_settings;
CREATE POLICY "Authenticated access practice_settings"
  ON public.practice_settings FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Vault helper: retrieve email API key (vault first, plaintext fallback)
CREATE OR REPLACE FUNCTION public.get_email_api_key()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault AS $$
DECLARE
  v_secret_id uuid;
  v_key       text;
BEGIN
  SELECT email_api_key_secret_id INTO v_secret_id FROM public.practice_settings LIMIT 1;
  IF v_secret_id IS NOT NULL THEN
    SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE id = v_secret_id;
    IF v_key IS NOT NULL AND v_key <> '' THEN RETURN v_key; END IF;
  END IF;
  SELECT email_provider_api_key INTO v_key FROM public.practice_settings LIMIT 1;
  RETURN v_key;
END;
$$;

REVOKE ALL ON FUNCTION public.get_email_api_key() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_email_api_key() TO service_role;

-- ---------------------------------------------------------------------------
-- TABLE: faqs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.faqs (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  question   text        NOT NULL,
  answer     text        NOT NULL,
  category   text        NOT NULL DEFAULT 'General_Info',
  active     boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS faqs_updated_at ON public.faqs;
CREATE TRIGGER faqs_updated_at
  BEFORE UPDATE ON public.faqs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_faqs"              ON public.faqs;
DROP POLICY IF EXISTS "Authenticated access faqs" ON public.faqs;
CREATE POLICY "Authenticated access faqs"
  ON public.faqs FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- TABLE: inquiries
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inquiries (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id          uuid        REFERENCES public.patients(id) ON DELETE SET NULL,
  patient_name        text        NOT NULL,
  patient_email       text,
  source              text        NOT NULL DEFAULT 'email',
  raw_content         text        NOT NULL,
  category            text        NOT NULL DEFAULT 'General_Info',
  category_confidence numeric(3,2) DEFAULT 0.9,
  is_faq_match        boolean     DEFAULT false,
  assigned_to         uuid        REFERENCES public.staff(id) ON DELETE SET NULL,
  status              text        NOT NULL DEFAULT 'pending',
  response_text       text,
  staff_notes         text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  resolved_at         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_inquiries_status_created ON public.inquiries (status, created_at DESC);

ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_inquiries"              ON public.inquiries;
DROP POLICY IF EXISTS "Authenticated access inquiries" ON public.inquiries;
CREATE POLICY "Authenticated access inquiries"
  ON public.inquiries FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- TABLE: intake_forms
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.intake_forms (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text        NOT NULL,
  description      text,
  questions        jsonb       NOT NULL DEFAULT '[]',
  active           boolean     NOT NULL DEFAULT true,
  submission_count integer     NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS intake_forms_updated_at ON public.intake_forms;
CREATE TRIGGER intake_forms_updated_at
  BEFORE UPDATE ON public.intake_forms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.intake_forms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_intake_forms"                ON public.intake_forms;
DROP POLICY IF EXISTS "Authenticated manage intake_forms"  ON public.intake_forms;
CREATE POLICY "Authenticated manage intake_forms"
  ON public.intake_forms FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- TABLE: intake_submissions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.intake_submissions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id           uuid        NOT NULL REFERENCES public.intake_forms(id) ON DELETE CASCADE,
  patient_id        uuid        REFERENCES public.patients(id) ON DELETE SET NULL,
  patient_name      text        NOT NULL,
  patient_email     text,
  submission_data   jsonb       NOT NULL DEFAULT '{}',
  completion_status text        NOT NULL DEFAULT 'incomplete',
  review_status     text        NOT NULL DEFAULT 'pending',
  staff_notes       text,
  submitted_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intake_submissions_form_created
  ON public.intake_submissions (form_id, created_at DESC);

ALTER TABLE public.intake_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_intake_submissions"             ON public.intake_submissions;
DROP POLICY IF EXISTS "Public insert intake_submissions"      ON public.intake_submissions;
DROP POLICY IF EXISTS "Authenticated read intake_submissions"  ON public.intake_submissions;
DROP POLICY IF EXISTS "Authenticated modify intake_submissions" ON public.intake_submissions;
DROP POLICY IF EXISTS "Authenticated delete intake_submissions" ON public.intake_submissions;
-- Anyone can submit a form; only authenticated staff can read/modify
CREATE POLICY "Public insert intake_submissions"
  ON public.intake_submissions FOR INSERT
  WITH CHECK (true);
CREATE POLICY "Authenticated read intake_submissions"
  ON public.intake_submissions FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated modify intake_submissions"
  ON public.intake_submissions FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated delete intake_submissions"
  ON public.intake_submissions FOR DELETE
  USING (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- TABLE: email_templates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_templates (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  subject      text        NOT NULL,
  preview_text text,
  body_html    text,
  category     text        NOT NULL DEFAULT 'welcome',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS email_templates_updated_at ON public.email_templates;
CREATE TRIGGER email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_email_templates"                 ON public.email_templates;
DROP POLICY IF EXISTS "Authenticated access email_templates"   ON public.email_templates;
CREATE POLICY "Authenticated access email_templates"
  ON public.email_templates FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- TABLE: segments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.segments (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,
  description     text,
  rules           jsonb       NOT NULL DEFAULT '[]',
  estimated_count integer     NOT NULL DEFAULT 0,
  color           text        DEFAULT 'primary',
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_segments"               ON public.segments;
DROP POLICY IF EXISTS "Authenticated access segments"  ON public.segments;
CREATE POLICY "Authenticated access segments"
  ON public.segments FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- TABLE: campaigns
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campaigns (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text        NOT NULL,
  status                text        NOT NULL DEFAULT 'draft',
  campaign_type         text        NOT NULL DEFAULT 'single',
  template_id           uuid        REFERENCES public.email_templates(id) ON DELETE SET NULL,
  segment_id            uuid        REFERENCES public.segments(id) ON DELETE SET NULL,
  scheduled_at          timestamptz,
  sent_at               timestamptz,
  stats                 jsonb,
  auto_schedule         boolean     DEFAULT false,
  max_sends_per_day     integer     DEFAULT 50,
  business_hours_start  integer     DEFAULT 8,
  business_hours_end    integer     DEFAULT 18,
  business_days         text[]      DEFAULT '{Mon,Tue,Wed,Thu,Fri}',
  recipient_count       integer     DEFAULT 0,
  sent_count            integer     DEFAULT 0,
  next_send_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status_scheduled
  ON public.campaigns (status, scheduled_at)
  WHERE status IN ('scheduled', 'sending');

DROP TRIGGER IF EXISTS campaigns_updated_at ON public.campaigns;
CREATE TRIGGER campaigns_updated_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_campaigns"               ON public.campaigns;
DROP POLICY IF EXISTS "Authenticated access campaigns"  ON public.campaigns;
CREATE POLICY "Authenticated access campaigns"
  ON public.campaigns FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- TABLE: campaign_sequences
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campaign_sequences (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id      uuid    NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  step_number      integer NOT NULL DEFAULT 1,
  template_id      uuid    REFERENCES public.email_templates(id) ON DELETE SET NULL,
  delay_days       integer NOT NULL DEFAULT 0,
  subject_override text,
  body_html_override text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campaign_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_campaign_sequences"               ON public.campaign_sequences;
DROP POLICY IF EXISTS "Authenticated access campaign_sequences"  ON public.campaign_sequences;
CREATE POLICY "Authenticated access campaign_sequences"
  ON public.campaign_sequences FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- TABLE: campaign_recipients
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campaign_recipients (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid        NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  patient_id  uuid        REFERENCES public.patients(id) ON DELETE SET NULL,
  email       text        NOT NULL,
  name        text,
  source      text        NOT NULL DEFAULT 'customer',
  status      text        NOT NULL DEFAULT 'pending',
  sent_at     timestamptz,
  opened_at   timestamptz,
  clicked_at  timestamptz,
  current_step integer    DEFAULT 0,
  last_error  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign ON public.campaign_recipients (campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_email    ON public.campaign_recipients (email);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_queue
  ON public.campaign_recipients (campaign_id, status, created_at);

ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_campaign_recipients"               ON public.campaign_recipients;
DROP POLICY IF EXISTS "Authenticated access campaign_recipients"  ON public.campaign_recipients;
CREATE POLICY "Authenticated access campaign_recipients"
  ON public.campaign_recipients FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- TABLE: campaign_send_log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campaign_send_log (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         uuid        NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  recipient_id        uuid        NOT NULL REFERENCES public.campaign_recipients(id) ON DELETE CASCADE,
  step_number         integer     NOT NULL DEFAULT 1,
  status              text        NOT NULL DEFAULT 'queued',
  sent_at             timestamptz,
  opened_at           timestamptz,
  clicked_at          timestamptz,
  error_message       text,
  tracking_id         text        UNIQUE DEFAULT gen_random_uuid()::text,
  provider_message_id text,
  bounce_type         text,
  complaint_at        timestamptz,
  provider            text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_send_log_campaign      ON public.campaign_send_log (campaign_id);
CREATE INDEX IF NOT EXISTS idx_send_log_recipient     ON public.campaign_send_log (recipient_id);
CREATE INDEX IF NOT EXISTS idx_send_log_tracking      ON public.campaign_send_log (tracking_id);
CREATE INDEX IF NOT EXISTS idx_send_log_status        ON public.campaign_send_log (status);
CREATE INDEX IF NOT EXISTS idx_campaign_send_log_campaign_date
  ON public.campaign_send_log (campaign_id, created_at DESC);

ALTER TABLE public.campaign_send_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_campaign_send_log"               ON public.campaign_send_log;
DROP POLICY IF EXISTS "Authenticated access campaign_send_log"  ON public.campaign_send_log;
CREATE POLICY "Authenticated access campaign_send_log"
  ON public.campaign_send_log FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- TABLE: campaign_unsubscribes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campaign_unsubscribes (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email            text        NOT NULL UNIQUE,
  campaign_id      uuid        REFERENCES public.campaigns(id),
  unsubscribed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_unsubscribes_email ON public.campaign_unsubscribes (email);

ALTER TABLE public.campaign_unsubscribes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_campaign_unsubscribes"               ON public.campaign_unsubscribes;
DROP POLICY IF EXISTS "Authenticated access campaign_unsubscribes"  ON public.campaign_unsubscribes;
CREATE POLICY "Authenticated access campaign_unsubscribes"
  ON public.campaign_unsubscribes FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- TABLE: email_suppressions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_suppressions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text        NOT NULL,
  reason     text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_suppressions_email
  ON public.email_suppressions (lower(email));

ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public access email_suppressions"            ON public.email_suppressions;
DROP POLICY IF EXISTS "Authenticated access email_suppressions"     ON public.email_suppressions;
DROP POLICY IF EXISTS "authenticated_email_suppressions"            ON public.email_suppressions;
CREATE POLICY "Authenticated access email_suppressions"
  ON public.email_suppressions FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- TABLE: referrals
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.referrals (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_name  text        NOT NULL,
  referrer_email text        NOT NULL,
  referral_code  text        NOT NULL UNIQUE,
  referred_name  text,
  referred_email text,
  status         text        NOT NULL DEFAULT 'pending',
  converted_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_referrals"               ON public.referrals;
DROP POLICY IF EXISTS "Authenticated access referrals"  ON public.referrals;
CREATE POLICY "Authenticated access referrals"
  ON public.referrals FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- TABLE: email_messages  (Gmail / Outlook inbox sync)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_messages (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider      text        NOT NULL DEFAULT 'gmail',
  external_id   text        NOT NULL,
  thread_id     text,
  from_email    text        NOT NULL,
  from_name     text,
  to_email      text,
  subject       text,
  snippet       text,
  body_text     text,
  body_html     text,
  received_at   timestamptz NOT NULL DEFAULT now(),
  is_read       boolean     NOT NULL DEFAULT false,
  labels        text[]      DEFAULT '{}',
  is_lead       boolean     NOT NULL DEFAULT false,
  lead_score    real,
  lead_category text,
  lead_summary  text,
  synced_at     timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_messages_provider_external_id_idx
  ON public.email_messages (provider, external_id);
CREATE INDEX IF NOT EXISTS email_messages_received_at_idx
  ON public.email_messages (received_at DESC);
CREATE INDEX IF NOT EXISTS email_messages_is_lead_idx
  ON public.email_messages (is_lead) WHERE is_lead = true;

ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can manage email_messages" ON public.email_messages;
CREATE POLICY "Authenticated users can manage email_messages"
  ON public.email_messages FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- TABLE: notifications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  type       text        NOT NULL DEFAULT 'info',
  title      text        NOT NULL,
  message    text,
  link       text,
  is_read    boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_created_at_idx
  ON public.notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx
  ON public.notifications (is_read) WHERE is_read = false;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can manage notifications" ON public.notifications;
CREATE POLICY "Authenticated users can manage notifications"
  ON public.notifications FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- HELPER: find_or_create_patient
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.find_or_create_patient(
  p_name  text,
  p_email text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_patient_id uuid;
  v_parts      text[];
  v_first      text;
  v_last       text;
BEGIN
  IF p_email IS NOT NULL AND p_email != '' THEN
    SELECT id INTO v_patient_id FROM public.patients WHERE email = p_email LIMIT 1;
    IF v_patient_id IS NOT NULL THEN RETURN v_patient_id; END IF;
  END IF;
  v_parts := string_to_array(trim(p_name), ' ');
  v_first := v_parts[1];
  v_last  := CASE WHEN array_length(v_parts,1) > 1 THEN array_to_string(v_parts[2:], ' ') ELSE '' END;
  SELECT id INTO v_patient_id FROM public.patients
    WHERE first_name = v_first AND last_name = v_last LIMIT 1;
  IF v_patient_id IS NOT NULL THEN RETURN v_patient_id; END IF;
  INSERT INTO public.patients (first_name, last_name, email, status)
  VALUES (v_first, v_last, NULLIF(p_email,''), 'active')
  RETURNING id INTO v_patient_id;
  RETURN v_patient_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- SEED: FAQs
-- ---------------------------------------------------------------------------
INSERT INTO public.faqs (question, answer, category, active) VALUES
  ('How do I book a consultation?',
   'You can book a free discovery call directly on our website at fitlogic.com/book, or reply to any of our emails with your preferred date and time. Discovery calls are 15 minutes and help us understand your goals before committing.',
   'Appointment_Scheduling', true),
  ('What happens during the initial consultation?',
   'Your first consultation is a comprehensive 60-minute session where we review your health history, current symptoms, lifestyle factors, and goals. We''ll create a personalized roadmap and discuss which of our programs is the best fit.',
   'Appointment_Scheduling', true),
  ('Do you offer virtual consultations?',
   'Yes! We offer both in-person and virtual consultations via secure video. Most of our clients start with a virtual discovery call, and many continue their entire program remotely.',
   'Appointment_Scheduling', true),
  ('What programs do you offer?',
   E'We offer three core programs:\n\n1. Hormone Optimization — 12-week protocol\n2. Gut Health Reset — 8-week program\n3. Executive Wellness — Ongoing quarterly optimization\n\nEach program includes lab work, 1-on-1 coaching, and a customized plan.',
   'Prescription_Lab_Requests', true),
  ('What kind of lab work do you order?',
   'We run comprehensive panels including advanced hormonal panels, full thyroid markers, metabolic markers, inflammatory markers, nutrient levels, and gut health testing. All labs are included in your program fee.',
   'Prescription_Lab_Requests', true),
  ('What kind of results can I expect?',
   'Most clients report significant improvements within 4–6 weeks: better energy (89% of clients), improved sleep, weight changes of 8–15 lbs in 12 weeks, reduced brain fog, and better mood stability.',
   'Health_Questions', true),
  ('How much do your programs cost?',
   E'Our programs range from $1,500 to $4,500:\n\nDiscovery Call — Free\nGroup Programs — From $1,500\n1-on-1 Programs — From $2,500\nExecutive Wellness — $4,500/year\n\nAll programs include lab work, supplements protocol, and coaching.',
   'Billing_Insurance', true),
  ('Do you accept insurance?',
   'We are an out-of-network provider. We provide superbills for PPO reimbursement (many plans cover 50–80%) and accept HSA/FSA cards.',
   'Billing_Insurance', true),
  ('Do you offer payment plans?',
   'Yes! 3-month and 6-month interest-free plans for programs over $2,000. HSA/FSA cards also accepted.',
   'Billing_Insurance', true),
  ('What are your office hours?',
   'Monday–Friday 8 AM–6 PM CT. Saturday by request. Emails and portal messages answered within one business day.',
   'General_Info', true),
  ('How do I get started?',
   'Book a free 15-minute discovery call at fitlogic.com/book. We discuss your goals, answer questions, and recommend the best program. No pressure, no commitment.',
   'General_Info', true),
  ('Can I refer a friend?',
   'Yes! When your referral enrolls in any program, you both receive a $250 credit. No limit on referrals. Ask about our Ambassador Program.',
   'General_Info', true)
ON CONFLICT DO NOTHING;
