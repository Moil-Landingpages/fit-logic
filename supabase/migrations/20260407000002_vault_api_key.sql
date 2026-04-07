-- Phase B3: Move email provider API key to Supabase Vault
--
-- Prerequisites (one-time, done in Supabase dashboard):
--   1. Enable the vault extension: Extensions > vault > Enable
--   2. Run: SELECT vault.create_secret('YOUR_KEY', 'email_provider_api_key');
--      This stores the key and records its UUID in vault.secrets.
--
-- This migration adds a column to hold the vault secret ID so the edge
-- function can look it up via vault.decrypted_secrets instead of storing
-- the raw key in practice_settings.email_provider_api_key.

ALTER TABLE practice_settings
  ADD COLUMN IF NOT EXISTS email_api_key_secret_id uuid;

-- Helper function callable by service_role (edge functions) to retrieve the
-- decrypted API key — tries vault first, falls back to plain column.
CREATE OR REPLACE FUNCTION get_email_api_key()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret_id uuid;
  v_key       text;
BEGIN
  SELECT email_api_key_secret_id INTO v_secret_id
  FROM practice_settings LIMIT 1;

  IF v_secret_id IS NOT NULL THEN
    SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
    WHERE id = v_secret_id;
    IF v_key IS NOT NULL AND v_key <> '' THEN
      RETURN v_key;
    END IF;
  END IF;

  -- Fallback: plain text column (migrate away from this once vault is active)
  SELECT email_provider_api_key INTO v_key
  FROM practice_settings LIMIT 1;

  RETURN v_key;
END;
$$;

-- Only authenticated role can call it (edge functions use service_role which bypasses RLS anyway)
REVOKE ALL ON FUNCTION get_email_api_key() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_email_api_key() TO service_role;
