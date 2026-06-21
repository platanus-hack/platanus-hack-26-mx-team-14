import { sql } from "drizzle-orm";
import { db } from "./client.js";
import { queryLog } from "./schema.js";

/**
 * KG-lite: a counterparty is an RFC the user transacts with. We derive the graph
 * with plain SQL aggregations over `documents.metadata` (which holds the normalized
 * Invoice objects) — no separate graph store needed. "clients" = who the user issues
 * invoices to (emitted/issued, grouped by rfcReceptor); "suppliers" = who issues to
 * the user (received, grouped by rfcEmisor). Strictly scoped to one user.
 */
export type Counterparty = {
  rfc: string;
  name: string | null;
  invoiceCount: number;
  total: number;
};

export async function topCounterparties(opts: {
  userId: string;
  rfc?: string;
  direction: "clients" | "suppliers";
  limit?: number;
}): Promise<Counterparty[]> {
  const { userId, rfc, direction, limit = 5 } = opts;
  const isClients = direction === "clients";
  // emitted/issued → group by receptor; received → group by emisor. These keys are
  // from a fixed allowlist (not user input), so inlining them as raw SQL is safe —
  // and required so the SELECT and GROUP BY expressions are byte-identical (a bound
  // param produces different placeholders in each clause and Postgres rejects it).
  const rfcExpr = sql.raw(`metadata->>'${isClients ? "rfcReceptor" : "rfcEmisor"}'`);
  const nameExpr = sql.raw(`metadata->>'${isClients ? "nombreReceptor" : "nombreEmisor"}'`);
  const types = isClients
    ? sql`('invoice_emitted','invoice_issued')`
    : sql`('invoice_received')`;

  const rows = await db().execute<{
    rfc: string;
    name: string | null;
    invoice_count: number;
    total: number;
  }>(sql`
    select
      ${rfcExpr} as rfc,
      max(${nameExpr}) as name,
      count(*)::int as invoice_count,
      coalesce(sum((metadata->>'total')::numeric), 0)::float8 as total
    from documents
    where user_id = ${userId}
      ${rfc ? sql`and rfc = ${rfc}` : sql``}
      and type in ${types}
      and deleted_at is null
      and ${rfcExpr} is not null
    group by ${rfcExpr}
    order by total desc
    limit ${limit}
  `);

  return (rows as unknown as {
    rfc: string;
    name: string | null;
    invoice_count: number;
    total: number;
  }[]).map((r) => ({
    rfc: r.rfc,
    name: r.name,
    invoiceCount: Number(r.invoice_count),
    total: Number(r.total),
  }));
}

/** Record an NL query (fire-and-forget; never blocks a turn). */
export async function logQuery(
  userId: string,
  rfc: string | null,
  text: string,
  intent?: string,
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  await db().insert(queryLog).values({ userId, rfc, text: trimmed.slice(0, 500), intent: intent ?? null });
}

export type RankedQuery = { text: string; uses: number; score: number };

/**
 * The user's most-used queries, recency-weighted (≈7-day half-life) so recent
 * habits outrank stale ones. Grouped case-insensitively; scoped to the user.
 */
export async function topQueries(userId: string, limit = 6): Promise<RankedQuery[]> {
  const rows = await db().execute<{ display: string; uses: number; score: number }>(sql`
    select
      max(text) as display,
      count(*)::int as uses,
      sum(exp(-extract(epoch from (now() - created_at)) / ${7 * 86400}))::float8 as score
    from query_log
    where user_id = ${userId}
    group by lower(btrim(text))
    order by score desc
    limit ${limit}
  `);
  return (rows as unknown as { display: string; uses: number; score: number }[]).map((r) => ({
    text: r.display,
    uses: Number(r.uses),
    score: Number(r.score),
  }));
}

/** Idempotently create the query_log table (covers DBs synced via push, not migrate). */
export async function ensureQueryLog(): Promise<void> {
  await db().execute(sql`
    create table if not exists query_log (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null,
      rfc text,
      text text not null,
      intent text,
      created_at timestamptz not null default now()
    )`);
  await db().execute(
    sql`create index if not exists query_log_user_idx on query_log (user_id, created_at)`,
  );
}
