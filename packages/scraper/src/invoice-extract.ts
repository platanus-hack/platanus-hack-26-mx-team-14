import Anthropic from "@anthropic-ai/sdk";
import { env, childLogger } from "@sat/shared";
import type { InvoiceAnalysis } from "@sat/events";

/** JSON schema Claude fills from the vista-previa PDF (structured outputs). */
const INVOICE_SCHEMA = {
  type: "object",
  properties: {
    emisor: {
      type: "object",
      properties: { rfc: { type: "string" }, nombre: { type: "string" } },
      additionalProperties: false,
    },
    receptor: {
      type: "object",
      properties: {
        rfc: { type: "string" },
        nombre: { type: "string" },
        usoCFDI: { type: "string", description: "Uso CFDI (clave o descripción)" },
      },
      additionalProperties: false,
    },
    efectoComprobante: { type: "string", description: "Ingreso, Egreso, Pago, etc." },
    formaPago: { type: "string" },
    metodoPago: { type: "string" },
    moneda: { type: "string" },
    folioFiscal: { type: "string", description: "UUID del folio fiscal si está timbrado" },
    fechaEmision: { type: "string" },
    selloDigitalPresente: {
      type: "boolean",
      description: "true solo si hay sellos digitales reales (no placeholders 'XXXX'/ceros)",
    },
    insight: {
      type: "string",
      description:
        "Resumen breve en español: a quién va dirigida, qué ampara, y si es una vista " +
        "previa sin validez o un CFDI ya timbrado.",
    },
  },
  required: ["insight"],
  additionalProperties: false,
} as const;

/**
 * Reads the invoice "vista previa" PDF with Claude (document input + structured
 * output) for an at-a-glance analysis. Best-effort: returns `null` on any failure so
 * the preview is still returned to the user. Mirrors {@link extractCSFFromPdf}.
 */
export async function extractInvoiceFromPdf(
  pdf: Buffer,
  correlationId: string,
): Promise<InvoiceAnalysis | null> {
  const log = childLogger({ correlationId, op: "invoice.extract" });
  if (!env.ANTHROPIC_API_KEY) {
    log.warn("ANTHROPIC_API_KEY not set — skipping invoice analysis");
    return null;
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 5 });
  try {
    const res = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      output_config: { format: { type: "json_schema", schema: INVOICE_SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: pdf.toString("base64") },
            },
            {
              type: "text",
              text:
                "Analiza esta representación de un CFDI (factura) del SAT. Extrae emisor, " +
                "receptor (con su Uso CFDI), efecto del comprobante, forma y método de pago, " +
                "moneda, y los datos de timbrado (folio fiscal, fecha, si hay sello digital " +
                "real o son placeholders). Además, en 'insight' da un resumen útil en español: " +
                "a quién va dirigida, qué ampara y si es una vista previa sin validez o ya está " +
                "timbrada. Usa únicamente datos presentes en el documento.",
            },
          ],
        },
      ],
    });

    const block = res.content.find((b) => b.type === "text");
    const raw = block && "text" in block ? block.text : "{}";
    const parsed = JSON.parse(raw) as InvoiceAnalysis;
    log.info({ receptor: parsed.receptor?.rfc, timbrada: parsed.selloDigitalPresente }, "invoice analyzed");
    return parsed;
  } catch (err) {
    log.warn({ err: (err as Error).message }, "invoice analysis failed — returning preview only");
    return null;
  }
}
