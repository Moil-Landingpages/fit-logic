-- Mail provider integration (Google + Microsoft) with provider lock.
-- Stores OAuth state on practice_settings. Refresh tokens are stored
-- encrypted (AES-GCM) by the application before INSERT/UPDATE.

ALTER TABLE practice_settings
  ADD COLUMN IF NOT EXISTS mail_provider text
    CHECK (mail_provider IN ('google', 'microsoft')),
  ADD COLUMN IF NOT EXISTS provider_email text,
  ADD COLUMN IF NOT EXISTS provider_connected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS access_token text,
  ADD COLUMN IF NOT EXISTS refresh_token text,         -- ciphertext (base64)
  ADD COLUMN IF NOT EXISTS token_expiry timestamptz,
  ADD COLUMN IF NOT EXISTS token_scope text,
  ADD COLUMN IF NOT EXISTS microsoft_tenant text;

COMMENT ON COLUMN practice_settings.refresh_token IS
  'AES-GCM ciphertext (base64). Encrypted client-side using TOKEN_ENCRYPTION_KEY.';
