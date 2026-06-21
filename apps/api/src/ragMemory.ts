import type { FastifyBaseLogger } from "fastify";
import { embedOne, documentsFromResult } from "@sat/rag";
import {
  searchDocuments,
  topCounterparties,
  fiscalProfile,
  logQuery,
  type DocType,
  type SearchHit,
  type FiscalProfile,
} from "@sat/db";
import type { SkillResult } from "@sat/events";
import { enqueueEmbed } from "./queue.js";

const KNOWN_TYPES: DocType[] = [
  "invoice_emitted",
  "invoice_received",
  "csf",
  "invoice_preview",
  "invoice_issued",
];

type Scope = { userId: string; rfc: string };

/**
 * Write path: fan a tool result into durable RAG memory. Fire-and-forget — never
 * awaited on the user-facing turn, never throws into the request. Ephemeral results
 * (previews, ticket OCR) produce zero docs and are skipped by the enqueue guard.
 */
export function persistToolResult(
  scope: Scope,
  result: SkillResult,
  log: FastifyBaseLogger,
): void {
  try {
    const docs = documentsFromResult(result, { rfc: scope.rfc });
    if (docs.length === 0) return;
    void enqueueEmbed({ userId: scope.userId, rfc: scope.rfc, docs });
    log.info({ skill: result.skill, docs: docs.length }, "queued docs for RAG memory");
  } catch (err) {
    log.warn({ err, skill: result.skill }, "persistToolResult failed (non-fatal)");
  }
}

/** Coerce the model-supplied `types` into the DocType allow-list. */
function normalizeTypes(input: unknown): DocType[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const types = input.filter((t): t is DocType => KNOWN_TYPES.includes(t as DocType));
  return types.length > 0 ? types : undefined;
}

export type SearchHistoryResult = {
  skill: "searchHistory";
  hits: Array<Pick<SearchHit, "type" | "title" | "metadata" | "createdAt" | "score">>;
};

/**
 * Read path for the `searchHistory` tool. Embeds the NL query and runs a pgvector
 * ANN over THIS user's documents only (strict tenant isolation, erased rows
 * excluded). Lets the agent answer from memory — citing prior sessions — instead of
 * re-scraping the SAT. Runs inline in the agent loop (not via the scrape queue).
 */
export async function runSearchHistory(
  scope: Scope,
  input: Record<string, unknown>,
  log: FastifyBaseLogger,
): Promise<SearchHistoryResult> {
  const query = typeof input.query === "string" ? input.query : "";
  if (!query.trim()) return { skill: "searchHistory", hits: [] };

  const limit = typeof input.limit === "number" ? Math.min(Math.max(input.limit, 1), 12) : 6;
  const t0 = Date.now();
  const queryEmbedding = await embedOne(query, "query");
  const hits = await searchDocuments({
    userId: scope.userId,
    rfc: scope.rfc || undefined,
    queryEmbedding,
    types: normalizeTypes(input.types),
    limit,
  });

  log.info(
    { query: query.slice(0, 80), hits: hits.length, topScore: hits[0]?.score ?? null, ms: Date.now() - t0 },
    "searchHistory served",
  );
  // Strip the verbose `body` from the tool result; metadata + title is enough to cite.
  return {
    skill: "searchHistory",
    hits: hits.map(({ type, title, metadata, createdAt, score }) => ({
      type,
      title,
      metadata,
      createdAt,
      score,
    })),
  };
}

export type CounterpartiesResult = {
  skill: "getTopCounterparties";
  direction: "clients" | "suppliers";
  counterparties: Array<{ rfc: string; name: string | null; invoiceCount: number; total: number }>;
};

/**
 * KG-lite read path for the `getTopCounterparties` tool — answers "¿quiénes son
 * mis principales clientes/proveedores?" from SQL aggregations over the user's
 * stored invoices. Inline (no SAT, no queue), strictly scoped to the user.
 */
export async function runTopCounterparties(
  scope: Scope,
  input: Record<string, unknown>,
  log: FastifyBaseLogger,
): Promise<CounterpartiesResult> {
  const direction = input.direction === "suppliers" ? "suppliers" : "clients";
  const limit = typeof input.limit === "number" ? Math.min(Math.max(input.limit, 1), 10) : 5;
  const counterparties = await topCounterparties({
    userId: scope.userId,
    rfc: scope.rfc || undefined,
    direction,
    limit,
  });
  log.info({ direction, results: counterparties.length }, "getTopCounterparties served");
  return { skill: "getTopCounterparties", direction, counterparties };
}

export type FiscalProfileResult = {
  skill: "getFiscalProfile";
  profile: FiscalProfile | null;
};

/**
 * KG-lite read path for the `getFiscalProfile` tool — returns the user's régimen,
 * domicilio and obligaciones from the CSF already in memory (no SAT re-download).
 */
export async function runFiscalProfile(
  scope: Scope,
  log: FastifyBaseLogger,
): Promise<FiscalProfileResult> {
  const profile = await fiscalProfile(scope.userId, scope.rfc || undefined);
  log.info(
    { found: !!profile, regimenes: profile?.regimenFiscal.length ?? 0 },
    "getFiscalProfile served",
  );
  return { skill: "getFiscalProfile", profile };
}

/** Extract plain text from the last user message in a transcript (for query logging). */
export function lastUserText(messages: Array<{ role: string; content: unknown }>): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== "user") continue;
    if (typeof m.content === "string") return m.content;
    if (Array.isArray(m.content)) {
      const text = m.content
        .filter((b): b is { type: "text"; text: string } => (b as { type?: string }).type === "text")
        .map((b) => b.text)
        .join(" ")
        .trim();
      if (text) return text;
    }
    return "";
  }
  return "";
}

/** Record the user's NL query for the top-queries suggestions. Fire-and-forget. */
export function logUserQuery(scope: Scope, text: string, log: FastifyBaseLogger): void {
  if (!text.trim()) return;
  void logQuery(scope.userId, scope.rfc || null, text).catch((err) =>
    log.warn({ err }, "logUserQuery failed (non-fatal)"),
  );
}
