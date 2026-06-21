import { connection } from "./queue.js";

export interface Caller {
  userId: string;
  credentialId: string;
  rfc: string;
}

const CALLER_TTL = 3600; // 1 hour

function callerKey(callId: string) {
  return `vapi:caller:${callId}`;
}

export async function setCaller(callId: string, caller: Caller): Promise<void> {
  await connection.set(callerKey(callId), JSON.stringify(caller), "EX", CALLER_TTL);
}

export async function resolveCaller(callId: string): Promise<Caller | null> {
  const raw = await connection.get(callerKey(callId));
  if (!raw) return null;
  return JSON.parse(raw) as Caller;
}
