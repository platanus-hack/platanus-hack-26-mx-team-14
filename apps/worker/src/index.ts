import { Worker, UnrecoverableError } from "bullmq";
import IORedis from "ioredis";
import { and, eq, desc, isNull, gte } from "drizzle-orm";
import { AppError, env, childLogger, logger, keyFingerprint } from "@sat/shared";
import {
  QUEUES,
  type ScrapeJob,
  type SkillResult,
  type AgentAction,
  type CSF,
} from "@sat/events";
import { db, documents } from "@sat/db";
import { runSkill } from "@sat/scraper";
import { loadCredential } from "./credentials.js";
import { startEmbedWorker } from "./embed.js";

const CSF_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function csfFromCache(userId: string, rfc: string): Promise<CSF | null> {
  const cutoff = new Date(Date.now() - CSF_CACHE_TTL_MS);
  const where = [
    eq(documents.userId, userId),
    eq(documents.type, "csf"),
    isNull(documents.deletedAt),
    gte(documents.updatedAt, cutoff),
  ];
  if (rfc) where.push(eq(documents.rfc, rfc));
  const rows = await db()
    .select({ metadata: documents.metadata })
    .from(documents)
    .where(and(...where))
    .orderBy(desc(documents.updatedAt))
    .limit(1);
  return rows[0] ? (rows[0].metadata as unknown as CSF) : null;
}

const connection = new IORedis({ ...env.redis, maxRetriesPerRequest: null });
const publisher = new IORedis({ ...env.redis, maxRetriesPerRequest: null });

const worker = new Worker<ScrapeJob, SkillResult>(
  QUEUES.scrape,
  async (job) => {
    const data = job.data;
    const startedAt = Date.now();
    const log = childLogger({ correlationId: data.correlationId, rfc: data.rfc, skill: data.skill });
    log.info({ jobId: job.id, attempt: job.attemptsMade + 1, driver: env.SAT_DRIVER }, "picked up scrape job");
    log.info({ skill: data.skill, input: data.input }, "skill input payload");

    const credential = await loadCredential(data.credentialId);

    const emit = (action: Omit<AgentAction, "correlationId">) => {
      const payload: AgentAction = { ...action, correlationId: data.correlationId };
      publisher.publish(`actions:${data.correlationId}`, JSON.stringify(payload));
    };

    log.info({ kind: credential.kind, driver: env.SAT_DRIVER }, "credential ready, starting skill");

    // Short-circuit generateCSF if we already have a fresh CSF in the DB (within 24h).
    // Re-scraping the SAT portal for the same data takes ~25s and risks session conflicts.
    if (data.skill === "generateCSF") {
      const cached = await csfFromCache(data.userId, data.rfc).catch(() => null);
      if (cached) {
        log.info({ jobId: job.id, rfc: data.rfc }, "generateCSF cache hit — returning stored CSF");
        return { skill: "generateCSF", csf: cached };
      }
    }

    try {
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
    } catch (err) {
      // Deterministic, user-facing failures (auth_failed, validation_failed) won't
      // succeed on a retry — re-attempting just logs into the SAT again and risks a
      // lockout. Convert them to UnrecoverableError so BullMQ ends the job's lifecycle
      // immediately instead of re-enqueuing. Genuine infra errors (retryable) bubble
      // up untouched and get the single configured retry.
      if (err instanceof AppError && !err.retryable) {
        log.warn(
          { jobId: job.id, code: err.code, ms: Date.now() - startedAt },
          "non-retryable skill failure — not re-enqueuing",
        );
        throw new UnrecoverableError(err.message);
      }
      throw err;
    }
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

// RAG memory write path — vectorizes + persists tool results (separate queue).
startEmbedWorker();

logger.info(
  { driver: env.SAT_DRIVER, queue: QUEUES.scrape, keyFp: keyFingerprint(), debugCreds: env.DEBUG_CREDS },
  "Worker up",
);
