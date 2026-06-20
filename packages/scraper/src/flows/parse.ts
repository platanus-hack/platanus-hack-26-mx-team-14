import type { Invoice } from "@sat/events";
import type { Session } from "../types.js";

/**
 * Parses the SAT results grid into normalized Invoice[]. Instead of depending on
 * a fixed table/column layout (which the SAT changes), we scan EVERY table row
 * for one that contains a folio fiscal (UUID) and extract fields heuristically by
 * pattern. Robust to column reordering.
 */
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const RFC_RE = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i;
const MONEY_RE = /\d[\d,]*\.\d{2}/;
const DATE_RE = /(\d{4}-\d{2}-\d{2})|(\d{2}\/\d{2}\/\d{4})/;

// Collect cell texts of every row that looks like a CFDI (returns a JSON string).
const SCAN_EXPR = `(function () {
  var rows = [];
  var trs = document.querySelectorAll('table tr, .table tr, [role="row"]');
  for (var i = 0; i < trs.length; i++) {
    var tds = trs[i].querySelectorAll('td');
    if (!tds.length) continue;
    var cells = [];
    for (var j = 0; j < tds.length; j++) cells.push((tds[j].textContent || '').trim());
    rows.push(cells);
  }
  return JSON.stringify(rows);
})()`;

export async function parseInvoiceRows(
  session: Session,
  kind: "emitidas" | "recibidas",
  ownRfc: string,
): Promise<Invoice[]> {
  const json = await session.evaluate<string>(SCAN_EXPR).catch(() => "[]");
  let rows: string[][] = [];
  try {
    rows = JSON.parse(json) as string[][];
  } catch {
    rows = [];
  }
  return rows
    .map((cells) => toInvoice(cells, kind, ownRfc))
    .filter((x): x is Invoice => x !== null);
}

function toInvoice(cells: string[], kind: "emitidas" | "recibidas", ownRfc: string): Invoice | null {
  const uuid = cells.find((c) => UUID_RE.test(c))?.match(UUID_RE)?.[0];
  if (!uuid) return null;

  const own = ownRfc.toUpperCase();
  const rfcs = cells.map((c) => c.trim()).filter((c) => RFC_RE.test(c));
  const counterparty = rfcs.find((r) => r.toUpperCase() !== own) ?? rfcs[0] ?? "";

  const total = cells
    .filter((c) => MONEY_RE.test(c))
    .map(parseMoney)
    .sort((a, b) => b - a)[0] ?? 0;

  const fecha = cells.find((c) => DATE_RE.test(c)) ?? "";
  const estado = cells.some((c) => c.trim().toLowerCase() === "cancelado") ? "Cancelado" : "Vigente";

  const rfcEmisor = kind === "emitidas" ? ownRfc : counterparty;
  const rfcReceptor = kind === "emitidas" ? counterparty : ownRfc;

  return {
    uuid,
    rfcEmisor,
    rfcReceptor,
    fechaEmision: isoDate(fecha),
    subtotal: round2(total / 1.16),
    iva: round2(total - total / 1.16),
    total,
    estado,
    tipoComprobante: "I",
  };
}

function parseMoney(s: string): number {
  const m = s.match(MONEY_RE)?.[0] ?? "0";
  return Number(m.replace(/,/g, "")) || 0;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function isoDate(s: string): string {
  const m = s.match(DATE_RE)?.[0] ?? s;
  const dmy = m.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return m;
}
