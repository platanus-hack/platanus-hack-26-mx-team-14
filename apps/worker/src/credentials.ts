import { eq } from "drizzle-orm";
import { open, openString, keyFingerprint, maskRfc, childLogger } from "@sat/shared";
import { db, credentials } from "@sat/db";
import type { Credential } from "@sat/events";

/**
 * Wraps decryption so a GCM auth-tag failure ("Unsupported state or unable to
 * authenticate data") becomes an actionable message instead of a cryptic Node
 * crypto error. This almost always means the credential was sealed with a
 * DIFFERENT ENCRYPTION_KEY than the one loaded now → re-save the credential.
 */
function decryptOrExplain<T>(
  fn: () => T,
  meta: { credentialId: string; rfc: string; field: string },
): T {
  try {
    return fn();
  } catch (err) {
    const log = childLogger({ credentialId: meta.credentialId, rfc: meta.rfc });
    log.error(
      {
        field: meta.field,
        keyFp: keyFingerprint(),
        cause: (err as Error).message,
      },
      "credential decryption FAILED — ENCRYPTION_KEY mismatch (re-save this credential)",
    );
    throw new Error(
      `Cannot decrypt credential ${meta.credentialId} (field=${meta.field}, rfc=${maskRfc(meta.rfc)}, ` +
        `keyFp=${keyFingerprint()}). The ENCRYPTION_KEY differs from the one used to seal it — ` +
        `re-save the SAT credential so it's re-encrypted with the current key.`,
    );
  }
}

export async function loadCredential(credentialId: string): Promise<Credential> {
  const [row] = await db().select().from(credentials).where(eq(credentials.id, credentialId));
  if (!row) throw new Error(`credential not found: ${credentialId}`);

  const log = childLogger({ credentialId, rfc: row.rfc });
  log.info({ kind: row.kind, keyFp: keyFingerprint() }, "loaded credential row, decrypting");

  if (row.kind === "ciec") {
    if (!row.encPassword) throw new Error("ciec credential missing password");
    const password = decryptOrExplain(() => openString(row.encPassword as string), {
      credentialId,
      rfc: row.rfc,
      field: "password",
    });
    log.info("ciec credential decrypted ok");
    return { kind: "ciec", rfc: row.rfc, password };
  }
  if (!row.encCer || !row.encKey || !row.encKeyPassword) {
    throw new Error("efirma credential missing cer/key/password");
  }
  const cred: Credential = {
    kind: "efirma",
    rfc: row.rfc,
    cer: decryptOrExplain(() => open(row.encCer as string), { credentialId, rfc: row.rfc, field: "cer" }),
    key: decryptOrExplain(() => open(row.encKey as string), { credentialId, rfc: row.rfc, field: "key" }),
    keyPassword: decryptOrExplain(() => openString(row.encKeyPassword as string), {
      credentialId,
      rfc: row.rfc,
      field: "keyPassword",
    }),
  };
  log.info("efirma credential decrypted ok");
  return cred;
}
