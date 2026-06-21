import { Worker } from "bullmq";
import IORedis from "ioredis";
import { env, childLogger, logger } from "@sat/shared";
import { QUEUES, type EmbedJob } from "@sat/events";
import { embed } from "@sat/rag";
import {
  upsertDocuments,
  ensureRagIndexes,
  type DocType,
  type EmbeddedDoc,
} from "@sat/db";

/**
 * Embed worker — the RAG write path. Consumes batches of normalized documents from
 * the `embed` queue, vectorizes their bodies in a single Voyage call, and upserts
 * them into `documents` (deduped on userId+naturalKey). Runs entirely off the
 * user-facing turn, so it can be parallel and is safe to retry.
 */
export function startEmbedWorker(): Worker<EmbedJob> {
  const connection = new IORedis({ ...env.redis, maxRetriesPerRequest: null });

  // Best-effort: ensure the pgvector ANN index exists before we start serving reads.
  void ensureRagIndexes().catch((err) =>
    logger.warn({ err }, "ensureRagIndexes failed (queries fall back to seq scan)"),
  );

  const worker = new Worker<EmbedJob>(
    QUEUES.embed,
    async (job) => {
      const { userId, rfc, docs, sourceEventId } = job.data;
      if (docs.length === 0) return;
      const log = childLogger({ userId, rfc, queue: "embed" });

      const vectors = await embed(
        docs.map((d) => d.body),
        "document",
      );
      const embedded: EmbeddedDoc[] = docs.map((d, i) => ({
        type: d.type as DocType,
        naturalKey: d.naturalKey,
        title: d.title,
        body: d.body,
        metadata: d.metadata,
        embedding: vectors[i]!,
      }));

      const n = await upsertDocuments(userId, rfc, embedded, sourceEventId);
      log.info({ upserted: n, types: [...new Set(docs.map((d) => d.type))] }, "embedded + upserted documents");
    },
    { connection, concurrency: 4 },
  );

  worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "embed job failed"));
  logger.info({ queue: QUEUES.embed }, "Embed worker up");
  return worker;
}
