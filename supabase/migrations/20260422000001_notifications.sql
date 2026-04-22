-- In-app notifications (new-lead alerts, sync summaries, etc.)
CREATE TABLE IF NOT EXISTS public.notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text NOT NULL DEFAULT 'info',   -- 'new_lead' | 'sync_complete' | 'info'
  title       text NOT NULL,
  message     text,
  link        text,                           -- optional in-app route
  is_read     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_created_at_idx
  ON public.notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx
  ON public.notifications (is_read) WHERE is_read = false;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated access notifications" ON public.notifications;
CREATE POLICY "Authenticated access notifications"
  ON public.notifications FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
