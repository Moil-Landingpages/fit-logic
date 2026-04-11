-- Add clicked_url column to campaign_send_log so the track-email edge function
-- can record which URL was clicked (currently referenced but column is missing).
ALTER TABLE campaign_send_log
  ADD COLUMN IF NOT EXISTS clicked_url text;
