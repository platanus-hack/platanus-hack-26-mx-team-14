import type Anthropic from "@anthropic-ai/sdk";

export const tools: Anthropic.Tool[] = [
  {
    name: "getEmitedInvoices",
    description:
      "Fetch the user's ISSUED invoices (CFDIs emitidas) from the SAT for a date " +
      "range. Use when the user asks about invoices they sent/issued. Max range 12 months.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Start date YYYY-MM-DD" },
        to: { type: "string", description: "End date YYYY-MM-DD, ≤12 months after from" },
        rfcReceptor: { type: "string" },
        estado: { type: "string", enum: ["Vigente", "Cancelado"] },
        tipoComprobante: { type: "string", enum: ["I", "E", "P", "N", "T"] },
      },
      required: ["from", "to"],
      additionalProperties: false,
    },
  },
  {
    name: "getReceiptInvoices",
    description:
      "Fetch the user's RECEIVED invoices (CFDIs recibidas) for a date range. Use " +
      "when the user asks about invoices issued TO them. Max range 12 months.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string" },
        to: { type: "string" },
        rfcEmisor: { type: "string" },
        estado: { type: "string", enum: ["Vigente", "Cancelado"] },
      },
      required: ["from", "to"],
      additionalProperties: false,
    },
  },
  {
    name: "generateCSF",
    description:
      "Download the user's Constancia de Situación Fiscal (CSF) and extract its " +
      "fields (régimen, domicilio, obligaciones, distribución de régimen en caso de tener varios). Use to learn the user's fiscal profile. In general we want to give useful information to the user about their fiscal situation",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "generateInvoice",
    description:
      "Issue a CFDI (factura). REAL side effects. You MUST present the vista previa " +
      "and get explicit user confirmation before emitting; never set confirmed=true yourself.",
    input_schema: {
      type: "object",
      properties: {
        receptor: {
          type: "object",
          properties: {
            rfc: { type: "string" },
            nombreRazonSocial: { type: "string" },
            codigoPostal: { type: "string" },
            regimenFiscalReceptor: { type: "string" },
            usoCFDI: { type: "string" },
          },
          required: ["rfc", "nombreRazonSocial", "codigoPostal", "regimenFiscalReceptor", "usoCFDI"],
          additionalProperties: false,
        },
        conceptos: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              claveProdServ: { type: "string" },
              descripcion: { type: "string" },
              claveUnidad: { type: "string" },
              cantidad: { type: "number" },
              valorUnitario: { type: "number" },
              descuento: { type: "number" },
              objetoImpuesto: { type: "string" },
            },
            required: ["descripcion", "cantidad", "valorUnitario"],
            additionalProperties: false,
          },
        },
        moneda: { type: "string" },
        tipoCambio: { type: "number" },
        confirmed: {
          type: "boolean",
          description: "Only true AFTER the user saw the vista previa and explicitly agreed.",
        },
      },
      required: ["receptor", "conceptos", "confirmed"],
      additionalProperties: false,
    },
  },
];

export const SYSTEM_PROMPT = `Eres el asistente fiscal de Brisk Camel. Actúas SOLO a través de tus herramientas contra el SAT real del usuario; nunca inventes datos fiscales.

Reglas:
- Para facturas, usa el rango de fechas más pequeño que implique el usuario; nunca excedas 12 meses por consulta.
- Moneda por defecto MXN; pide tipoCambio solo si la moneda no es MXN.
- generateInvoice tiene efectos reales: primero genera la vista previa (confirmed=false), resume receptor/conceptos/subtotal/IVA/total y pide una confirmación explícita ("sí, emítela"). Solo entonces vuelve a llamar con confirmed=true. NUNCA te autoconfirmes.
- Si una herramienta falla, reporta el motivo y ofrece reintentar; no fabriques resultados.
- Cuando conozcas el régimen del usuario (por una CSF previa), adapta el lenguaje y muestra solo lo relevante.
- Responde en español, claro y conciso, listo para ser hablado en voz alta.`;
