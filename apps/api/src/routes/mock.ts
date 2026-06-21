import { PassThrough } from "node:stream";
import type { FastifyInstance } from "fastify";

const MOCK_RFC_EMISOR = "GAMO840512HDF";
const MOCK_RFC_RECEPTOR = "XAXX010101000";

function fakeInvoices(count: number, emitted: boolean) {
  return Array.from({ length: count }, (_, i) => ({
    uuid: `${emitted ? "E" : "R"}${String(i + 1).padStart(3, "0")}-MOCK-UUID-${Date.now() + i}`,
    rfcEmisor: emitted ? MOCK_RFC_EMISOR : `CLI${String(i).padStart(6, "0")}SA`,
    rfcReceptor: emitted ? MOCK_RFC_RECEPTOR : MOCK_RFC_EMISOR,
    nombreEmisor: emitted ? "García Morales Oscar" : `Cliente Demo ${i + 1}`,
    nombreReceptor: emitted ? "PUBLICO EN GENERAL" : "García Morales Oscar",
    fechaEmision: new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    subtotal: Math.round((1000 + i * 350) * 100) / 100,
    iva: Math.round((1000 + i * 350) * 0.16 * 100) / 100,
    total: Math.round((1000 + i * 350) * 1.16 * 100) / 100,
    estado: "Vigente" as const,
    tipoComprobante: "I" as const,
  }));
}

// Obligaciones format matches real scraper output: vencimiento is a text description
const MOCK_CSF = {
  rfc: MOCK_RFC_EMISOR,
  nombre: "GARCIA MORALES OSCAR",
  regimenFiscal: ["Régimen Simplificado de Confianza"],
  domicilioFiscal: {
    codigoPostal: "06600",
    entidad: "CIUDAD DE MEXICO",
    municipio: "CUAUHTEMOC",
    colonia: "JUAREZ",
  },
  obligaciones: [
    {
      descripcion: "Pago provisional mensual de ISR. Régimen Simplificado de Confianza.",
      fechaInicio: "01/01/2024",
      vencimiento: "A más tardar el día 17 del mes de calendario inmediato posterior a aquél al que corresponda el pago",
    },
    {
      descripcion: "Pago definitivo mensual de IVA. Régimen Simplificado de Confianza.",
      fechaInicio: "01/01/2024",
      vencimiento: "A más tardar el día 17 del mes inmediato posterior al periodo que corresponda.",
    },
    {
      descripcion: "Ajuste anual de ISR correspondiente a la declaración anual. Régimen Simplificado de Confianza.",
      fechaInicio: "01/01/2024",
      vencimiento: "A más tardar el día 30 del mes de abril del ejercicio siguiente",
    },
  ],
  pdfArtifactId: "mock-csf-artifact-id",
};

const MOCK_PREVIEW = {
  receptorRfc: "XAXX010101000",
  conceptos: [
    {
      descripcion: "Servicios de desarrollo de software",
      cantidad: 1,
      valorUnitario: 15000,
      claveProdServ: "81111501",
      claveUnidad: "E48",
    },
  ],
  subtotal: 15000,
  iva: 2400,
  total: 17400,
  rawArtifactId: "mock-preview-artifact-id",
};

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export async function mockRoutes(app: FastifyInstance) {
  /**
   * POST /mock/agent/turn
   * No auth required — development only.
   * Detects intent from the text and returns a realistic SSE response.
   */
  app.post<{ Body: { text?: string; messages?: unknown[] } }>(
    "/mock/agent/turn",
    async (req, reply) => {
      const text = (req.body.text ?? "").toLowerCase();

      const pt = new PassThrough();
      const send = (ev: object) => {
        try {
          if (!pt.destroyed) pt.write(`data: ${JSON.stringify(ev)}\n\n`);
        } catch { /* disconnected */ }
      };

      reply
        .header("Content-Type", "text/event-stream; charset=utf-8")
        .header("Cache-Control", "no-cache")
        .header("Connection", "keep-alive")
        .header("X-Accel-Buffering", "no")
        .send(pt);

      try {
        send({ type: "thinking" });
        await delay(600);

        if (text.includes("csf") || text.includes("situación fiscal") || text.includes("constancia")) {
          send({ type: "tool_call", name: "generateCSF", label: "Descargando Constancia de Situación Fiscal…" });
          await delay(1200);
          send({ type: "tool_result", skill: "generateCSF", result: { skill: "generateCSF", csf: MOCK_CSF } });
          await delay(300);
          send({ type: "text", text: "Aquí está tu Constancia de Situación Fiscal. Estás registrado en el Régimen Simplificado de Confianza con domicilio en Cuauhtémoc, CDMX. Tu próxima obligación es el pago mensual el 17 de este mes." });
          send({ type: "done", assistantText: "Aquí está tu Constancia de Situación Fiscal.", skillResult: { skill: "generateCSF", csf: MOCK_CSF } });

        } else if (text.includes("recib") || text.includes("me facturaron") || text.includes("recibidas")) {
          send({ type: "tool_call", name: "getReceiptInvoices", label: "Consultando facturas recibidas…" });
          await delay(1400);
          const invoices = fakeInvoices(8, false);
          const result = { skill: "getReceiptInvoices", invoices };
          send({ type: "tool_result", skill: "getReceiptInvoices", result });
          await delay(300);
          send({ type: "text", text: `Encontré ${invoices.length} facturas recibidas. El total del período es $${invoices.reduce((s, inv) => s + inv.total, 0).toLocaleString("es-MX")} MXN.` });
          send({ type: "done", assistantText: `${invoices.length} facturas recibidas.`, skillResult: result });

        } else if (text.includes("generar") || text.includes("emitir") || text.includes("hacer factura") || text.includes("nueva factura")) {
          send({ type: "tool_call", name: "generateInvoice", label: "Preparando factura…" });
          await delay(1600);
          const result = { skill: "generateInvoice", status: "previewed", preview: MOCK_PREVIEW };
          send({ type: "tool_result", skill: "generateInvoice", result });
          await delay(300);
          send({ type: "text", text: "Aquí está la vista previa de tu factura. Subtotal $15,000, IVA $2,400, Total $17,400. ¿Confirmas la emisión?" });
          send({ type: "done", assistantText: "Vista previa lista. ¿Confirmas?", skillResult: result });

        } else {
          // default: emitted invoices
          send({ type: "tool_call", name: "getEmitedInvoices", label: "Consultando facturas emitidas…" });
          await delay(1400);
          const invoices = fakeInvoices(12, true);
          const result = { skill: "getEmitedInvoices", invoices };
          send({ type: "tool_result", skill: "getEmitedInvoices", result });
          await delay(300);
          send({ type: "text", text: `Encontré ${invoices.length} facturas emitidas. El total del período es $${invoices.reduce((s, inv) => s + inv.total, 0).toLocaleString("es-MX")} MXN.` });
          send({ type: "done", assistantText: `${invoices.length} facturas emitidas.`, skillResult: result });
        }
      } catch (err) {
        send({ type: "error", message: (err as Error).message });
      } finally {
        try { pt.end(); } catch { /* ok */ }
      }
    },
  );
}
