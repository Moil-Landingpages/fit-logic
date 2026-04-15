-- Phase audit-fix: tighten RLS on tables missed by 20260407000001_auth_rls.sql
-- campaign_unsubscribes still had an open USING (true) policy.
-- The campaign-unsubscribe edge function uses service_role so it bypasses RLS
-- even after this change.

DROP POLICY IF EXISTS "public_campaign_unsubscribes" ON campaign_unsubscribes;
DROP POLICY IF EXISTS "Public access campaign_unsubscribes" ON campaign_unsubscribes;
DROP POLICY IF EXISTS "Allow all campaign_unsubscribes" ON campaign_unsubscribes;
CREATE POLICY "Authenticated access campaign_unsubscribes"
  ON campaign_unsubscribes FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- BulkImportDialog does `upsert(records, { onConflict: "email" })` on patients,
-- but the patients table never had a unique index on email — so every CSV
-- import would error with "there is no unique or exclusion constraint matching
-- the ON CONFLICT specification".
-- Partial unique index on (email) matches the onConflict target while still
-- allowing multiple rows with NULL email (walk-ins, no email captured).
CREATE UNIQUE INDEX IF NOT EXISTS patients_email_unique
  ON patients (email)
  WHERE email IS NOT NULL;

-- email_suppressions has a unique index on lower(email), but the email-webhook
-- edge function upserts with `onConflict: "email"`. PostgREST's onConflict
-- targets need to match a constraint on that exact column, so the expression
-- index didn't satisfy it — every bounce/complaint webhook errored out.
-- The edge function already lowercases emails before insert, so a constraint
-- on the raw `email` column is equivalent for our access pattern.
CREATE UNIQUE INDEX IF NOT EXISTS email_suppressions_email_unique
  ON email_suppressions (email);
