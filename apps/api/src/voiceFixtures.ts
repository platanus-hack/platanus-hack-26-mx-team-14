import type { SkillName, SkillResult } from "@sat/events";

/**
 * Demo fixtures for the public voice agent. The public demo has no SAT
 * credentials, so the tool-calling agent runs against these canned results
 * (same shapes as the live scraper flows / @sat/events). They mirror the
 * frontend fixtures so voice and text render identically.
 */

const recibidas: SkillResult = {
  skill: "getReceiptInvoices",
  invoices: [
    {
      uuid: "70333722-2728-46D5-B255-5835C7756332",
      rfcEmisor: "ROM240313I36",
      rfcReceptor: "RAOA0111176P7",
      fechaEmision: "2026-01-30",
      subtotal: 253.45,
      iva: 40.55,
      total: 294,
      estado: "Vigente",
      tipoComprobante: "I",
    },
  ],
};

const emitidas: SkillResult = {
  skill: "getEmitedInvoices",
  invoices: [
    {
      uuid: "E7F1F401-3B41-4791-93CB-163BF2140FF6",
      rfcEmisor: "RAOA0111176P7",
      rfcReceptor: "XAXX010101000",
      nombreReceptor: "FACTURA GLOBAL",
      fechaEmision: "2026-01-30",
      subtotal: 11600,
      iva: 1856,
      total: 13456,
      estado: "Vigente",
      tipoComprobante: "I",
    },
    {
      uuid: "A8C2D110-0042-4E5F-9A0B-7C2D3E4F5A11",
      rfcEmisor: "RAOA0111176P7",
      rfcReceptor: "ROM240313I36",
      nombreReceptor: "ROMA SERVICIOS DIGITALES",
      fechaEmision: "2026-01-15",
      subtotal: 5000,
      iva: 800,
      total: 5800,
      estado: "Vigente",
      tipoComprobante: "I",
    },
  ],
};

const csf: SkillResult = {
  skill: "generateCSF",
  csf: {
    rfc: "RAOA0111176P7",
    nombre: "ANDRICK DANIEL RAMOS ORTEGA",
    regimenFiscal: [
      { nombre: "Régimen de Sueldos y Salarios e Ingresos Asimilados a Salarios" },
      { nombre: "Régimen Simplificado de Confianza" },
    ],
    domicilioFiscal: {
      codigoPostal: "11800",
      entidad: "CIUDAD DE MEXICO",
      municipio: "MIGUEL HIDALGO",
      colonia: "ESCANDON I SECCION",
    },
    obligaciones: [
      {
        descripcion: "Pago provisional mensual de ISR. Régimen Simplificado de Confianza.",
        fechaInicio: "30/01/2026",
        vencimiento:
          "A más tardar el día 17 del mes de calendario inmediato posterior a aquél al que corresponda el pago",
      },
      {
        descripcion: "Pago definitivo mensual de IVA. Régimen Simplificado de Confianza.",
        fechaInicio: "30/01/2026",
        vencimiento: "A más tardar el día 17 del mes inmediato posterior al periodo que corresponda.",
      },
      {
        descripcion:
          "Ajuste anual de ISR correspondiente a la declaración anual. Régimen Simplificado de Confianza.",
        fechaInicio: "30/01/2026",
        vencimiento: "A más tardar el día 30 del mes de abril del ejercicio siguiente",
      },
    ],
    pdfArtifactId: "5cff40e3-24f6-4764-b3a7-2d8191a889fd",
  },
};

interface Concepto {
  claveProdServ?: string;
  descripcion?: string;
  claveUnidad?: string;
  cantidad?: number;
  valorUnitario?: number;
  descuento?: number;
  objetoImpuesto?: string;
}

/** Build a vista-previa from the tool input so "factúrale 5000 a X" feels real. */
function invoicePreview(input: Record<string, unknown>): SkillResult {
  const receptor = (input.receptor ?? {}) as { rfc?: string };
  const conceptos = (Array.isArray(input.conceptos) ? input.conceptos : []) as Concepto[];
  const items =
    conceptos.length > 0
      ? conceptos
      : [{ claveProdServ: "01010101", descripcion: "Servicio", claveUnidad: "H87", cantidad: 1, valorUnitario: 11600, descuento: 0, objetoImpuesto: "02" }];

  const subtotal = items.reduce(
    (s, c) => s + (Number(c.valorUnitario ?? 0) * Number(c.cantidad ?? 1) - Number(c.descuento ?? 0)),
    0,
  );
  const iva = Math.round(subtotal * 0.16 * 100) / 100;
  const total = Math.round((subtotal + iva) * 100) / 100;

  return {
    skill: "generateInvoice",
    status: "previewed",
    preview: {
      receptorRfc: receptor.rfc ?? "XAXX010101000",
      conceptos: items as Record<string, unknown>[],
      subtotal,
      iva,
      total,
      rawArtifactId: "e7f1f401-3b41-4791-93cb-163bf2140ff6",
    },
  };
}

/** Run a skill against demo fixtures. generateInvoice always previews (never emits). */
export function fixtureFor(skill: SkillName, input: Record<string, unknown> = {}): SkillResult {
  switch (skill) {
    case "getReceiptInvoices":
      return recibidas;
    case "getEmitedInvoices":
      return emitidas;
    case "generateCSF":
      return csf;
    case "generateInvoice":
      return invoicePreview(input);
    default:
      return csf;
  }
}
