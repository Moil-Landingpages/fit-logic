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
