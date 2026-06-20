import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { env } from "./config.js";

/**
 * Authenticated encryption (AES-256-GCM) for SAT credentials at rest.
 * Sealed blob layout: [12-byte IV][16-byte auth tag][ciphertext], base64.
 * The data key (CRED_ENC_KEY, 32 bytes base64) lives outside the DB.
 */
const ALGO = "aes-256-gcm";

function key(): Buffer {
  if (!env.encryptionKey) {
    throw new Error("ENCRYPTION_KEY is not set — cannot (de)seal credentials");
  }
  const k = Buffer.from(env.encryptionKey, "base64");
  if (k.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 32 bytes (base64-encoded)");
  }
  return k;
}

/**
 * Short, non-reversible fingerprint of the active ENCRYPTION_KEY (first 8 hex of
 * its SHA-256). Safe to log: lets you confirm two environments use the SAME key
 * without exposing it. If a credential won't decrypt, compare the fingerprint at
 * seal time vs. now — different fp ⇒ key mismatch.
 */
export function keyFingerprint(): string {
  if (!env.encryptionKey) return "unset";
  return createHash("sha256").update(env.encryptionKey).digest("hex").slice(0, 8);
}

export function seal(plaintext: Buffer | string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key(), iv);
  const data = Buffer.isBuffer(plaintext)
    ? plaintext
    : Buffer.from(plaintext, "utf8");
  const enc = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function open(sealed: string): Buffer {
  const buf = Buffer.from(sealed, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv(ALGO, key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]);
}

export function openString(sealed: string): string {
  return open(sealed).toString("utf8");
}
