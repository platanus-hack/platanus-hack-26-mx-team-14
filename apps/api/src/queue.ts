import { Queue, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import { env } from "@sat/shared";
import { QUEUES, type ScrapeJob, type SkillResult } from "@sat/events";

export const connection = new IORedis({ ...env.redis, maxRetriesPerRequest: null });

export const scrapeQueue = new Queue<ScrapeJob, SkillResult>(QUEUES.scrape, { connection });
const scrapeEvents = new QueueEvents(QUEUES.scrape, { connection });

export async function runSkillViaQueue(
  job: ScrapeJob,
  ttlMs = 120_000,
): Promise<SkillResult> {
  const added = await scrapeQueue.add(job.skill, job, {
    jobId: job.idempotencyKey,
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  });
  return (await added.waitUntilFinished(scrapeEvents, ttlMs)) as SkillResult;
}

export const actionChannel = (correlationId: string) => `actions:${correlationId}`;
