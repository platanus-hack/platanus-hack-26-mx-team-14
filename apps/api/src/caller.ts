export interface Caller {
  userId: string;
  credentialId: string;
  rfc: string;
}

export async function resolveCaller(_callId: string): Promise<Caller> {
  return {
    userId: process.env.DEMO_USER_ID ?? "demo-user",
    credentialId: process.env.DEMO_CREDENTIAL_ID ?? "demo-credential",
    rfc: process.env.DEMO_RFC ?? "XAXX010101000",
  };
}
