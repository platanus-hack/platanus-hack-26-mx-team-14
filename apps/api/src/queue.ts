import { Queue, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import { env, logger } from "@sat/shared";
import { QUEUES, type ScrapeJob, type SkillResult, type EmbedJob } from "@sat/events";

export const connection = new IORedis({ ...env.redis, maxRetriesPerRequest: null });

export const scrapeQueue = new Queue<ScrapeJob, SkillResult>(QUEUES.scrape, { connection });
const scrapeEvents = new QueueEvents(QUEUES.scrape, { connection });

export const embedQueue = new Queue<EmbedJob>(QUEUES.embed, { connection });

/**
 * Fire-and-forget enqueue of RAG memory writes. NEVER awaited on the user-facing
 * turn — embedding/persistence happens off the critical path, and a failure here
 * must never surface to the user mid-conversation (it just means a slightly colder
 * cache next time). Errors are logged, swallowed, and retried by BullMQ.
 */
export async function enqueueEmbed(job: EmbedJob): Promise<void> {
  if (job.docs.length === 0) return;
  try {
    await embedQueue.add("embed", job, {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: 500,
      removeOnFail: 200,
    });
  } catch (err) {
    logger.warn({ err, userId: job.userId, docs: job.docs.length }, "enqueueEmbed failed (non-fatal)");
  }
}

export async function runSkillViaQueue(
  job: ScrapeJob,
  ttlMs = 120_000,
): Promise<SkillResult> {
  const added = await scrapeQueue.add(job.skill, job, {
    jobId: job.idempotencyKey,
    // One retry only, and ONLY for genuinely retryable (infra) failures: the worker
    // re-throws non-retryable AppErrors (auth_failed/validation_failed) as
    // UnrecoverableError so BullMQ stops immediately. Each attempt is a full SAT
    // login, so over-retrying looks like "se intenta iniciar sesión muchas veces"
    // and risks an account lockout. The flow itself owns its internal lifecycle
    // (session always torn down in runSkill's finally).
    attempts: 2,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  });
  return (await added.waitUntilFinished(scrapeEvents, ttlMs)) as SkillResult;
}

export const actionChannel = (correlationId: string) => `actions:${correlationId}`;
