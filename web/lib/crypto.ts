/**
 * Application-level encryption for SAP credentials stored in the database.
 *
 * AES-256-GCM with a random 12-byte IV per value; the master key comes from the
 * `MUAVE_CRED_KEY` env var (32 bytes, base64 — generate with
 * `openssl rand -base64 32` and store as a SENSITIVE Vercel env var).
 *
 * Stored format: `v1:<iv-b64url>:<tag-b64url>:<ciphertext-b64url>`.
 * A database leak without the key reveals nothing; rotating the key requires
 * re-encrypting rows (re-enter credentials in /admin/systems).
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

export class CredKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredKeyError";
  }
}

function masterKey(): Buffer {
  const raw = process.env.MUAVE_CRED_KEY;
  if (!raw) {
    throw new CredKeyError(
      "MUAVE_CRED_KEY is not set. Generate one with `openssl rand -base64 32` and add it " +
        "as a Sensitive environment variable before storing system credentials."
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new CredKeyError("MUAVE_CRED_KEY must decode to exactly 32 bytes (use `openssl rand -base64 32`).");
  }
  return key;
}

/** True when a master key is configured (used to gate the admin UI). */
export function credKeyConfigured(): boolean {
  try {
    masterKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plaintext: string): string {
  const key = masterKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(":");
}

export function decryptSecret(stored: string): string {
  const [version, ivB64, tagB64, ctB64] = stored.split(":");
  if (version !== VERSION || !ivB64 || !tagB64 || !ctB64) {
    throw new CredKeyError("Stored credential has an unrecognized format.");
  }
  const key = masterKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64url")), decipher.final()]).toString("utf8");
}
