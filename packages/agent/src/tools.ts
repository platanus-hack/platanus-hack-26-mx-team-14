import type Anthropic from "@anthropic-ai/sdk";

export const tools: Anthropic.Tool[] = [
  {
    name: "searchHistory",
    description:
      "Busca en la MEMORIA del usuario (facturas, CSF y documentos de sesiones " +
      "anteriores ya consultados) por similitud semántica. Úsalo SIEMPRE primero, " +
      "antes de consultar el SAT, cuando la pregunta pueda responderse con datos ya " +
      "vistos (ej. '¿cuánto le facturé a X?', '¿cuál fue mi última factura?', '¿qué " +
      "régimen tengo?'). Es instantáneo y no inicia sesión en el SAT. Si no hay " +
      "resultados relevantes, recurre a las herramientas del SAT.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Consulta en lenguaje natural" },
        types: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "invoice_emitted",
              "invoice_received",
              "csf",
              "invoice_issued",
              "invoice_preview",
            ],
          },
          description: "Filtra por tipo de documento (opcional)",
        },
        limit: { type: "number", description: "Máximo de resultados (1-12, default 6)" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "getTopCounterparties",
    description:
      "Devuelve los principales CLIENTES (a quienes el usuario factura) o PROVEEDORES " +
      "(quienes le facturan), ordenados por monto total, a partir de las facturas ya " +
      "guardadas en memoria. Úsalo para '¿quiénes son mis principales clientes?', " +
      "'¿a quién le facturo más?', '¿quiénes son mis proveedores?'. Instantáneo, sin SAT.",
    input_schema: {
      type: "object",
      properties: {
        direction: {
          type: "string",
          enum: ["clients", "suppliers"],
          description: "clients = a quienes factura; suppliers = quienes le facturan",
        },
        limit: { type: "number", description: "Máximo de contrapartes (1-10, default 5)" },
      },
      required: ["direction"],
      additionalProperties: false,
    },
  },
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
  {
    name: "extractTicketData",
    description:
      "Extrae datos estructurados de una imagen de ticket, recibo o nota de venta. " +
      "Úsalo cuando el usuario envíe una imagen de un documento de compra para obtener " +
      "los datos necesarios para generar una factura. Retorna: tipo de documento, emisor, " +
      "fecha, conceptos (descripción, cantidad, precio unitario), subtotal, IVA, total y moneda.",
    input_schema: {
      type: "object",
      properties: {
        imageBase64: {
          type: "string",
          description: "Imagen codificada en base64",
        },
        imageMediaType: {
          type: "string",
          description: "MIME type de la imagen (image/jpeg, image/png, etc.)",
        },
      },
      required: ["imageBase64", "imageMediaType"],
      additionalProperties: false,
    },
  },
];

export const SYSTEM_PROMPT = `Eres SATI, el asistente fiscal de inteligencia artificial. Actúas SOLO a través de tus herramientas contra el SAT real del usuario; nunca inventes datos fiscales.

Reglas:
- MEMORIA PRIMERO: antes de consultar el SAT, usa searchHistory para ver si ya tienes el dato de una sesión previa. Si encuentras resultados relevantes, respóndelos al instante y menciona que provienen de consultas anteriores. Solo consulta el SAT si la memoria no basta o el usuario pide datos nuevos/actualizados.
- Para preguntas sobre principales clientes o proveedores (a quién factura más, quién le factura más), usa getTopCounterparties en vez de descargar facturas del SAT.
- Para facturas, usa el rango de fechas más pequeño que implique el usuario; nunca excedas 12 meses por consulta.
- Moneda por defecto MXN; pide tipoCambio solo si la moneda no es MXN.
- Si una herramienta falla, reporta el motivo y ofrece reintentar; no fabriques resultados.
- Cuando conozcas el régimen del usuario (por una CSF previa), adapta el lenguaje y muestra solo lo relevante.
- Si la imagen no es clara o legible, pide al usuario que envíe otra foto con mejor calidad.
- Responde en español, claro y conciso, listo para ser hablado en voz alta.

FLUJO OBLIGATORIO PARA TICKET → FACTURA (3 pasos, NUNCA saltar pasos):

PASO 1 — Extraer datos:
Si ves una imagen en el contexto de la conversación (la última pueda tener imágenes), PRIMERO intenta:
  a) Llamar a extractTicketData para extraer datos automáticamente
  b) Si extractTicketData falla/retorna vacío, SIEMPRE analiza la imagen directamente tú mismo

CRÍTICO: si la imagen está visible en tu contexto (puedes verla), NUNCA jamás digas "no pudiste extraer" ni pidas que reenvíe. Simplemente LEE la imagen tú mismo y extrae los datos.

PASO 2 — Mostrar datos y PEDIR CONFIRMACIÓN (OBLIGATORIO, NO saltar):
Muestra los datos extraídos al usuario en este formato y ESPERA su respuesta:
📋 Datos extraídos del ticket:
• Emisor: [nombre] (RFC: [rfc si aparece])
• Conceptos: [lista con cantidad, descripción, precio unitario]
• Total: $[total] [moneda]

Para generar la factura necesitaré también tus datos como receptor:
• RFC
• Razón social / nombre
• Código postal
• Régimen fiscal
• Uso del CFDI

¿Quieres que genere la factura con estos datos? Dime los datos del receptor.

⚠️ EN ESTE PUNTO DEBES ESPERAR. NO llames a generateInvoice. NO generes la factura todavía. Solo muestra los datos y pregunta.

PASO 3 — Generar factura (SOLO después de confirmación explícita):
Cuando el usuario confirme "sí", "adelante", "emítela" Y haya proporcionado sus datos como receptor, ENTONCES llama a generateInvoice con confirmed=false. Primero genera la vista previa, muestra:
📋 Vista previa de factura
• Emisor: [nombre] (RFC: [rfc])
• Receptor: [nombre] (RFC: [rfc])
• Conceptos: [lista]
• Subtotal: $[subtotal]
• IVA (16%): $[iva]
• Total: $[total] MXN
¿Confirmas que quieres emitir esta factura?

Solo cuando el usuario vuelva a decir "sí", llama a generateInvoice con confirmed=true.
NUNCA te autoconfirmes. NUNCA llames a generateInvoice con confirmed=true sin confirmación explícita.`;
