/**
 * Backfill embeddings for documents that have none (e.g. seeded rows, or anything
 * inserted before the RAG write path existed). Idempotent: only touches rows where
 * embedding IS NULL. Also derives a naturalKey from metadata where possible so older
 * rows participate in dedupe. Run: `pnpm --filter @sat/worker rag:backfill`.
 */
import { sql, isNull, eq } from "drizzle-orm";
import { db, documents, ensureRagIndexes } from "@sat/db";
import { embed } from "@sat/rag";
import { logger } from "@sat/shared";

const BATCH = 64;

function deriveNaturalKey(type: string, metadata: Record<string, unknown>): string | null {
  if (type === "csf") {
    const rfc = metadata.rfc;
    return typeof rfc === "string" ? `csf:${rfc}` : null;
  }
  const uuid = metadata.uuid;
  return typeof uuid === "string" ? uuid : null;
}

async function main() {
  await ensureRagIndexes();

  const rows = await db()
    .select({
      id: documents.id,
      type: documents.type,
      body: documents.body,
      metadata: documents.metadata,
      naturalKey: documents.naturalKey,
    })
    .from(documents)
    .where(isNull(documents.embedding));

  if (rows.length === 0) {
    logger.info("backfill: nothing to do — all documents already embedded");
    process.exit(0);
  }
  logger.info({ pending: rows.length }, "backfill: embedding documents");

  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const vectors = await embed(batch.map((r) => r.body), "document");
    for (let j = 0; j < batch.length; j++) {
      const r = batch[j]!;
      const naturalKey = r.naturalKey ?? deriveNaturalKey(r.type, r.metadata);
      await db()
        .update(documents)
        .set({
          embedding: vectors[j]!,
          naturalKey,
          updatedAt: sql`now()`,
        })
        .where(eq(documents.id, r.id));
    }
    done += batch.length;
    logger.info({ done, total: rows.length }, "backfill progress");
  }

  logger.info({ embedded: done }, "backfill complete");
  process.exit(0);
}

main().catch((err) => {
  logger.error({ err }, "backfill failed");
  process.exit(1);
});
