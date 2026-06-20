import type { Invoice } from "@sat/events";
import type { Session } from "../types.js";
import { SEL } from "../sat.js";

/**
 * Parses the SAT results table into normalized Invoice[]. The portal renders an
 * ASP.NET grid; column order is stable but selectors must be verified live.
 * TODO(Phase 1): confirm column indices against the real grid.
 */
export async function parseInvoiceRows(
  session: Session,
  _kind: "emitidas" | "recibidas",
): Promise<Invoice[]> {
  // Extract rows in the page context to avoid N round-trips on Firecrawl.
  const rows = await session.evaluate<RawRow[]>(
    `Array.from(document.querySelectorAll(${JSON.stringify(SEL.consulta.resultsRow)}))
       .map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.textContent?.trim() ?? ''))
       .filter(cells => cells.length > 5)`,
  );

  return rows.map(toInvoice).filter((x): x is Invoice => x !== null);
}

type RawRow = string[];

function toInvoice(cells: RawRow): Invoice | null {
  // Expected (verify): [uuid, rfcEmisor, nombreEmisor, rfcReceptor, nombreReceptor,
  //                     fechaEmision, fechaCert, pac, total, estado, ...]
  const [uuid, rfcEmisor, nombreEmisor, rfcReceptor, nombreReceptor, fecha, , , totalRaw, estadoRaw] =
    cells;
  if (!uuid || !rfcEmisor) return null;
  const total = money(totalRaw);
  const estado = (estadoRaw ?? "").toLowerCase().includes("cancel") ? "Cancelado" : "Vigente";
  return {
    uuid,
    rfcEmisor,
    rfcReceptor: rfcReceptor ?? "",
    nombreEmisor,
    nombreReceptor,
    fechaEmision: isoDate(fecha ?? ""),
    subtotal: round2(total / 1.16),
    iva: round2(total - total / 1.16),
    total,
    estado,
    tipoComprobante: "I",
  };
}

function money(s?: string): number {
  return Number((s ?? "0").replace(/[^0-9.-]/g, "")) || 0;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function isoDate(s: string): string {
  const d = new Date(s.replace(" ", "T"));
  return isNaN(d.getTime()) ? s : d.toISOString();
}
