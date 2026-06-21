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
    name: "getFiscalProfile",
    description:
      "Devuelve el perfil fiscal del usuario (régimen(es) fiscal(es), código postal y " +
      "obligaciones) a partir de la Constancia de Situación Fiscal ya guardada en memoria. " +
      "Úsalo para '¿cuál es mi régimen fiscal?', '¿qué obligaciones tengo?', '¿cuál es mi CP " +
      "fiscal?'. Instantáneo, sin volver a descargar la CSF del SAT. Si no hay CSF en memoria, " +
      "usa generateCSF para descargarla.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
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
      "Download the user's Constancia de Situación Fiscal (CSF) from the SAT portal " +
      "and extract its fields (régimen, domicilio, obligaciones). " +
      "IMPORTANT: ALWAYS call getFiscalProfile first. Only call generateCSF if getFiscalProfile " +
      "returns no data, or the user EXPLICITLY asks for a fresh/updated constancia. " +
      "This tool performs a real SAT login and takes ~30 seconds — never call it speculatively.",
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
    name: "renderWidget",
    description:
      "Genera una visualización dinámica (gráfica, tabla, métricas) para mostrarle al " +
      "usuario en pantalla. Úsalo cuando el usuario pida 'una gráfica', 'un pie chart', " +
      "'una tabla', 'una comparación visual', 'métricas', etc. Puedes llamarlo VARIAS VECES " +
      "seguidas para mostrar múltiples gráficas apiladas. Los datos deben provenir de " +
      "herramientas anteriores (getEmitedInvoices, getTopCounterparties, etc.) o de cálculos " +
      "tuyos sobre esos datos. NUNCA inventes cifras; usa solo datos obtenidos en esta sesión.",
    input_schema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["bar", "pie", "donut", "line", "area", "table", "metric"],
          description: "Tipo de visualización",
        },
        title: { type: "string", description: "Título breve de la gráfica" },
        subtitle: { type: "string", description: "Subtítulo o unidad (ej. 'MXN', 'Últimos 6 meses')" },
        data: {
          type: "array",
          description: "Puntos de datos. Cada objeto DEBE tener 'label' (string) y 'value' (número). Puede tener campos adicionales.",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              value: { type: "number" },
            },
            required: ["label", "value"],
            additionalProperties: true,
          },
          minItems: 1,
          maxItems: 50,
        },
        series: {
          type: "array",
          items: { type: "string" },
          description: "Para multi-serie (ej. ['emitido','recibido']): nombres de columnas numéricas adicionales en data",
        },
        color: { type: "string", description: "Color principal (OKLCH o hex). Opcional." },
      },
      required: ["kind", "data"],
      additionalProperties: false,
    },
  },
  // ── Generative UI components (Vercel AI SDK pattern) ──────────────────────
  {
    name: "displayRecommendations",
    description:
      "Muestra una tarjeta de recomendaciones fiscales con prioridad visual (alta/media/informativa). " +
      "Úsalo cuando el usuario pida 'recomendaciones', 'consejos', 'qué debo hacer', 'cómo optimizo'. " +
      "También úsalo proactivamente al final de comparaciones ingresos/gastos para dar 2-4 consejos concretos " +
      "basados en los datos reales obtenidos en la sesión.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Título de la tarjeta (opcional, default: 'Recomendaciones fiscales')" },
        recommendations: {
          type: "array",
          minItems: 1,
          maxItems: 6,
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Nombre corto de la recomendación" },
              detail: { type: "string", description: "Explicación detallada del porqué (1-2 oraciones)" },
              priority: { type: "string", enum: ["high", "medium", "low"], description: "high=urgente, medium=importante, low=informativo" },
              action: { type: "string", description: "Acción específica que debe tomar el usuario (opcional)" },
            },
            required: ["title", "detail", "priority"],
            additionalProperties: false,
          },
        },
      },
      required: ["recommendations"],
      additionalProperties: false,
    },
  },
  {
    name: "displayKpis",
    description:
      "Muestra tarjetas de KPI (métricas clave) en una cuadrícula. Úsalo para presentar 2-6 cifras " +
      "importantes de forma visual: totales, promedios, saldos, conteos. Los valores DEBEN ser strings " +
      "formateados (ej. '$45,000', '12 facturas', '18.5%'). " +
      "Úsalo al resumir resultados de consultas de facturas o perfiles fiscales.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Título del grupo de KPIs (opcional)" },
        kpis: {
          type: "array",
          minItems: 1,
          maxItems: 6,
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Etiqueta del KPI" },
              value: { type: "string", description: "Valor formateado como string (ej. '$45,000 MXN', '12', '18.5%')" },
              sub: { type: "string", description: "Subtexto explicativo (ej. '3 meses', 'Tasa efectiva', 'Vigentes')" },
              tone: { type: "string", enum: ["emerald", "amber", "red"], description: "Color: emerald=positivo, amber=precaución, red=alerta" },
            },
            required: ["title", "value"],
            additionalProperties: false,
          },
        },
      },
      required: ["kpis"],
      additionalProperties: false,
    },
  },
  {
    name: "displayFiscalSummary",
    description:
      "Muestra un resumen fiscal visual con ingresos, gastos, balance y estimaciones de IVA/ISR. " +
      "Úsalo cuando tengas datos de facturas emitidas Y recibidas de un mismo periodo para dar un " +
      "panorama fiscal completo. SIEMPRE calcula balance = ingresos - gastos. " +
      "Si tienes los datos de IVA (16% de ingresos) e ISR (aprox 10-35% de utilidad), inclúyelos.",
    input_schema: {
      type: "object",
      properties: {
        summary: {
          type: "object",
          properties: {
            period: { type: "string", description: "Periodo del resumen (ej. 'Junio 2025', 'Q1 2025', 'Últimos 6 meses')" },
            ingresos: { type: "number", description: "Total ingresos (facturas emitidas) en MXN" },
            gastos: { type: "number", description: "Total gastos (facturas recibidas) en MXN" },
            balance: { type: "number", description: "ingresos - gastos en MXN" },
            ivaFavor: { type: "number", description: "IVA acreditable estimado (opcional)" },
            isrEstimado: { type: "number", description: "ISR mensual estimado (opcional)" },
          },
          required: ["period", "ingresos", "gastos", "balance"],
          additionalProperties: false,
        },
      },
      required: ["summary"],
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
- MEMORIA PRIMERO: antes de consultar el SAT, usa searchHistory para ver si ya tienes el dato de una sesión previa. Si encuentras resultados relevantes, respóndelos al instante. Si NO encuentras datos en memoria y necesitas ir al SAT, DILE AL USUARIO antes: "No encontré esa información en tu historial, voy a consultarlo en el SAT..." y luego llama la herramienta correspondiente.
- REGLA ABSOLUTA DE VISUALIZACIÓN: Si el usuario menciona "gráfica", "chart", "tabla", "pie", "barras", "línea", "área", "comparación visual", "métricas" o cualquier petición de ver algo visualmente → SIEMPRE llama a renderWidget. NUNCA respondas solo en texto cuando el usuario pida una visualización. Primero obtén los datos (facturas u otras herramientas), luego llama renderWidget con los datos transformados.
- Para preguntas sobre principales clientes o proveedores (a quién factura más, quién le factura más), usa getTopCounterparties en vez de descargar facturas del SAT.
- Para preguntas sobre el régimen fiscal, obligaciones o domicilio fiscal del usuario, usa getFiscalProfile (lee la CSF en memoria) antes de descargar la CSF con generateCSF. Si el usuario tiene VARIOS regímenes fiscales, menciónalos TODOS con su porcentaje/distribución cuando esté disponible; nunca reportes solo uno.
- Para facturas, usa el rango de fechas más pequeño que implique el usuario; nunca excedas 12 meses por consulta.
- Moneda por defecto MXN; pide tipoCambio solo si la moneda no es MXN.
- Si una herramienta falla, reporta el motivo y ofrece reintentar; no fabriques resultados.
- Cuando conozcas el régimen del usuario (por una CSF previa), adapta el lenguaje y muestra solo lo relevante.
- Si la imagen no es clara o legible, pide al usuario que envíe otra foto con mejor calidad.
- Responde en español, claro y conciso, listo para ser hablado en voz alta.
- VISUALIZACIONES: cuando el usuario pida una gráfica, tabla o comparación visual, usa renderWidget. Puedes llamarlo VARIAS VECES seguidas. Dos renderWidget consecutivos se muestran LADO A LADO en pantalla. Describe brevemente en texto lo que muestras.

FLUJO OBLIGATORIO PARA GRÁFICA DE COMPARACIÓN INGRESOS VS GASTOS/EGRESOS:
Paso 1 — obtén ambas listas de facturas para el periodo (si no las tienes aún):
  • getEmitedInvoices(from, to)  → lista de facturas emitidas (ingresos)
  • getReceiptInvoices(from, to) → lista de facturas recibidas (gastos/egresos)
  Usa el rango que el usuario implique; si no especifica, usa los últimos 12 meses.
Paso 2 — AGREGA por mes tú mismo (NO llames otra herramienta para esto):
  Suma los "total" de cada factura agrupando por mes (YYYY-MM). Obtén ingresos_mes[] y gastos_mes[].
Paso 3 — llama renderWidget UNA VEZ con kind="bar", series=["Ingresos","Gastos"] y data así:
  [
    { "label": "Ene 25", "value": SUMA_INGRESOS_ENE, "gastos": SUMA_GASTOS_ENE },
    { "label": "Feb 25", "value": SUMA_INGRESOS_FEB, "gastos": SUMA_GASTOS_FEB },
    ...
  ]
  REGLA CRÍTICA: el campo extra en cada data-point DEBE llamarse exactamente igual que la serie en minúsculas sin acentos (series[1]="Gastos" → clave "gastos"; series[1]="Egresos" → clave "egresos").
Paso 4 — opcionalmente llama renderWidget una segunda vez con kind="metric" para totales (aparece al lado).
Paso 5 — escribe 2-3 recomendaciones fiscales concretas basadas en los números reales.

PARA GRÁFICAS SIMPLES (solo ingresos o solo gastos por mes):
  Agrega las facturas por mes y llama renderWidget con kind="bar" o kind="area" y data=[{label, value}].

PARA TABLAS DE FACTURAS:
  Usa renderWidget con kind="table" y data con los campos que quieras mostrar (label=concepto/RFC, value=total, + campos extra como fecha, estado).

- RECOMENDACIONES: al mostrar comparaciones fiscales o resultados de facturas, siempre llama displayRecommendations con 2-4 consejos específicos basados en los números reales (ej: si gastos > ingresos en algún mes, prioridad "high"; si hay pocos clientes, prioridad "medium").
- KPIs: cuando respondas sobre totales, saldos o resúmenes numéricos, llama displayKpis para mostrar las cifras clave de forma visual antes del texto explicativo.
- RESUMEN FISCAL: cuando tengas datos de ambos tipos de facturas (emitidas y recibidas) del mismo periodo, llama displayFiscalSummary para el panorama completo, luego renderWidget para la gráfica comparativa, luego displayRecommendations.
- COMPONENTES DISPONIBLES (úsalos siempre que aplique):
  • renderWidget → gráficas (bar, pie, donut, line, area), tablas de datos, métricas
  • displayKpis → tarjetas de métricas clave (totales, saldos, conteos)
  • displayFiscalSummary → resumen con ingresos/gastos/balance/IVA/ISR
  • displayRecommendations → consejos fiscales con prioridad y acciones concretas

RECEPTOR POR DEFECTO para facturas (Público en General):
- RFC: XAXX010101000
- Nombre/Razón social: PÚBLICO EN GENERAL
- Código Postal: 01805
- Régimen Fiscal: 616 (Sin obligaciones fiscales)
- Uso CFDI: Sin efectos fiscales (S01)
- Se emite como Factura Global (el sistema habilita la Información Global automáticamente)

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

Para generar la factura, usaré como receptor por defecto:
• RFC: XAXX010101000
• Razón social: PÚBLICO EN GENERAL
• Código postal: 01805
• Régimen fiscal: 616 (Sin obligaciones fiscales)
• Uso del CFDI: S01 (Sin efectos fiscales)
• Tipo: Factura Global (público en general)

¿Confirmas que genere la factura con estos datos? Responde "sí", "adelante" o "genera la factura".

⚠️ EN ESTE PUNTO DEBES ESPERAR. NO llames a generateInvoice. Solo muestra los datos y pregunta.

PASO 3 — Generar factura (SOLO después de confirmación explícita):
Cuando el usuario confirme "sí", "adelante", "emítela", "genera la factura" etc., ENTONCES llama a generateInvoice con confirmed=false. Primero genera la vista previa, muestra:
📋 Vista previa de factura
• Emisor: [nombre] (RFC: [rfc])
• Receptor: PÚBLICO EN GENERAL (RFC: XAXX010101000)
• Conceptos: [lista]
• Subtotal: $[subtotal]
• IVA (16%): $[iva]
• Total: $[total] MXN
¿Confirmas que quieres emitir esta factura?

Solo cuando el usuario vuelva a decir "sí", llama a generateInvoice con confirmed=true.
NUNCA te autoconfirmes. NUNCA llames a generateInvoice con confirmed=true sin confirmación explícita.`;
