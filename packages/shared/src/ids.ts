import { randomUUID, createHash } from "node:crypto";

export function uuid(): string {
  return randomUUID();
}

/** Stable idempotency key from operation + normalized args. */
export function idempotencyKey(parts: Record<string, unknown>): string {
  const json = JSON.stringify(parts, Object.keys(parts).sort());
  return createHash("sha256").update(json).digest("hex").slice(0, 32);
}
