import Anthropic from "@anthropic-ai/sdk";
import { env, childLogger } from "@sat/shared";
import type { TicketExtraction } from "@sat/events";

const TICKET_SCHEMA = {
  type: "object",
  properties: {
    tipoDocumento: {
      type: "string",
      enum: ["ticket", "factura", "nota_venta", "recibo", "otro"],
      description: "Tipo de documento fiscal",
    },
    emisor: {
      type: "object",
      properties: {
        nombre: { type: "string", description: "Nombre del comercio/emisor" },
        rfc: { type: "string", description: "RFC si aparece en el documento" },
      },
      additionalProperties: false,
    },
    fecha: { type: "string", description: "Fecha del documento en formato YYYY-MM-DD" },
    conceptos: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        properties: {
          descripcion: { type: "string", description: "Descripción del producto o servicio" },
          cantidad: { type: "number", description: "Cantidad (default 1 si no se especifica)" },
          valorUnitario: { type: "number", description: "Precio unitario" },
          descuento: { type: "number", description: "Descuento aplicado (default 0)" },
        },
        required: ["descripcion", "valorUnitario"],
        additionalProperties: false,
      },
    },
    subtotal: { type: "number", description: "Subtotal antes de impuestos" },
    iva: { type: "number", description: "IVA cobrado si está desglosado" },
    total: { type: "number", description: "Total a pagar" },
    moneda: { type: "string", description: "Moneda (default MXN)" },
    observaciones: {
      type: "string",
      description: "Notas adicionales: método de pago, número de autorización, etc.",
    },
  },
  required: ["tipoDocumento", "conceptos", "total"],
  additionalProperties: false,
} as const;

const EMPTY: TicketExtraction = {
  tipoDocumento: "otro",
  conceptos: [],
  total: 0,
  moneda: "MXN",
};

/**
 * Extracts structured data from a ticket/receipt image using Claude vision.
 * Best-effort: returns empty extraction on any failure so the agent can still respond.
 */
export async function extractTicket(
  imageBase64: string,
  imageMediaType: string,
  correlationId: string,
): Promise<TicketExtraction> {
  const log = childLogger({ correlationId, op: "ticket.extract" });

  if (!env.ANTHROPIC_API_KEY) {
    log.warn("ANTHROPIC_API_KEY not set — skipping ticket extraction");
    return EMPTY;
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 5 });

  try {
    const res = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      output_config: { format: { type: "json_schema", schema: TICKET_SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: imageMediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                data: imageBase64,
              },
            },
            {
              type: "text",
              text:
                "Analiza esta imagen de un ticket, recibo, factura o nota de venta. " +
                "Extrae: tipo de documento, emisor (nombre y RFC si aparece), fecha, " +
                "todos los conceptos (descripción, cantidad, precio unitario, descuento), " +
                "subtotal, IVA si está presente, total y moneda. Si hay observaciones " +
                "relevantes (método de pago, número de autorización, notas), inclúyelas. " +
                "Devuelve únicamente datos visibles en la imagen. " +
                "Si un campo no es visible o no aplica, omítelo (excepto tipoDocumento, conceptos y total).",
            },
          ],
        },
      ],
    });

    const block = res.content.find((b) => b.type === "text");
    const raw = block && "text" in block ? block.text : "{}";
    log.info({ rawResponseLength: raw.length, stopReason: res.stop_reason }, "claude response received");
    const parsed = JSON.parse(raw) as TicketExtraction;

    // Validate extraction is useful (not empty conceptos or zero total)
    if (parsed.conceptos.length === 0 || parsed.total === 0) {
      log.warn(
        { tipo: parsed.tipoDocumento, total: parsed.total, items: parsed.conceptos.length },
        "extraction returned empty/zero data — will fall back to agent vision",
      );
    } else {
      log.info(
        { tipo: parsed.tipoDocumento, total: parsed.total, items: parsed.conceptos.length },
        "ticket extracted",
      );
    }
    return parsed;
  } catch (err) {
    log.warn({ err: (err as Error).message, stack: (err as Error).stack }, "ticket extraction failed — returning empty");
    return EMPTY;
  }
}
