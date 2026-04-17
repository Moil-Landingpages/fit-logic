-- Add last_sent_at to campaigns to track daily send completion
-- Prevents multiple hourly sends for the same campaign on the same day
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ;

-- Add index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_campaigns_last_sent_at
  ON public.campaigns (last_sent_at);
