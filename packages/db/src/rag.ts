import { sql, and, eq, isNull } from "drizzle-orm";
import { db } from "./client.js";
import { documents } from "./schema.js";

/** The document `type` enum, surfaced so callers (rag builders) stay in sync. */
export type DocType =
  | "invoice_emitted"
  | "invoice_received"
  | "csf"
  | "invoice_preview"
  | "invoice_issued";

/** A normalized document ready to embed + persist. `embedding` is filled by the embed worker. */
export type DocInput = {
  type: DocType;
  /** Stable id for dedupe across sessions (invoice uuid, `csf:<rfc>`). */
  naturalKey: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
};

export type EmbeddedDoc = DocInput & { embedding: number[] };

/** pgvector literal: a number[] becomes the `[a,b,c]` text Postgres casts to `vector`. */
function vectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}

/**
 * Upsert embedded documents, keyed on (userId, naturalKey). Re-scraping the same
 * invoice updates the existing row (fresh body/metadata/vector + bumped updatedAt,
 * cleared deletedAt) instead of inserting a duplicate. PII stays scoped to userId.
 */
export async function upsertDocuments(
  userId: string,
  rfc: string,
  docs: EmbeddedDoc[],
  sourceEventId?: string,
): Promise<number> {
  if (docs.length === 0) return 0;
  await db()
    .insert(documents)
    .values(
      docs.map((d) => ({
        userId,
        rfc,
        type: d.type,
        naturalKey: d.naturalKey,
        title: d.title,
        body: d.body,
        metadata: d.metadata,
        embedding: d.embedding,
        sourceEventId: sourceEventId ?? null,
      })),
    )
    .onConflictDoUpdate({
      target: [documents.userId, documents.naturalKey],
      set: {
        body: sql`excluded.body`,
        title: sql`excluded.title`,
        metadata: sql`excluded.metadata`,
        embedding: sql`excluded.embedding`,
        updatedAt: sql`now()`,
        deletedAt: sql`null`,
      },
    });
  return docs.length;
}

export type SearchHit = {
  id: string;
  type: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  /** Cosine similarity in [0,1]; higher is closer. */
  score: number;
};

/**
 * Vector ANN over a single user's documents. ALWAYS scoped to userId and excludes
 * erased rows — there is no cross-tenant retrieval path. `types` narrows by doc kind.
 */
export async function searchDocuments(opts: {
  userId: string;
  queryEmbedding: number[];
  rfc?: string;
  types?: DocType[];
  limit?: number;
}): Promise<SearchHit[]> {
  const { userId, queryEmbedding, rfc, types, limit = 6 } = opts;
  const lit = vectorLiteral(queryEmbedding);
  // `<=>` is cosine distance (0 = identical); similarity = 1 - distance.
  const distance = sql<number>`${documents.embedding} <=> ${lit}::vector`;

  const where = [
    eq(documents.userId, userId),
    isNull(documents.deletedAt),
    sql`${documents.embedding} is not null`,
  ];
  if (rfc) where.push(eq(documents.rfc, rfc));
  if (types && types.length > 0) {
    where.push(sql`${documents.type} in ${sql`(${sql.join(types.map((t) => sql`${t}`), sql`, `)})`}`);
  }

  const rows = await db()
    .select({
      id: documents.id,
      type: documents.type,
      title: documents.title,
      body: documents.body,
      metadata: documents.metadata,
      createdAt: documents.createdAt,
      distance,
    })
    .from(documents)
    .where(and(...where))
    .orderBy(distance)
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body,
    metadata: r.metadata,
    createdAt: r.createdAt.toISOString(),
    score: Number((1 - Number(r.distance)).toFixed(4)),
  }));
}

/**
 * Right-to-erasure (LFPDPPP / GDPR): hard-delete every document for a user. Returns
 * the count removed. Hard delete (not soft) so the PII and its vector are gone.
 */
export async function purgeUserDocuments(userId: string): Promise<number> {
  const deleted = await db()
    .delete(documents)
    .where(eq(documents.userId, userId))
    .returning({ id: documents.id });
  return deleted.length;
}

let indexesEnsured = false;
/**
 * Idempotently create the pgvector ANN index. HNSW on cosine ops — the column type
 * is custom so drizzle-kit won't emit this; we ensure it once at worker startup.
 */
export async function ensureRagIndexes(): Promise<void> {
  if (indexesEnsured) return;
  await db().execute(
    sql`CREATE INDEX IF NOT EXISTS documents_embedding_hnsw_idx
        ON documents USING hnsw (embedding vector_cosine_ops)`,
  );
  indexesEnsured = true;
}
