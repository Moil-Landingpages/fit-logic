-- Add Gmail sync columns to inquiries table
ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS source      TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_id   TEXT,
  ADD COLUMN IF NOT EXISTS is_lead     BOOLEAN DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inquiries_source_id
  ON public.inquiries (source_id)
  WHERE source_id IS NOT NULL;
