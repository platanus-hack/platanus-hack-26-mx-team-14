import type { FastifyBaseLogger } from "fastify";
import { and, eq, desc, isNull, inArray, sql } from "drizzle-orm";
import { db, documents, topCounterparties, type DocType } from "@sat/db";
import {
  mockSkillResult,
  type SkillResult,
  type Invoice,
  type CSF,
} from "@sat/events";
import { parseDateRange, rangeInput, type DateRange } from "./dateRange.js";

/**
 * Fast-path resolver: answers very common questions DIRECTLY from the DB (the RAG
 * memory we already populate) WITHOUT running the full Claude agent loop. Only
 * fires on clearly-scoped common intents; anything nuanced falls through (returns
 * null) so the real agent — which can reason and scrape the SAT — handles it.
 *
 * Demo fixtures (@sat/events) are the fallback ONLY when the DB has no data for a
 * matched intent, so a fresh demo account still shows something. Disable with
 * DEMO_FIXTURES=false (real DB data is always preferred over fixtures).
 */
const FIXTURES_ENABLED = process.env.DEMO_FIXTURES !== "false";

type Scope = { userId: string; rfc: string };
type Intent = "emitted" | "received" | "csf" | "clients" | "suppliers";

export type FastPathResult = { reply: string; skillResult: SkillResult | null; source: "db" | "fixture" };

const strip = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

const money = (n: number) =>
  `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Coarse intent match on the normalized text. Conservative on purpose: long or
 * specific asks (dates, "a ACME en marzo") should fall through to the agent, so
 * we bail on anything beyond a short, broad question.
 */
function detectIntent(raw: string): Intent | null {
  const t = strip(raw);
  if (!t) return null;
  // Too long → likely nuanced; let the agent handle it.
  if (t.split(/\s+/).length > 14) return null;

  // CSF check runs FIRST — "genera mi csf" / "genera la constancia" must not be
  // blocked by the invoice-creation guard below (which also catches "genera").
  if (/\b(regimen|constancia|csf|obligaci|domicilio fiscal|situacion fiscal|cp fiscal)\b/.test(t))
    return "csf";

  // NEVER short-circuit invoice CREATION — generateInvoice has real side effects
  // and a confirmation flow. Defer anything that looks like "make/issue an invoice".
  if (/\b(facturar|facturame|emite|emiteme|emitir|genera|generar|crea|crear|haz|hazme|nueva\s+factura)\b/.test(t))
    return null;
  if (/\bfactura\s+a\s+\w/.test(t)) return null;
  if (/\bproveedor/.test(t) || /quien(es)?\s+me\s+(factura|vende)/.test(t)) return "suppliers";
  if (/\bclientes?\b/.test(t) || /a\s+quien(es)?\s+(le\s+)?(mas\s+)?factur/.test(t)) return "clients";
  if (/recibidas?|me\s+factur|gastos?|deducib|compras?/.test(t)) return "received";
  if (/emitidas?|emiti|facture|cuanto.*(factur|vend|ingres)|ingresos?|mis\s+ventas|\bfacturas?\b|\bcfdi\b/.test(t))
    return "emitted";
  return null;
}

/** Read stored invoices of a kind as Invoice[] (metadata is the Invoice shape). */
export async function invoicesFromDb(
  userId: string,
  rfc: string,
  kind: "emitted" | "received",
  range?: DateRange | null,
): Promise<Invoice[]> {
  const types: DocType[] =
    kind === "emitted" ? ["invoice_emitted", "invoice_issued"] : ["invoice_received"];
  const where = [
    eq(documents.userId, userId),
    isNull(documents.deletedAt),
    inArray(documents.type, types),
  ];
  if (rfc) where.push(eq(documents.rfc, rfc));
  // Date filter: compare on the YYYY-MM-DD prefix so date-only and ISO-timestamp
  // fechaEmision both work. Strings compare lexicographically.
  if (range) {
    where.push(sql`substring((metadata->>'fechaEmision') from 1 for 10) >= ${range.from}`);
    where.push(sql`substring((metadata->>'fechaEmision') from 1 for 10) <= ${range.to}`);
  }
  const rows = await db()
    .select({ metadata: documents.metadata })
    .from(documents)
    .where(and(...where))
    .orderBy(desc(sql`(metadata->>'fechaEmision')`))
    .limit(60);
  return rows.map((r) => r.metadata as unknown as Invoice);
}

/** Latest stored CSF as a CSF object, or null. */
export async function csfFromDb(userId: string, rfc: string): Promise<CSF | null> {
  const where = [eq(documents.userId, userId), eq(documents.type, "csf"), isNull(documents.deletedAt)];
  if (rfc) where.push(eq(documents.rfc, rfc));
  const rows = await db()
    .select({ metadata: documents.metadata })
    .from(documents)
    .where(and(...where))
    .orderBy(desc(documents.updatedAt))
    .limit(1);
  return rows[0] ? (rows[0].metadata as unknown as CSF) : null;
}

function invoiceReply(invoices: Invoice[], kind: "emitted" | "received"): string {
  const vigentes = invoices.filter((i) => i.estado === "Vigente");
  const total = vigentes.reduce((s, i) => s + (i.total ?? 0), 0);
  const noun = kind === "emitted" ? "emitidas" : "recibidas";
  if (invoices.length === 0) return `No encontré facturas ${noun} en tu memoria.`;
  return (
    `Tienes ${invoices.length} facturas ${noun} (${vigentes.length} vigentes) por un total de ` +
    `${money(total)} MXN. Aquí está el detalle.`
  );
}

function regimenLabel(csf: CSF): string {
  return csf.regimenFiscal
    .map((r) =>
      typeof r === "string"
        ? r
        : r.porcentaje != null
          ? `${r.nombre} (${r.porcentaje}%)`
          : r.nombre,
    )
    .join(", ");
}

/**
 * Returns a ready answer for a common intent, or null to defer to the full agent.
 * DB first; fixtures only fill gaps when enabled.
 */
export async function resolveFastPath(
  scope: Scope,
  text: string,
  log: FastifyBaseLogger,
): Promise<FastPathResult | null> {
  const intent = detectIntent(text);
  if (!intent) return null;
  const { userId, rfc } = scope;
  if (!userId) return null;

  const done = (r: FastPathResult): FastPathResult => {
    log.info(
      { intent, source: r.source, skill: r.skillResult?.skill ?? null },
      "fast-path resolved (skipped agent loop)",
    );
    return r;
  };

  if (intent === "emitted" || intent === "received") {
    // Honor a date phrase ("este mes", "marzo", …) on BOTH the real DB and the
    // demo fixtures, so "facturas de este mes" returns only that month.
    const range = parseDateRange(text);
    const skill = intent === "emitted" ? "getEmitedInvoices" : "getReceiptInvoices";
    const invoices = await invoicesFromDb(userId, rfc, intent, range);
    if (invoices.length > 0) {
      return done({ reply: invoiceReply(invoices, intent), skillResult: { skill, invoices }, source: "db" });
    }
    if (!FIXTURES_ENABLED) return null;
    const fx = mockSkillResult(skill, rangeInput(range));
    const fxInvoices = "invoices" in fx ? fx.invoices : [];
    return done({ reply: invoiceReply(fxInvoices, intent), skillResult: fx, source: "fixture" });
  }

  if (intent === "csf") {
    let csf = await csfFromDb(userId, rfc);
    let source: FastPathResult["source"] = "db";
    if (!csf) {
      if (!FIXTURES_ENABLED) return null;
      csf = csfFromFixture();
      source = "fixture";
    }
    const cp = csf.domicilioFiscal?.codigoPostal;
    const reply =
      `Tu régimen fiscal: ${regimenLabel(csf)}.` +
      (cp ? ` Domicilio fiscal CP ${cp}.` : "") +
      ` Tienes ${csf.obligaciones?.length ?? 0} obligaciones registradas.`;
    return done({ reply, skillResult: { skill: "generateCSF", csf }, source });
  }

  // clients / suppliers — KG-lite aggregation. No card; the value is the text.
  const direction = intent === "clients" ? "clients" : "suppliers";
  const cps = await topCounterparties({ userId, rfc: rfc || undefined, direction, limit: 5 });
  if (cps.length === 0) return null; // nothing aggregated → let the agent try the SAT
  const noun = intent === "clients" ? "clientes" : "proveedores";
  const list = cps.map((c) => `${c.name ?? c.rfc} (${money(c.total)})`).join(", ");
  return done({ reply: `Tus principales ${noun} por monto son: ${list}.`, skillResult: null, source: "db" });
}

// csfFixture lives in @sat/events via mockSkillResult("generateCSF").
function csfFromFixture(): CSF {
  const r = mockSkillResult("generateCSF");
  return "csf" in r ? r.csf : (r as unknown as { csf: CSF }).csf;
}
