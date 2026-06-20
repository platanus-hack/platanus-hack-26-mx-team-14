import { childLogger } from "@sat/shared";
import {
  type Credential,
  type SkillName,
  type SkillResult,
  skillInput,
} from "@sat/events";
import type { AgentAction } from "@sat/events";
import { makeDriver } from "./driver-factory.js";
import type { FlowContext } from "./flows/context.js";
import { getEmitedInvoices } from "./flows/getEmitedInvoices.js";
import { getReceiptInvoices } from "./flows/getReceiptInvoices.js";
import { generateCSF } from "./flows/generateCSF.js";
import { generateInvoice } from "./flows/generateInvoice.js";

export interface RunSkillArgs {
  skill: SkillName;
  input: unknown;
  credential: Credential;
  correlationId: string;
  userId: string;
  emit?: (action: Omit<AgentAction, "correlationId">) => void;
}

/**
 * Entry point used by the worker. Picks the driver (forcing Playwright for
 * e.firma, since uploading .cer/.key into Firecrawl is an open item), opens a
 * session, runs the flow, and always tears the session down.
 */
export async function runSkill(args: RunSkillArgs): Promise<SkillResult> {
  const { skill, credential, correlationId, userId } = args;
  const rfc = credential.rfc;
  const log = childLogger({ correlationId, rfc, skill });

  // Validate input against the shared schema before touching a browser.
  const input = skillInput[skill].parse(args.input ?? {});

  // e.firma must run on the local Playwright driver (private key stays in-house).
  const driver = makeDriver(credential.kind === "efirma" ? "playwright" : undefined);
  log.info({ driver: driver.name }, "running skill");

  const session = await driver.createSession({ rfc, correlationId });
  const ctx: FlowContext = {
    session,
    credential,
    correlationId,
    userId,
    rfc,
    log,
    emit: args.emit,
  };

  try {
    switch (skill) {
      case "getEmitedInvoices": {
        const invoices = await getEmitedInvoices(ctx, input as never);
        return { skill, invoices };
      }
      case "getReceiptInvoices": {
        const invoices = await getReceiptInvoices(ctx, input as never);
        return { skill, invoices };
      }
      case "generateCSF": {
        const csf = await generateCSF(ctx);
        return { skill, csf };
      }
      case "generateInvoice": {
        const res = await generateInvoice(ctx, input as never);
        return res.status === "previewed"
          ? { skill, status: "previewed", preview: res.preview }
          : { skill, status: "issued", issued: res.issued };
      }
      default: {
        const _exhaustive: never = skill;
        throw new Error(`Unknown skill: ${_exhaustive}`);
      }
    }
  } finally {
    await session.close().catch(() => void 0);
  }
}
