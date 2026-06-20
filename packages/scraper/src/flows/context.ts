import type { Credential } from "@sat/events";
import type { Session } from "../types.js";
import type { Logger } from "@sat/shared";
import type { AgentAction } from "@sat/events";

export interface FlowContext {
  session: Session;
  credential: Credential;
  correlationId: string;
  userId: string;
  rfc: string;
  log: Logger;
  /** Stream progress to the UI (SSE). Optional. */
  emit?: (action: Omit<AgentAction, "correlationId">) => void;
}

export function step(ctx: FlowContext, label: string) {
  ctx.emit?.({ kind: "scraping", label, status: "started" });
  ctx.log.debug({ step: label }, "flow step");
}
