-- ============================================================================
-- Email Messages: synced from Gmail / Outlook via edge function
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.email_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider      text NOT NULL DEFAULT 'gmail',            -- 'gmail' | 'outlook'
  external_id   text NOT NULL,                            -- provider message id (dedup key)
  thread_id     text,                                     -- provider thread/conversation id
  from_email    text NOT NULL,
  from_name     text,
  to_email      text,
  subject       text,
  snippet       text,                                     -- short preview text
  body_text     text,                                     -- plain-text body
  body_html     text,                                     -- html body
  received_at   timestamptz NOT NULL DEFAULT now(),
  is_read       boolean NOT NULL DEFAULT false,
  labels        text[] DEFAULT '{}',                      -- provider labels/folders

  -- AI lead classification (populated by classify-email-leads function)
  is_lead       boolean NOT NULL DEFAULT false,
  lead_score    real,                                     -- 0.0 - 1.0
  lead_category text,                                     -- e.g. 'new_client', 'returning', 'referral'
  lead_summary  text,                                     -- AI-generated one-liner

  synced_at     timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Prevent duplicate imports
CREATE UNIQUE INDEX IF NOT EXISTS email_messages_provider_external_id_idx
  ON public.email_messages (provider, external_id);

-- Fast lookups for inbox queries
CREATE INDEX IF NOT EXISTS email_messages_received_at_idx
  ON public.email_messages (received_at DESC);
CREATE INDEX IF NOT EXISTS email_messages_is_lead_idx
  ON public.email_messages (is_lead) WHERE is_lead = true;

-- RLS: authenticated users only
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage email_messages"
  ON public.email_messages FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ============================================================================
-- Notifications: in-app notifications for new leads, syncs, etc.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text NOT NULL DEFAULT 'info',               -- 'new_lead' | 'sync_complete' | 'info'
  title       text NOT NULL,
  message     text,
  link        text,                                       -- optional in-app route
  is_read     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_created_at_idx
  ON public.notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx
  ON public.notifications (is_read) WHERE is_read = false;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage notifications"
  ON public.notifications FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
