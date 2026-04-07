-- Phase B2: Replace open USING(true) RLS policies with authenticated-user policies
-- All tables are private — only authenticated Supabase users may access them.

-- Helper: authenticated() is true when a valid JWT is present.
-- For staff-level enforcement, we rely on Supabase Auth users only
-- (row-level org scoping can be added later when multi-tenant support is needed).

-- ─── patients ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public access patients" ON patients;
DROP POLICY IF EXISTS "Allow all patients" ON patients;
CREATE POLICY "Authenticated access patients"
  ON patients FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ─── campaigns ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public access campaigns" ON campaigns;
DROP POLICY IF EXISTS "Allow all campaigns" ON campaigns;
CREATE POLICY "Authenticated access campaigns"
  ON campaigns FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ─── campaign_sequences ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public access campaign_sequences" ON campaign_sequences;
DROP POLICY IF EXISTS "Allow all campaign_sequences" ON campaign_sequences;
CREATE POLICY "Authenticated access campaign_sequences"
  ON campaign_sequences FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ─── campaign_recipients ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public access campaign_recipients" ON campaign_recipients;
DROP POLICY IF EXISTS "Allow all campaign_recipients" ON campaign_recipients;
CREATE POLICY "Authenticated access campaign_recipients"
  ON campaign_recipients FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ─── campaign_send_log ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public access campaign_send_log" ON campaign_send_log;
DROP POLICY IF EXISTS "Allow all campaign_send_log" ON campaign_send_log;
CREATE POLICY "Authenticated access campaign_send_log"
  ON campaign_send_log FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ─── segments ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public access segments" ON segments;
DROP POLICY IF EXISTS "Allow all segments" ON segments;
CREATE POLICY "Authenticated access segments"
  ON segments FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ─── inquiries ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public access inquiries" ON inquiries;
DROP POLICY IF EXISTS "Allow all inquiries" ON inquiries;
CREATE POLICY "Authenticated access inquiries"
  ON inquiries FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ─── intake_forms ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public access intake_forms" ON intake_forms;
DROP POLICY IF EXISTS "Allow all intake_forms" ON intake_forms;
-- Intake forms: authenticated staff can manage, public can submit (SELECT for embed use)
CREATE POLICY "Authenticated manage intake_forms"
  ON intake_forms FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ─── intake_submissions ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public access intake_submissions" ON intake_submissions;
DROP POLICY IF EXISTS "Allow all intake_submissions" ON intake_submissions;
-- Submissions: anyone can INSERT (public form), only authenticated can SELECT/UPDATE/DELETE
CREATE POLICY "Public insert intake_submissions"
  ON intake_submissions FOR INSERT
  WITH CHECK (true);
CREATE POLICY "Authenticated read intake_submissions"
  ON intake_submissions FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated modify intake_submissions"
  ON intake_submissions FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated delete intake_submissions"
  ON intake_submissions FOR DELETE
  USING (auth.role() = 'authenticated');

-- ─── faqs ──────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public access faqs" ON faqs;
DROP POLICY IF EXISTS "Allow all faqs" ON faqs;
CREATE POLICY "Authenticated access faqs"
  ON faqs FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ─── referrals ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public access referrals" ON referrals;
DROP POLICY IF EXISTS "Allow all referrals" ON referrals;
CREATE POLICY "Authenticated access referrals"
  ON referrals FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ─── staff ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public access staff" ON staff;
DROP POLICY IF EXISTS "Allow all staff" ON staff;
CREATE POLICY "Authenticated access staff"
  ON staff FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ─── practice_settings ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public access practice_settings" ON practice_settings;
DROP POLICY IF EXISTS "Allow all practice_settings" ON practice_settings;
CREATE POLICY "Authenticated access practice_settings"
  ON practice_settings FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ─── email_suppressions ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public access email_suppressions" ON email_suppressions;
DROP POLICY IF EXISTS "Allow all email_suppressions" ON email_suppressions;
-- Webhook (service_role) and authenticated staff can manage suppressions
-- Unsubscribe edge function uses service_role key so bypasses RLS
CREATE POLICY "Authenticated access email_suppressions"
  ON email_suppressions FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ─── email_templates (if exists) ───────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'email_templates') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Public access email_templates" ON email_templates';
    EXECUTE 'DROP POLICY IF EXISTS "Allow all email_templates" ON email_templates';
    EXECUTE 'CREATE POLICY "Authenticated access email_templates"
      ON email_templates FOR ALL
      USING (auth.role() = ''authenticated'')
      WITH CHECK (auth.role() = ''authenticated'')';
  END IF;
END $$;

-- ─── audit_log ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'audit_log') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Public access audit_log" ON audit_log';
    EXECUTE 'DROP POLICY IF EXISTS "Allow all audit_log" ON audit_log';
    -- audit_log is append-only by triggers (service_role). Staff can SELECT.
    EXECUTE 'CREATE POLICY "Authenticated read audit_log"
      ON audit_log FOR SELECT
      USING (auth.role() = ''authenticated'')';
  END IF;
END $$;
