import type { Invoice, SkillResult } from "./results.js";
import type { SkillName } from "./skills.js";

/**
 * Canonical demo dataset — "casi real" mock data for a young Mexican freelancer.
 * Single source of truth shared by the API (voice agent) and the web app, so
 * voice and text render identical data. Same shapes as the live scraper flows
 * (@sat/events), so flipping to real SAT data changes nothing downstream.
 *
 * Persona: ANDRICK DANIEL RAMOS ORTEGA (RFC de prueba RAOA0111176P7) — RESICO +
 * un empleo asalariado de medio tiempo + ingresos por plataformas. Un año de
 * actividad con tendencia creciente.
 */

export const DEMO_RFC = "RAOA0111176P7";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Deterministic uuid-shaped folio so the list looks like real CFDIs. */
const folio = (n: number) => {
  const h = ((n * 2654435761) >>> 0).toString(16).padStart(8, "0").toUpperCase();
  return `${h}-2728-46D5-B255-5835C7${String(n).padStart(6, "0")}`;
};

// ── Facturas EMITIDAS (ingresos) ────────────────────────────────────────────
// [fecha, rfcReceptor, nombreReceptor, subtotal, estado?]
type EmitRow = [string, string, string, number, ("Vigente" | "Cancelado")?];

const EMITIDAS_ROWS: EmitRow[] = [
  ["2025-06-12", "ACO050101AB1", "ACME Consultoría SA de CV", 8000],
  ["2025-07-03", "DIG180920QX3", "Digital House MX SA de CV", 7000],
  ["2025-07-22", "MPU190312KL9", "Marketing Pulse SA de CV", 5000],
  ["2025-08-15", "TEC110704RM8", "Tecnológicas Norte SA de CV", 9000],
  ["2025-09-05", "ACO050101AB1", "ACME Consultoría SA de CV", 8500],
  ["2025-09-26", "ECL200815H23", "Estudio Creativo Lumen", 6500],
  ["2025-10-10", "DIG180920QX3", "Digital House MX SA de CV", 11000],
  ["2025-10-28", "MPU190312KL9", "Marketing Pulse SA de CV", 7000],
  ["2025-11-14", "TEC110704RM8", "Tecnológicas Norte SA de CV", 8000, "Cancelado"],
  ["2025-11-30", "ACO050101AB1", "ACME Consultoría SA de CV", 9500],
  ["2025-12-09", "DIG180920QX3", "Digital House MX SA de CV", 13000],
  ["2025-12-20", "ECL200815H23", "Estudio Creativo Lumen", 9000],
  ["2026-01-15", "ACO050101AB1", "ACME Consultoría SA de CV", 11000],
  ["2026-01-30", "XAXX010101000", "FACTURA GLOBAL", 8000],
  ["2026-02-11", "DIG180920QX3", "Digital House MX SA de CV", 14000],
  ["2026-02-25", "MPU190312KL9", "Marketing Pulse SA de CV", 10000],
  ["2026-03-12", "TEC110704RM8", "Tecnológicas Norte SA de CV", 12000],
  ["2026-03-27", "ACO050101AB1", "ACME Consultoría SA de CV", 9000],
  ["2026-04-08", "DIG180920QX3", "Digital House MX SA de CV", 16000],
  ["2026-04-22", "ECL200815H23", "Estudio Creativo Lumen", 12000],
  ["2026-05-14", "ACO050101AB1", "ACME Consultoría SA de CV", 15000],
  ["2026-05-29", "MPU190312KL9", "Marketing Pulse SA de CV", 11000],
  ["2026-06-10", "DIG180920QX3", "Digital House MX SA de CV", 18000],
  ["2026-06-18", "TEC110704RM8", "Tecnológicas Norte SA de CV", 13000, "Cancelado"],
];

export const emitidasFixture: Invoice[] = EMITIDAS_ROWS.map(
  ([fecha, rfc, nombre, subtotal, estado = "Vigente"], i) => ({
    uuid: folio(1000 + i),
    rfcEmisor: DEMO_RFC,
    rfcReceptor: rfc,
    nombreReceptor: nombre,
    fechaEmision: fecha,
    subtotal,
    iva: round2(subtotal * 0.16),
    total: round2(subtotal * 1.16),
    estado,
    tipoComprobante: "I",
  }),
);

// ── Facturas RECIBIDAS (gastos deducibles) ──────────────────────────────────
// [fecha, rfcEmisor, nombreEmisor, subtotal]  — nombre permite categorizar gasto
type RecibRow = [string, string, string, number];

const RECIBIDAS_ROWS: RecibRow[] = [
  ["2025-07-05", "TEL840315KT6", "Teléfonos de México (Internet)", 599],
  ["2025-08-05", "TEL840315KT6", "Teléfonos de México (Internet)", 599],
  ["2025-08-18", "ADO150601XY1", "Adobe Systems (Software)", 1200],
  ["2025-09-05", "TEL840315KT6", "Teléfonos de México (Internet)", 599],
  ["2025-09-22", "PEM920101AAA", "Pemex (Combustible)", 800],
  ["2025-10-05", "TEL840315KT6", "Teléfonos de México (Internet)", 599],
  ["2025-10-15", "AMZ140210ZZ2", "Amazon Web Services (Hosting)", 2400],
  ["2025-11-05", "TEL840315KT6", "Teléfonos de México (Internet)", 599],
  ["2025-11-20", "COW180505QW3", "WeWork (Coworking)", 3500],
  ["2025-12-05", "TEL840315KT6", "Teléfonos de México (Internet)", 599],
  ["2025-12-12", "OFF160708RT4", "Office Depot (Papelería)", 950],
  ["2026-01-30", "ROM240313I36", "Roma Servicios Digitales", 253.45],
  ["2026-02-05", "TEL840315KT6", "Teléfonos de México (Internet)", 599],
  ["2026-02-19", "ADO150601XY1", "Adobe Systems (Software)", 1200],
  ["2026-03-10", "AMZ140210ZZ2", "Amazon Web Services (Hosting)", 2400],
  ["2026-04-15", "COW180505QW3", "WeWork (Coworking)", 3500],
  ["2026-05-08", "PEM920101AAA", "Pemex (Combustible)", 850],
];

export const recibidasFixture: Invoice[] = RECIBIDAS_ROWS.map(
  ([fecha, rfc, nombre, subtotal], i) => ({
    uuid: folio(2000 + i),
    rfcEmisor: rfc,
    nombreEmisor: nombre,
    rfcReceptor: DEMO_RFC,
    fechaEmision: fecha,
    subtotal,
    iva: round2(subtotal * 0.16),
    total: round2(subtotal * 1.16),
    estado: "Vigente",
    tipoComprobante: "I",
  }),
);

// ── CSF ─────────────────────────────────────────────────────────────────────
// NOTE: el % por régimen NO viene en la Constancia real del SAT — es un insight
// estimado por SATI (aquí, mock). Al cablear data real hay que derivarlo o
// dejar `porcentaje` indefinido.
export const csfFixture: SkillResult & { skill: "generateCSF" } = {
  skill: "generateCSF",
  csf: {
    rfc: DEMO_RFC,
    nombre: "ANDRICK DANIEL RAMOS ORTEGA",
    regimenFiscal: [
      { nombre: "Régimen Simplificado de Confianza", porcentaje: 55 },
      { nombre: "Régimen de Sueldos y Salarios e Ingresos Asimilados a Salarios", porcentaje: 30 },
      { nombre: "Régimen de las Actividades Empresariales a través de Plataformas Tecnológicas", porcentaje: 15 },
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
        descripcion: "Retención de ISR e IVA por ingresos a través de plataformas tecnológicas.",
        fechaInicio: "30/01/2026",
        vencimiento: "Retención efectuada por la plataforma; pago a más tardar el día 17 del mes siguiente.",
      },
      {
        descripcion: "Ajuste anual de ISR correspondiente a la declaración anual.",
        fechaInicio: "30/01/2026",
        vencimiento: "A más tardar el día 30 del mes de abril del ejercicio siguiente",
      },
    ],
    pdfArtifactId: "5cff40e3-24f6-4764-b3a7-2d8191a889fd",
  },
};

// ── generateInvoice (vista previa, nunca emite) ─────────────────────────────
interface Concepto {
  claveProdServ?: string;
  descripcion?: string;
  claveUnidad?: string;
  cantidad?: number;
  valorUnitario?: number;
  descuento?: number;
  objetoImpuesto?: string;
}

function invoicePreview(input: Record<string, unknown>): SkillResult {
  const receptor = (input.receptor ?? {}) as { rfc?: string };
  const raw = Array.isArray(input.conceptos) ? (input.conceptos as Concepto[]) : [];
  const conceptos =
    raw.length > 0
      ? raw
      : [{ claveProdServ: "01010101", descripcion: "Servicio profesional", claveUnidad: "H87", cantidad: 1, valorUnitario: 11600, descuento: 0, objetoImpuesto: "02" }];

  const subtotal = round2(
    conceptos.reduce(
      (s, c) => s + (Number(c.valorUnitario ?? 0) * Number(c.cantidad ?? 1) - Number(c.descuento ?? 0)),
      0,
    ),
  );
  const iva = round2(subtotal * 0.16);
  return {
    skill: "generateInvoice",
    status: "previewed",
    preview: {
      receptorRfc: receptor.rfc ?? "XAXX010101000",
      conceptos: conceptos as Record<string, unknown>[],
      subtotal,
      iva,
      total: round2(subtotal + iva),
      rawArtifactId: "e7f1f401-3b41-4791-93cb-163bf2140ff6",
    },
  };
}

/** Run a skill against the demo dataset. generateInvoice always previews. */
export function mockSkillResult(
  skill: SkillName,
  input: Record<string, unknown> = {},
): SkillResult {
  switch (skill) {
    case "getEmitedInvoices":
      return { skill: "getEmitedInvoices", invoices: emitidasFixture };
    case "getReceiptInvoices":
      return { skill: "getReceiptInvoices", invoices: recibidasFixture };
    case "generateCSF":
      return csfFixture;
    case "generateInvoice":
      return invoicePreview(input);
    default:
      return csfFixture;
  }
}
