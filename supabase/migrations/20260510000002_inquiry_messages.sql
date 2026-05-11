-- Threaded messages on an inquiry. Lets the same inquiry hold the original
-- inbound email plus any number of outbound replies (and, eventually, more
-- inbound replies if the customer responds again). The existing
-- `inquiries.raw_content` / `response_text` / `resolved_at` columns stay so
-- old code paths still work; new code reads the thread from this table.

CREATE TABLE IF NOT EXISTS public.inquiry_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id uuid NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_name text,
  from_email text,
  subject text,
  body_text text,
  body_html text,
  attachments jsonb,
  provider text,
  message_id text,
  status text DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'received')),
  error_message text,
  sent_by uuid,                       -- staff.id of the sender (outbound only)
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inquiry_messages_inquiry_idx
  ON public.inquiry_messages (inquiry_id, created_at);

ALTER TABLE public.inquiry_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read inquiry_messages"
  ON public.inquiry_messages FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "auth insert inquiry_messages"
  ON public.inquiry_messages FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "auth update inquiry_messages"
  ON public.inquiry_messages FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Backfill: convert every existing inquiry into one inbound message, plus an
-- outbound message for any reply already stored in inquiries.response_text.
-- raw_content is stored as `${subject}\n\n${body}`; split on the first blank
-- line to recover both parts.
INSERT INTO public.inquiry_messages (
  inquiry_id, direction, from_name, from_email, subject, body_text, created_at, status
)
SELECT
  i.id,
  'inbound',
  i.patient_name,
  i.patient_email,
  CASE
    WHEN position(E'\n\n' IN coalesce(i.raw_content, '')) > 0
      THEN substr(i.raw_content, 1, position(E'\n\n' IN i.raw_content) - 1)
    ELSE NULL
  END,
  CASE
    WHEN position(E'\n\n' IN coalesce(i.raw_content, '')) > 0
      THEN substr(i.raw_content, position(E'\n\n' IN i.raw_content) + 2)
    ELSE i.raw_content
  END,
  i.created_at,
  'received'
FROM public.inquiries i
WHERE NOT EXISTS (
  SELECT 1 FROM public.inquiry_messages m WHERE m.inquiry_id = i.id
);

INSERT INTO public.inquiry_messages (
  inquiry_id, direction, subject, body_text, created_at, status
)
SELECT
  i.id,
  'outbound',
  CASE
    WHEN i.raw_content LIKE 'Re:%' THEN i.raw_content
    WHEN position(E'\n\n' IN coalesce(i.raw_content, '')) > 0
      THEN 'Re: ' || substr(i.raw_content, 1, position(E'\n\n' IN i.raw_content) - 1)
    ELSE 'Re: Your message'
  END,
  i.response_text,
  coalesce(i.resolved_at, i.created_at),
  'sent'
FROM public.inquiries i
WHERE i.response_text IS NOT NULL
  AND i.response_text <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.inquiry_messages m
    WHERE m.inquiry_id = i.id AND m.direction = 'outbound'
  );
