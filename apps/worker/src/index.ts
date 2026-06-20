import { Worker } from "bullmq";
import IORedis from "ioredis";
import { env, childLogger, logger } from "@sat/shared";
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
    const log = childLogger({ correlationId: data.correlationId, rfc: data.rfc, skill: data.skill });
    log.info("picked up scrape job");

    const credential = await loadCredential(data.credentialId);

    const emit = (action: Omit<AgentAction, "correlationId">) => {
      const payload: AgentAction = { ...action, correlationId: data.correlationId };
      publisher.publish(`actions:${data.correlationId}`, JSON.stringify(payload));
    };

    return runSkill({
      skill: data.skill,
      input: data.input,
      credential,
      correlationId: data.correlationId,
      userId: data.userId,
      emit,
    });
  },
  {
    connection,
    concurrency: 4,
    // Per-RFC throttling to avoid SAT lockouts.
    limiter: { max: 5, duration: 60_000 },
  },
);

worker.on("completed", (job) => logger.info({ jobId: job.id }, "scrape completed"));
worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "scrape failed"));

logger.info(`Worker up. driver=${env.SAT_DRIVER} queue=${QUEUES.scrape}`);
