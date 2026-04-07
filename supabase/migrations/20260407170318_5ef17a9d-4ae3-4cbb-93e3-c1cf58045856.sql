CREATE TABLE public.practice_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_name text NOT NULL DEFAULT 'FitLogic Functional Medicine',
  timezone text NOT NULL DEFAULT 'America/New_York',
  business_hours_start integer NOT NULL DEFAULT 8,
  business_hours_end integer NOT NULL DEFAULT 18,
  business_days text[] NOT NULL DEFAULT '{Mon,Tue,Wed,Thu,Fri}',
  max_sends_per_day integer NOT NULL DEFAULT 50,
  escalation_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  google_calendar_token jsonb,
  google_gmail_token jsonb,
  email_provider text NOT NULL DEFAULT 'resend',
  email_provider_api_key text,
  email_from_address text,
  email_from_name text DEFAULT 'FitLogic',
  email_api_key_secret_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.practice_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_practice_settings" ON public.practice_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.email_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  reason text DEFAULT 'bounce',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_email_suppressions" ON public.email_suppressions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);