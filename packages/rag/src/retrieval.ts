import type { Invoice, CSF } from "@sat/events";

/**
 * Builds the embedding-friendly text for a document. Compact, normalized — this
 * is what we embed and what the RAG client retrieves and cites.
 */
export function invoiceToText(inv: Invoice, kind: "emitida" | "recibida"): string {
  return (
    `Factura ${kind} UUID ${inv.uuid} entre emisor ${inv.rfcEmisor} y receptor ` +
    `${inv.rfcReceptor} por ${inv.total} MXN (IVA ${inv.iva ?? 0}) el ${inv.fechaEmision}. ` +
    `Tipo ${inv.tipoComprobante}, estado ${inv.estado}.`
  );
}

export function csfToText(csf: CSF): string {
  const obl = csf.obligaciones
    .map((o) => `${o.descripcion}${o.vencimiento ? ` (vence ${o.vencimiento})` : ""}`)
    .join("; ");
  return (
    `Constancia de Situación Fiscal de ${csf.nombre} (${csf.rfc}). ` +
    `Régimen(es): ${csf.regimenFiscal.map((r) => (r.porcentaje != null ? `${r.nombre} (${r.porcentaje}%)` : r.nombre)).join(", ")}. ` +
    `Domicilio CP ${csf.domicilioFiscal.codigoPostal}. Obligaciones: ${obl || "—"}.`
  );
}

/** Cosine similarity for in-memory ranking / tests (DB uses pgvector ANN). */
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}
