-- Capture the conferencing join URL separately from the calendar event URL.
-- Google supplies `hangoutLink` for events that have a Meet attached.
-- Microsoft Graph supplies `onlineMeeting.joinUrl` for Teams meetings.
-- Falls back to the first URL parsed out of the description.

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS meeting_link text;
