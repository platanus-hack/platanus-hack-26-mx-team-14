import type { SkillResult } from "@sat/events";
import type { DocInput } from "@sat/db";
import { invoiceToText, csfToText } from "./retrieval.js";

/**
 * Turns a tool/skill result into the normalized, embedding-friendly documents we
 * persist for RAG. This is the write-path bridge: the agent calls a SAT skill, and
 * whatever comes back becomes durable, searchable memory keyed by a stable
 * naturalKey (so the same invoice across sessions dedupes instead of piling up).
 *
 * Ephemeral results (vista-previa, ticket OCR) are intentionally NOT persisted —
 * they aren't fiscal records and would only add retrieval noise.
 */
export function documentsFromResult(
  result: SkillResult,
  ctx: { rfc: string },
): DocInput[] {
  switch (result.skill) {
    case "getEmitedInvoices":
      return result.invoices.map((inv) => ({
        type: "invoice_emitted" as const,
        naturalKey: inv.uuid,
        title: `Factura emitida ${inv.uuid}`,
        body: invoiceToText(inv, "emitida"),
        metadata: inv as unknown as Record<string, unknown>,
      }));

    case "getReceiptInvoices":
      return result.invoices.map((inv) => ({
        type: "invoice_received" as const,
        naturalKey: inv.uuid,
        title: `Factura recibida ${inv.uuid}`,
        body: invoiceToText(inv, "recibida"),
        metadata: inv as unknown as Record<string, unknown>,
      }));

    case "generateCSF":
      return [
        {
          type: "csf" as const,
          // One CSF per RFC — re-downloading refreshes the same row.
          naturalKey: `csf:${result.csf.rfc}`,
          title: `Constancia de Situación Fiscal ${result.csf.rfc}`,
          body: csfToText(result.csf),
          metadata: result.csf as unknown as Record<string, unknown>,
        },
      ];

    case "generateInvoice":
      // Only the *issued* outcome is a real fiscal record; previews are ephemeral.
      if (result.status === "issued") {
        return [
          {
            type: "invoice_issued" as const,
            naturalKey: result.issued.uuid,
            title: `Factura emitida ${result.issued.uuid}`,
            body: `Factura emitida por ${ctx.rfc}, folio fiscal ${result.issued.uuid}.`,
            metadata: result.issued as unknown as Record<string, unknown>,
          },
        ];
      }
      return [];

    default:
      // extractTicket and any future ephemeral skills: nothing to persist.
      return [];
  }
}
