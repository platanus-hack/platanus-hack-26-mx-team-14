import { z } from "zod";

/**
 * Two ways to authenticate against the SAT:
 *  - "ciec":   RFC + Contraseña (CIEC) + image captcha (solved at runtime)
 *  - "efirma": e.firma certificate (.cer) + private key (.key) + key password
 *
 * These describe the *decrypted, in-memory* credential a flow receives. At rest
 * they are sealed via @sat/shared crypto (see packages/db schema).
 */
export const ciecCredential = z.object({
  kind: z.literal("ciec"),
  rfc: z.string().min(12).max(13),
  password: z.string().min(1),
});

export const efirmaCredential = z.object({
  kind: z.literal("efirma"),
  rfc: z.string().min(12).max(13),
  /** DER/PEM bytes of the .cer */
  cer: z.instanceof(Buffer),
  /** DER/PEM bytes of the .key */
  key: z.instanceof(Buffer),
  keyPassword: z.string().min(1),
});

export const credential = z.discriminatedUnion("kind", [
  ciecCredential,
  efirmaCredential,
]);

export type CiecCredential = z.infer<typeof ciecCredential>;
export type EfirmaCredential = z.infer<typeof efirmaCredential>;
export type Credential = z.infer<typeof credential>;
export type CredentialKind = Credential["kind"];
