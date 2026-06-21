import "../types.js";
import type { FastifyInstance } from "fastify";
import { topCounterparties, topQueries, fiscalProfile, ensureQueryLog } from "@sat/db";

/** Curated fallbacks shown to every user (especially new ones with no history). */
const DEFAULT_SUGGESTIONS = [
  "¿Cuánto facturé este mes?",
  "¿Quiénes son mis principales clientes?",
  "Descarga mi Constancia de Situación Fiscal",
  "¿Qué facturas me cancelaron?",
  "¿Cuánto IVA llevo este año?",
  "Muéstrame mis facturas recibidas recientes",
];

type Suggestion = { text: string; kind: "history" | "insight" | "default" };

export async function insightsRoutes(app: FastifyInstance) {
  // Idempotent — ensures query_log exists on DBs synced via push rather than migrate.
  await ensureQueryLog();

  /** KG-lite: top clients (you bill them) or suppliers (they bill you). */
  app.get("/me/counterparties", { onRequest: [app.authenticate] }, async (req, reply) => {
    const { userId, rfc } = req.user;
    if (!userId) return reply.code(401).send({ error: "unauthenticated" });
    const q = req.query as { direction?: string; limit?: string };
    const direction = q.direction === "suppliers" ? "suppliers" : "clients";
    const limit = q.limit ? Math.min(Math.max(Number(q.limit) || 5, 1), 10) : 5;
    const counterparties = await topCounterparties({ userId, rfc: rfc ?? undefined, direction, limit });
    return reply.send({ direction, counterparties });
  });

  /** The user's fiscal profile (régimen(es), CP, obligaciones) from the stored CSF. */
  app.get("/me/fiscal-profile", { onRequest: [app.authenticate] }, async (req, reply) => {
    const { userId, rfc } = req.user;
    if (!userId) return reply.code(401).send({ error: "unauthenticated" });
    const profile = await fiscalProfile(userId, rfc ?? undefined);
    return reply.send({ profile });
  });

  /**
   * Blended query suggestions for the dashboard: the user's recency-weighted
   * frequent queries first, then a KG-lite "insight" chip derived from their top
   * client, then curated defaults to fill — deduped, capped at 6.
   */
  app.get("/me/top-queries", { onRequest: [app.authenticate] }, async (req, reply) => {
    const { userId, rfc } = req.user;
    if (!userId) return reply.code(401).send({ error: "unauthenticated" });

    const [ranked, clients, profile] = await Promise.all([
      topQueries(userId, 6),
      topCounterparties({ userId, rfc: rfc ?? undefined, direction: "clients", limit: 1 }),
      fiscalProfile(userId, rfc ?? undefined),
    ]);

    const out: Suggestion[] = [];
    const seen = new Set<string>();
    const add = (text: string, kind: Suggestion["kind"]) => {
      const key = text.trim().toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push({ text, kind });
    };

    for (const r of ranked) add(r.text, "history");
    // KG-lite insight chips: top client + régimen fiscal (handles multiple régimenes).
    const top = clients[0];
    if (top) add(`¿Cuánto le he facturado a ${top.name ?? top.rfc}?`, "insight");
    if (profile?.regimenFiscal.length) {
      add(
        profile.regimenFiscal.length > 1
          ? "¿Cuáles son mis regímenes fiscales y su distribución?"
          : "¿Cuál es mi régimen fiscal?",
        "insight",
      );
    }
    for (const d of DEFAULT_SUGGESTIONS) add(d, "default");

    return reply.send({ suggestions: out.slice(0, 6) });
  });
}
