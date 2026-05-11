import crypto from "crypto";

// Derive a stable 32-byte key from SECRET_KEY (or TOKEN_ENCRYPTION_KEY if set).
// Falls back gracefully if neither is set, but in production one MUST be set.
function getKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY || process.env.SECRET_KEY;
  if (!raw) throw new Error("TOKEN_ENCRYPTION_KEY or SECRET_KEY must be set to encrypt refresh tokens");
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptToken(plain: string): string {
  if (!plain) return "";
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: v1.<iv>.<tag>.<ciphertext> — all base64url
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}

export function decryptToken(payload: string | null | undefined): string | null {
  if (!payload) return null;
  if (!payload.startsWith("v1.")) return payload; // legacy plaintext fallback
  try {
    const [, ivB64, tagB64, dataB64] = payload.split(".");
    const key = getKey();
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivB64, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64url")),
      decipher.final(),
    ]);
    return dec.toString("utf8");
  } catch (err) {
    console.error("decryptToken failed", err);
    return null;
  }
}

export function generateState(): string {
  return crypto.randomBytes(24).toString("base64url");
}
