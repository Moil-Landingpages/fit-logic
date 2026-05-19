-- Appointment-anchored sequences.
--
-- Before this migration, campaign_sequences.delay_days was always interpreted
-- as "days after the previous step's sent_at" (a relative offset). That makes
-- it impossible to express "send 5 days before the patient's appointment" —
-- the natural pattern for pre-appointment reminders.
--
-- Two new pieces:
--
--   campaigns.anchor_type
--     'relative'           → existing behavior (delay_days = days after prev step)
--     'before_appointment' → delay_days = days BEFORE campaign_recipients.anchor_at
--     'after_appointment'  → delay_days = days AFTER  campaign_recipients.anchor_at
--
--   campaign_recipients.anchor_at / anchor_appointment_id
--     Per-recipient anchor date (denormalized from appointments.start_at so the
--     queue can filter without joining). anchor_appointment_id is the source
--     appointment, FK SET NULL so a deleted appointment doesn't break in-flight
--     sequences — the queue still has anchor_at to work with.

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS anchor_type TEXT NOT NULL DEFAULT 'relative'
    CHECK (anchor_type IN ('relative', 'before_appointment', 'after_appointment'));

COMMENT ON COLUMN public.campaigns.anchor_type IS
  'How campaign_sequences.delay_days is interpreted. relative = days after prev step (default, existing behavior). before_appointment / after_appointment = days relative to campaign_recipients.anchor_at.';

ALTER TABLE public.campaign_recipients
  ADD COLUMN IF NOT EXISTS anchor_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS anchor_appointment_id UUID
    REFERENCES public.appointments(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.campaign_recipients.anchor_at IS
  'Per-recipient anchor for appointment-anchored sequences. The queue computes target_send_at = anchor_at ± delay_days for each step. Null for relative campaigns.';

COMMENT ON COLUMN public.campaign_recipients.anchor_appointment_id IS
  'Source appointment for anchor_at. Denormalized from appointments.start_at at enrollment time so a later cancellation/reschedule does not silently break in-flight sequences — anchor_at is the source of truth for scheduling.';

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_anchor_at
  ON public.campaign_recipients (campaign_id, anchor_at)
  WHERE anchor_at IS NOT NULL;
