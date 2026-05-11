-- CRM-side appointments. Each row mirrors an event we created on the
-- connected Google/Microsoft calendar so we can join against patients,
-- filter by status, and survive the external calendar going offline.

CREATE TABLE IF NOT EXISTS public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  subject text NOT NULL,
  description text,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'cancelled', 'completed')),
  attendee_emails text[] NOT NULL DEFAULT '{}',
  -- Provenance from the external provider so the user can find it in
  -- their calendar app and we can avoid double-creating on retries.
  provider text CHECK (provider IS NULL OR provider IN ('google', 'microsoft')),
  external_event_id text,
  external_event_link text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS appointments_patient_idx
  ON public.appointments (patient_id, start_at DESC);
CREATE INDEX IF NOT EXISTS appointments_start_idx
  ON public.appointments (start_at);
CREATE INDEX IF NOT EXISTS appointments_status_idx
  ON public.appointments (status);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read appointments"
  ON public.appointments FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "auth insert appointments"
  ON public.appointments FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "auth update appointments"
  ON public.appointments FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "auth delete appointments"
  ON public.appointments FOR DELETE
  USING (auth.role() = 'authenticated');

-- Touch updated_at on every row update.
CREATE OR REPLACE FUNCTION public.appointments_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_touch_updated_at_trg ON public.appointments;
CREATE TRIGGER appointments_touch_updated_at_trg
BEFORE UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.appointments_touch_updated_at();
