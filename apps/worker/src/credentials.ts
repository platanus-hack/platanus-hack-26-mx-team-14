import { eq } from "drizzle-orm";
import { open, openString } from "@sat/shared";
import { db, credentials } from "@sat/db";
import type { Credential } from "@sat/events";

export async function loadCredential(credentialId: string): Promise<Credential> {
  const [row] = await db().select().from(credentials).where(eq(credentials.id, credentialId));
  if (!row) throw new Error(`credential not found: ${credentialId}`);

  if (row.kind === "ciec") {
    if (!row.encPassword) throw new Error("ciec credential missing password");
    return { kind: "ciec", rfc: row.rfc, password: openString(row.encPassword) };
  }
  if (!row.encCer || !row.encKey || !row.encKeyPassword) {
    throw new Error("efirma credential missing cer/key/password");
  }
  return {
    kind: "efirma",
    rfc: row.rfc,
    cer: open(row.encCer),
    key: open(row.encKey),
    keyPassword: openString(row.encKeyPassword),
  };
}
