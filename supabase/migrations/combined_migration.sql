-- =============================================================================
-- FitLogic — Combined Migration
-- Generated from all individual migration files in chronological order.
-- Run this once against a fresh Supabase project via the SQL editor.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;


-- ---------------------------------------------------------------------------
-- Shared trigger function: update_updated_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- ---------------------------------------------------------------------------
-- patients
-- ---------------------------------------------------------------------------
CREATE TABLE public.patients (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name        TEXT        NOT NULL,
  last_name         TEXT        NOT NULL,
  email             TEXT,
  phone             TEXT,
  date_of_birth     DATE,
  gender            TEXT,
  address           TEXT,
  city              TEXT,
  state             TEXT,
  zip_code          TEXT,
  insurance_provider TEXT,
  insurance_id      TEXT,
  status            TEXT        NOT NULL DEFAULT 'active',
  tags              TEXT[]      DEFAULT '{}',
  notes             TEXT,
  -- CRM fields
  pipeline_stage    TEXT        NOT NULL DEFAULT 'new_lead',
  lead_source       TEXT,
  company           TEXT,
  deal_value        NUMERIC(12, 2),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT patients_pipeline_stage_check CHECK (pipeline_stage IN (
    'new_lead', 'contacted', 'qualified',
    'proposal', 'negotiation', 'won', 'lost'
  ))
);

ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER patients_updated_at
  BEFORE UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_patients_pipeline_stage ON public.patients (pipeline_stage, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patients_lead_source    ON public.patients (lead_source,    created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patients_status         ON public.patients (status,         created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patients_email_lower    ON public.patients (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patients_fts ON public.patients USING gin(
  to_tsvector('english',
    coalesce(first_name, '') || ' ' ||
    coalesce(last_name,  '') || ' ' ||
    coalesce(company,    '') || ' ' ||
    coalesce(email,      '')
  )
);


-- ---------------------------------------------------------------------------
-- audit_log
-- ---------------------------------------------------------------------------
CREATE TABLE public.audit_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name   TEXT        NOT NULL,
  record_id    UUID        NOT NULL,
  action       TEXT        NOT NULL,
  old_data     JSONB,
  new_data     JSONB,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  performed_by TEXT
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.audit_patient_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (table_name, record_id, action, new_data)
    VALUES ('patients', NEW.id, 'INSERT', to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_log (table_name, record_id, action, old_data, new_data)
    VALUES ('patients', NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (table_name, record_id, action, old_data)
    VALUES ('patients', OLD.id, 'DELETE', to_jsonb(OLD));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_audit_patients
  AFTER INSERT OR UPDATE OR DELETE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.audit_patient_changes();


-- ---------------------------------------------------------------------------
-- staff
-- ---------------------------------------------------------------------------
CREATE TABLE public.staff (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT        NOT NULL,
  role               TEXT        NOT NULL DEFAULT 'receptionist',
  email              TEXT        NOT NULL,
  categories_handled TEXT[]      DEFAULT '{}',
  active             BOOLEAN     NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- faqs
-- ---------------------------------------------------------------------------
CREATE TABLE public.faqs (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  question   TEXT        NOT NULL,
  answer     TEXT        NOT NULL,
  category   TEXT        NOT NULL DEFAULT 'General_Info',
  active     BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER faqs_updated_at
  BEFORE UPDATE ON public.faqs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- ---------------------------------------------------------------------------
-- inquiries
-- ---------------------------------------------------------------------------
CREATE TABLE public.inquiries (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id          UUID        REFERENCES public.patients(id) ON DELETE SET NULL,
  patient_name        TEXT        NOT NULL,
  patient_email       TEXT,
  source              TEXT        NOT NULL DEFAULT 'email',
  raw_content         TEXT        NOT NULL,
  category            TEXT        NOT NULL DEFAULT 'General_Info',
  category_confidence NUMERIC(3,2) DEFAULT 0.9,
  is_faq_match        BOOLEAN     DEFAULT false,
  assigned_to         UUID        REFERENCES public.staff(id) ON DELETE SET NULL,
  status              TEXT        NOT NULL DEFAULT 'pending',
  response_text       TEXT,
  staff_notes         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at         TIMESTAMPTZ
);

ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_inquiries_status_created ON public.inquiries (status, created_at DESC);


-- ---------------------------------------------------------------------------
-- intake_forms
-- ---------------------------------------------------------------------------
CREATE TABLE public.intake_forms (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT        NOT NULL,
  description      TEXT,
  questions        JSONB       NOT NULL DEFAULT '[]',
  active           BOOLEAN     NOT NULL DEFAULT true,
  submission_count INTEGER     NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.intake_forms ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER intake_forms_updated_at
  BEFORE UPDATE ON public.intake_forms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- ---------------------------------------------------------------------------
-- intake_submissions
-- ---------------------------------------------------------------------------
CREATE TABLE public.intake_submissions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id           UUID        NOT NULL REFERENCES public.intake_forms(id) ON DELETE CASCADE,
  patient_id        UUID        REFERENCES public.patients(id) ON DELETE SET NULL,
  patient_name      TEXT        NOT NULL,
  patient_email     TEXT,
  submission_data   JSONB       NOT NULL DEFAULT '{}',
  completion_status TEXT        NOT NULL DEFAULT 'incomplete',
  review_status     TEXT        NOT NULL DEFAULT 'pending',
  staff_notes       TEXT,
  submitted_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.intake_submissions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_intake_submissions_form_created
  ON public.intake_submissions (form_id, created_at DESC);


-- ---------------------------------------------------------------------------
-- email_templates
-- ---------------------------------------------------------------------------
CREATE TABLE public.email_templates (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  subject      TEXT        NOT NULL,
  preview_text TEXT,
  body_html    TEXT,
  category     TEXT        NOT NULL DEFAULT 'welcome',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- ---------------------------------------------------------------------------
-- segments
-- ---------------------------------------------------------------------------
CREATE TABLE public.segments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT        NOT NULL,
  description     TEXT,
  rules           JSONB       NOT NULL DEFAULT '[]',
  estimated_count INTEGER     NOT NULL DEFAULT 0,
  color           TEXT        DEFAULT 'primary',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.segments ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- campaigns
-- ---------------------------------------------------------------------------
CREATE TABLE public.campaigns (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT        NOT NULL,
  status               TEXT        NOT NULL DEFAULT 'draft',
  campaign_type        TEXT        NOT NULL DEFAULT 'single',
  template_id          UUID        REFERENCES public.email_templates(id) ON DELETE SET NULL,
  segment_id           UUID        REFERENCES public.segments(id) ON DELETE SET NULL,
  scheduled_at         TIMESTAMPTZ,
  sent_at              TIMESTAMPTZ,
  stats                JSONB,
  auto_schedule        BOOLEAN     DEFAULT false,
  max_sends_per_day    INTEGER     DEFAULT 50,
  business_hours_start INTEGER     DEFAULT 8,
  business_hours_end   INTEGER     DEFAULT 18,
  business_days        TEXT[]      DEFAULT '{Mon,Tue,Wed,Thu,Fri}'::text[],
  recipient_count      INTEGER     DEFAULT 0,
  sent_count           INTEGER     DEFAULT 0,
  next_send_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER campaigns_updated_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX IF NOT EXISTS idx_campaigns_status_scheduled
  ON public.campaigns (status, scheduled_at)
  WHERE status IN ('scheduled', 'sending');


-- ---------------------------------------------------------------------------
-- campaign_sequences
-- ---------------------------------------------------------------------------
CREATE TABLE public.campaign_sequences (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       UUID        NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  step_number       INTEGER     NOT NULL DEFAULT 1,
  template_id       UUID        REFERENCES public.email_templates(id) ON DELETE SET NULL,
  delay_days        INTEGER     NOT NULL DEFAULT 0,
  subject_override  TEXT,
  body_html_override TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.campaign_sequences ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- campaign_recipients
-- ---------------------------------------------------------------------------
CREATE TABLE public.campaign_recipients (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  UUID        NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  patient_id   UUID        REFERENCES public.patients(id) ON DELETE SET NULL,
  email        TEXT        NOT NULL,
  name         TEXT,
  source       TEXT        NOT NULL DEFAULT 'customer',
  status       TEXT        NOT NULL DEFAULT 'pending',
  sent_at      TIMESTAMPTZ,
  opened_at    TIMESTAMPTZ,
  clicked_at   TIMESTAMPTZ,
  current_step INTEGER     DEFAULT 0,
  last_error   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign ON public.campaign_recipients (campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_email    ON public.campaign_recipients (email);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_queue
  ON public.campaign_recipients (campaign_id, status, created_at);


-- ---------------------------------------------------------------------------
-- campaign_send_log
-- ---------------------------------------------------------------------------
CREATE TABLE public.campaign_send_log (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         UUID        NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  recipient_id        UUID        NOT NULL REFERENCES public.campaign_recipients(id) ON DELETE CASCADE,
  step_number         INTEGER     NOT NULL DEFAULT 1,
  status              TEXT        NOT NULL DEFAULT 'queued',
  sent_at             TIMESTAMPTZ,
  opened_at           TIMESTAMPTZ,
  clicked_at          TIMESTAMPTZ,
  error_message       TEXT,
  tracking_id         TEXT        UNIQUE DEFAULT gen_random_uuid()::text,
  provider_message_id TEXT,
  bounce_type         TEXT,
  complaint_at        TIMESTAMPTZ,
  provider            TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.campaign_send_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_send_log_campaign  ON public.campaign_send_log (campaign_id);
CREATE INDEX IF NOT EXISTS idx_send_log_recipient ON public.campaign_send_log (recipient_id);
CREATE INDEX IF NOT EXISTS idx_send_log_tracking  ON public.campaign_send_log (tracking_id);
CREATE INDEX IF NOT EXISTS idx_send_log_status    ON public.campaign_send_log (status);
CREATE INDEX IF NOT EXISTS idx_campaign_send_log_campaign_date
  ON public.campaign_send_log (campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_send_log_tracking
  ON public.campaign_send_log (tracking_id)
  WHERE tracking_id IS NOT NULL;


-- ---------------------------------------------------------------------------
-- campaign_unsubscribes
-- ---------------------------------------------------------------------------
CREATE TABLE public.campaign_unsubscribes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT        NOT NULL,
  campaign_id     UUID        REFERENCES public.campaigns(id),
  unsubscribed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(email)
);

ALTER TABLE public.campaign_unsubscribes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_unsubscribes_email ON public.campaign_unsubscribes (email);


-- ---------------------------------------------------------------------------
-- email_suppressions
-- ---------------------------------------------------------------------------
CREATE TABLE public.email_suppressions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT        NOT NULL,
  reason      TEXT        NOT NULL CHECK (reason IN ('hard_bounce', 'soft_bounce', 'complaint', 'manual')),
  campaign_id UUID        REFERENCES public.campaigns(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_suppressions_email
  ON public.email_suppressions (lower(email));

ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- referrals
-- ---------------------------------------------------------------------------
CREATE TABLE public.referrals (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_name  TEXT        NOT NULL,
  referrer_email TEXT        NOT NULL,
  referral_code  TEXT        NOT NULL UNIQUE,
  referred_name  TEXT,
  referred_email TEXT,
  status         TEXT        NOT NULL DEFAULT 'pending',
  converted_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- practice_settings  (singleton row)
-- ---------------------------------------------------------------------------
CREATE TABLE public.practice_settings (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_name           TEXT        NOT NULL DEFAULT 'FitLogic Practice',
  timezone                TEXT        NOT NULL DEFAULT 'America/New_York',
  business_hours_start    INTEGER     NOT NULL DEFAULT 8,
  business_hours_end      INTEGER     NOT NULL DEFAULT 18,
  business_days           TEXT[]      NOT NULL DEFAULT ARRAY['Mon','Tue','Wed','Thu','Fri'],
  max_sends_per_day       INTEGER     NOT NULL DEFAULT 500,
  escalation_staff_id     UUID        REFERENCES public.staff(id) ON DELETE SET NULL,
  google_calendar_token   JSONB,
  google_gmail_token      JSONB,
  email_provider          TEXT        NOT NULL DEFAULT 'resend',
  email_provider_api_key  TEXT,
  email_from_address      TEXT,
  email_from_name         TEXT        DEFAULT 'FitLogic',
  email_api_key_secret_id UUID,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enforce a single settings row
CREATE UNIQUE INDEX IF NOT EXISTS practice_settings_singleton ON public.practice_settings ((true));

INSERT INTO public.practice_settings (practice_name) VALUES ('FitLogic Practice')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.update_practice_settings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_practice_settings_updated_at
  BEFORE UPDATE ON public.practice_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_practice_settings_updated_at();

ALTER TABLE public.practice_settings ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- Helper function: find_or_create_patient
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.find_or_create_patient(
  p_name  TEXT,
  p_email TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient_id UUID;
  v_parts      TEXT[];
  v_first      TEXT;
  v_last       TEXT;
BEGIN
  IF p_email IS NOT NULL AND p_email != '' THEN
    SELECT id INTO v_patient_id FROM public.patients WHERE email = p_email LIMIT 1;
    IF v_patient_id IS NOT NULL THEN RETURN v_patient_id; END IF;
  END IF;

  v_parts := string_to_array(trim(p_name), ' ');
  v_first := v_parts[1];
  v_last  := CASE WHEN array_length(v_parts, 1) > 1 THEN array_to_string(v_parts[2:], ' ') ELSE '' END;

  SELECT id INTO v_patient_id FROM public.patients
  WHERE first_name = v_first AND last_name = v_last LIMIT 1;
  IF v_patient_id IS NOT NULL THEN RETURN v_patient_id; END IF;

  INSERT INTO public.patients (first_name, last_name, email, status)
  VALUES (v_first, v_last, NULLIF(p_email, ''), 'active')
  RETURNING id INTO v_patient_id;

  RETURN v_patient_id;
END;
$$;


-- ---------------------------------------------------------------------------
-- Helper function: get_email_api_key  (vault + fallback)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_email_api_key()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret_id UUID;
  v_key       TEXT;
BEGIN
  SELECT email_api_key_secret_id INTO v_secret_id
  FROM public.practice_settings LIMIT 1;

  IF v_secret_id IS NOT NULL THEN
    SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
    WHERE id = v_secret_id;
    IF v_key IS NOT NULL AND v_key <> '' THEN RETURN v_key; END IF;
  END IF;

  SELECT email_provider_api_key INTO v_key
  FROM public.practice_settings LIMIT 1;
  RETURN v_key;
END;
$$;

REVOKE ALL ON FUNCTION public.get_email_api_key() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_email_api_key() TO service_role;


-- ---------------------------------------------------------------------------
-- RLS policies — authenticated users only
-- ---------------------------------------------------------------------------

-- patients
CREATE POLICY "Authenticated access patients" ON public.patients
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- audit_log  (read-only for staff; triggers write via security definer)
CREATE POLICY "Authenticated read audit_log" ON public.audit_log
  FOR SELECT USING (auth.role() = 'authenticated');

-- campaigns
CREATE POLICY "Authenticated access campaigns" ON public.campaigns
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- campaign_sequences
CREATE POLICY "Authenticated access campaign_sequences" ON public.campaign_sequences
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- campaign_recipients
CREATE POLICY "Authenticated access campaign_recipients" ON public.campaign_recipients
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- campaign_send_log
CREATE POLICY "Authenticated access campaign_send_log" ON public.campaign_send_log
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- campaign_unsubscribes (service_role writes via edge functions; staff reads)
CREATE POLICY "Authenticated access campaign_unsubscribes" ON public.campaign_unsubscribes
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- email_suppressions
CREATE POLICY "Authenticated access email_suppressions" ON public.email_suppressions
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- segments
CREATE POLICY "Authenticated access segments" ON public.segments
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- inquiries
CREATE POLICY "Authenticated access inquiries" ON public.inquiries
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- intake_forms
CREATE POLICY "Authenticated manage intake_forms" ON public.intake_forms
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- intake_submissions: public INSERT (embedded form), authenticated read/modify
CREATE POLICY "Public insert intake_submissions" ON public.intake_submissions
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated read intake_submissions" ON public.intake_submissions
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated modify intake_submissions" ON public.intake_submissions
  FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated delete intake_submissions" ON public.intake_submissions
  FOR DELETE USING (auth.role() = 'authenticated');

-- faqs
CREATE POLICY "Authenticated access faqs" ON public.faqs
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- referrals
CREATE POLICY "Authenticated access referrals" ON public.referrals
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- staff
CREATE POLICY "Authenticated access staff" ON public.staff
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- practice_settings
CREATE POLICY "Authenticated access practice_settings" ON public.practice_settings
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- email_templates
CREATE POLICY "Authenticated access email_templates" ON public.email_templates
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');


-- ---------------------------------------------------------------------------
-- FAQ seed data
-- ---------------------------------------------------------------------------
DELETE FROM public.faqs;

INSERT INTO public.faqs (question, answer, category, active) VALUES
('How do I book a consultation?', 'You can book a free discovery call directly on our website at fitlogic.com/book, or reply to any of our emails with your preferred date and time. Discovery calls are 15 minutes and help us understand your goals before committing.', 'Appointment_Scheduling', true),
('What happens during the initial consultation?', 'Your first consultation is a comprehensive 60-minute session where we review your health history, current symptoms, lifestyle factors, and goals. We''ll create a personalized roadmap and discuss which of our programs is the best fit. You''ll leave with clear next steps.', 'Appointment_Scheduling', true),
('Do you offer virtual consultations?', 'Yes! We offer both in-person and virtual consultations via secure video. Most of our clients start with a virtual discovery call, and many continue their entire program remotely. Same quality, same results — from anywhere.', 'Appointment_Scheduling', true),
('How long until I can get an appointment?', 'Discovery calls are typically available within 3-5 business days. For returning clients, follow-up appointments are usually available within 1-2 weeks. We prioritize continuity of care for active program participants.', 'Appointment_Scheduling', true),
('What programs do you offer?', E'We offer three core programs:\n\n1. Hormone Optimization — A 12-week protocol for men and women experiencing fatigue, weight gain, or hormonal imbalances\n2. Gut Health Reset — An 8-week program addressing digestive issues, food sensitivities, and inflammation\n3. Executive Wellness — Ongoing optimization for high-performers including quarterly labs, biometric tracking, and personalized protocols\n\nEach program includes lab work, 1-on-1 coaching, and a customized plan.', 'Prescription_Lab_Requests', true),
('What kind of lab work do you order?', 'We run comprehensive panels that go far beyond standard bloodwork. This typically includes advanced hormonal panels, thyroid markers (full panel, not just TSH), metabolic markers, inflammatory markers, nutrient levels, and gut health testing when indicated. All labs are included in your program fee.', 'Prescription_Lab_Requests', true),
('How is functional medicine different from regular healthcare?', 'Traditional medicine focuses on diagnosing and treating disease. Functional medicine focuses on finding and addressing the root cause of your symptoms. We spend 10x more time with you, run more comprehensive labs, and create personalized protocols — not one-size-fits-all prescriptions. Our goal is optimization, not just normal.', 'Prescription_Lab_Requests', true),
('Do you offer group programs?', 'Yes! We run group cohorts for our Hormone Optimization and Gut Health Reset programs quarterly. Groups are limited to 12 people for personalized attention. Group programs are 40% less than 1-on-1 and include community support, weekly group calls, and all the same lab work.', 'Prescription_Lab_Requests', true),
('What kind of results can I expect?', 'Results vary by program and individual, but most clients report significant improvements within 4-6 weeks. Common outcomes include: better energy levels (reported by 89% of clients), improved sleep quality, weight changes of 8-15 lbs in 12 weeks, reduced brain fog, and better mood stability. We track objective biomarkers so you can see measurable progress.', 'Health_Questions', true),
('How long does it take to see results?', 'Most clients notice subjective improvements (energy, sleep, mood) within 2-3 weeks. Measurable biomarker changes typically show up on labs at 6-8 weeks. Full protocol results are assessed at 12 weeks. We set realistic expectations upfront and track progress at every step.', 'Health_Questions', true),
('Do you have client success stories?', 'Absolutely. We have dozens of documented case studies and testimonials on our website. Highlights include a 45-year-old executive who reversed pre-diabetes in 10 weeks, a working mom who eliminated chronic fatigue and lost 22 lbs, and a corporate team that reduced sick days by 34% through our group program.', 'Health_Questions', true),
('What if the program does not work for me?', 'We stand behind our work. If you complete your full program protocol and do not see measurable improvement in your labs and symptoms, we will extend your program at no additional cost until we find what works. We have never had a compliant client not see results.', 'Health_Questions', true),
('How much do your programs cost?', E'Our programs range from $1,500 to $4,500 depending on the program and format:\n\nDiscovery Call — Free\nGroup Programs — Starting at $1,500 (8-12 weeks)\n1-on-1 Programs — Starting at $2,500 (8-12 weeks)\nExecutive Wellness — $4,500/year (quarterly labs + ongoing coaching)\n\nAll programs include lab work, supplements protocol, and coaching. Payment plans are available.', 'Billing_Insurance', true),
('Do you accept insurance?', 'We are an out-of-network provider. We provide superbills that you can submit to your insurance for potential reimbursement — many PPO plans reimburse 50-80% of our fees. We also accept HSA/FSA cards for all services. Our team can help you verify your out-of-network benefits before you start.', 'Billing_Insurance', true),
('Do you offer payment plans?', 'Yes! We offer 3-month and 6-month payment plans with no interest for all programs over $2,000. We also accept HSA/FSA cards, which can make our programs effectively tax-free. Contact us for details on financing options.', 'Billing_Insurance', true),
('What is included in the program fee?', 'Everything you need is included: comprehensive lab panels (typically $800-1,200 value), all 1-on-1 coaching sessions, your personalized protocol, supplement recommendations with discount access, progress tracking, secure messaging with your practitioner between sessions, and access to our client resource library.', 'Billing_Insurance', true),
('Where are you located?', 'Our office is located in downtown Austin, TX. We also serve clients nationwide through our virtual programs. Approximately 60% of our clients work with us entirely remotely with the same great results.', 'General_Info', true),
('What are your office hours?', 'Monday through Friday, 8 AM to 6 PM CT. Saturday appointments available by request. Our team responds to emails and portal messages within one business day. For urgent matters, same-day callbacks are available for active clients.', 'General_Info', true),
('How do I get started?', 'The easiest way to get started is booking a free 15-minute discovery call at fitlogic.com/book. On the call, we will discuss your goals, answer questions, and recommend the best program for you. No pressure, no commitment — just a conversation about what is possible.', 'General_Info', true),
('Can I refer a friend?', 'Yes! We love referrals. When you refer a friend who enrolls in any program, you both receive a $250 credit toward services. There is no limit on referrals. Ask about our Ambassador Program for even more benefits.', 'General_Info', true);
