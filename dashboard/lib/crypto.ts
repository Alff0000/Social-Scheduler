import "server-only";
import crypto from "crypto";

/*
  Encryption at rest for the one place this schema stores a raw login credential —
  stock_accounts.password_enc / twofa_enc (migration 0031). Everything else secret in
  this app (channels.access_token) is an OAuth token issued by the platform: scoped,
  revocable, and worthless to a reader who lacks the matching app secret. A scraped
  Instagram password has none of those properties, so unlike every other secret in this
  codebase, it earns being encrypted rather than merely gitignored.

  AES-256-GCM: authenticated encryption, so a tampered or truncated ciphertext fails to
  decrypt loudly (GCM's tag check) instead of returning corrupted bytes. The key comes
  from CREDENTIALS_ENCRYPTION_KEY in .env — 32 random bytes, base64-encoded — never
  derived from a guessable value and never hardcoded here.
*/

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM's recommended nonce size
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const raw = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "CREDENTIALS_ENCRYPTION_KEY is not set. Generate one with " +
        '`node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"` ' +
        "and add it to your .env — required before storing any stock account credential."
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `CREDENTIALS_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${key.length}). ` +
        "Generate a fresh one — see .env.example."
    );
  }
  return key;
}

/** iv (12 bytes) + auth tag (16 bytes) + ciphertext, concatenated and base64-encoded. */
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

/**
 * Reverses encryptSecret. Throws (GCM tag mismatch) on any tampered, truncated, or
 * wrong-key ciphertext — never silently returns garbage.
 */
export function decryptSecret(encoded: string): string {
  const buf = Buffer.from(encoded, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
