import { AppError, childLogger, env } from "@sat/shared";
import {
  type Credential,
  type SkillName,
  type SkillResult,
  skillInput,
} from "@sat/events";
import type { AgentAction } from "@sat/events";
import { type DriverName, makeDriver, resolveDriver } from "./driver-factory.js";
import { dumpFailure } from "./diagnostics.js";
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
 * Decide whether a failed Firecrawl attempt is worth retrying on Playwright.
 *
 * We fall back on infrastructure failures (Firecrawl down, /interact timeout,
 * captureDownload couldn't grab the PDF, raw network errors) but NOT on
 * deterministic, user-facing outcomes:
 *   - auth_failed       → bad credentials; a second real SAT login risks lockout.
 *   - validation_failed → bad CFDI data; Playwright would reject it identically.
 *   - captcha_failed    → already handed to the live-view; don't abandon it.
 */
function shouldFallback(err: unknown): boolean {
  if (err instanceof AppError) {
    return !["auth_failed", "validation_failed", "captcha_failed"].includes(err.code);
  }
  return true; // raw infra/network error
}

/** Ordered list of drivers to try for this credential. */
function driverPlan(credential: Credential): DriverName[] {
  // e.firma stays local — the private key never leaves our infra.
  if (credential.kind === "efirma") return ["playwright"];
  // CIEC: configured primary (Firecrawl by default) → Playwright fallback.
  const primary = resolveDriver(env.SAT_DRIVER);
  return [...new Set<DriverName>([primary, "playwright"])];
}

/**
 * Entry point used by the worker. Opens a session on the primary driver, runs the
 * flow, and on an infrastructure failure retries the whole skill on the Playwright
 * fallback. Each attempt always tears its session down.
 */
export async function runSkill(args: RunSkillArgs): Promise<SkillResult> {
  const { skill, credential, correlationId, userId } = args;
  const rfc = credential.rfc;
  const log = childLogger({ correlationId, rfc, skill });

  // Validate input against the shared schema before touching a browser.
  const input = skillInput[skill].parse(args.input ?? {});

  const drivers = driverPlan(credential);
  let lastErr: unknown;

  for (let i = 0; i < drivers.length; i++) {
    const choice = drivers[i] as DriverName;
    const next = drivers[i + 1];
    try {
      return await attempt(choice);
    } catch (err) {
      lastErr = err;
      if (!next || !shouldFallback(err)) throw err;
      log.warn(
        { from: choice, to: next, err: (err as Error).message },
        "driver failed — falling back",
      );
    }
  }
  // Unreachable (loop either returns or throws), but keeps types honest.
  throw lastErr;

  async function attempt(choice: DriverName): Promise<SkillResult> {
    const driver = makeDriver(choice);
    log.info({ driver: driver.name }, "running skill");

    const startedAt = Date.now();
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
      const result = await runFlow(ctx);
      log.info({ driver: driver.name, ms: Date.now() - startedAt }, "skill finished");
      return result;
    } catch (err) {
      // Capture the page so the failing (often authenticated) selector is visible.
      log.error(
        { driver: driver.name, ms: Date.now() - startedAt, err: (err as Error).message },
        "skill failed",
      );
      await dumpFailure(session, correlationId, skill);
      throw err;
    } finally {
      await session.close().catch(() => void 0);
    }
  }

  async function runFlow(ctx: FlowContext): Promise<SkillResult> {
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
  }
}
