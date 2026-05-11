-- Logs one-off emails sent from a contact's Compose dialog (i.e. the action
-- that flips pipeline_stage to "contacted"). Campaign sends already live in
-- campaign_send_log; this table is the equivalent for ad-hoc sends so the
-- Mailing tab on a contact can show both.

CREATE TABLE IF NOT EXISTS public.contact_email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  to_address text NOT NULL,
  to_name text,
  subject text NOT NULL,
  body_html text,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  provider text,
  message_id text,
  error_message text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz,
  clicked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_email_log_patient_sent_idx
  ON public.contact_email_log (patient_id, sent_at DESC);

ALTER TABLE public.contact_email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read contact_email_log"
  ON public.contact_email_log FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "auth insert contact_email_log"
  ON public.contact_email_log FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "auth update contact_email_log"
  ON public.contact_email_log FOR UPDATE
  USING (auth.role() = 'authenticated');
