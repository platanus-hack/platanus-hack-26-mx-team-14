import { Worker } from "bullmq";
import IORedis from "ioredis";
import { env, childLogger, logger, keyFingerprint } from "@sat/shared";
import {
  QUEUES,
  type ScrapeJob,
  type SkillResult,
  type AgentAction,
} from "@sat/events";
import { runSkill } from "@sat/scraper";
import { loadCredential } from "./credentials.js";

const connection = new IORedis({ ...env.redis, maxRetriesPerRequest: null });
const publisher = new IORedis({ ...env.redis, maxRetriesPerRequest: null });

const worker = new Worker<ScrapeJob, SkillResult>(
  QUEUES.scrape,
  async (job) => {
    const data = job.data;
    const startedAt = Date.now();
    const log = childLogger({ correlationId: data.correlationId, rfc: data.rfc, skill: data.skill });
    log.info({ jobId: job.id, attempt: job.attemptsMade + 1, driver: env.SAT_DRIVER }, "picked up scrape job");

    const credential = await loadCredential(data.credentialId);

    const emit = (action: Omit<AgentAction, "correlationId">) => {
      const payload: AgentAction = { ...action, correlationId: data.correlationId };
      publisher.publish(`actions:${data.correlationId}`, JSON.stringify(payload));
    };

    log.info({ kind: credential.kind, driver: env.SAT_DRIVER }, "credential ready, starting skill");
    const result = await runSkill({
      skill: data.skill,
      input: data.input,
      credential,
      correlationId: data.correlationId,
      userId: data.userId,
      emit,
    });
    log.info({ jobId: job.id, ms: Date.now() - startedAt }, "scrape job done");
    return result;
  },
  {
    connection,
    // The SAT allows only ONE active session per RFC: two concurrent jobs for the
    // same account log each other out mid-flow ("bounced to login", "element detached
    // → iniciar-sesion"). Serialize to one SAT session at a time. (Single-user demo;
    // if multi-tenant later, switch to per-RFC concurrency groups instead.)
    concurrency: 1,
    // Throttle bursts to avoid SAT lockouts.
    limiter: { max: 5, duration: 60_000 },
  },
);

worker.on("completed", (job) => logger.info({ jobId: job.id }, "scrape completed"));
worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "scrape failed"));

logger.info(
  { driver: env.SAT_DRIVER, queue: QUEUES.scrape, keyFp: keyFingerprint(), debugCreds: env.DEBUG_CREDS },
  "Worker up",
);
