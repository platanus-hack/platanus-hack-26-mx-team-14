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

// ── Facturas EMITIDAS (ingresos facturados) ─────────────────────────────────
// Cada renglón lleva su FUENTE de ingreso para que la composición por régimen se
// DERIVE de los datos (no se afirme). RESICO = facturas a clientes; plataforma =
// CFDIs de apps (DiDi/Uber/Rappi). El asalariado va aparte (es nómina, NOMINA_ANUAL).
// [fecha, rfcReceptor, nombreReceptor, subtotal, fuente, estado?]
type Fuente = "resico" | "plataforma";
type EmitRow = [string, string, string, number, Fuente, ("Vigente" | "Cancelado")?];

const EMITIDAS_ROWS: EmitRow[] = [
  // RESICO — facturas a clientes (suma $165,000 vigente)
  ["2025-06-12", "ACO050101AB1", "ACME Consultoría SA de CV", 8000, "resico"],
  ["2025-07-03", "DIG180920QX3", "Digital House MX SA de CV", 9000, "resico"],
  ["2025-08-15", "TEC110704RM8", "Tecnológicas Norte SA de CV", 10000, "resico"],
  ["2025-09-05", "ACO050101AB1", "ACME Consultoría SA de CV", 11000, "resico"],
  ["2025-10-10", "DIG180920QX3", "Digital House MX SA de CV", 12000, "resico"],
  ["2025-11-30", "ACO050101AB1", "ACME Consultoría SA de CV", 13000, "resico"],
  ["2025-12-09", "DIG180920QX3", "Digital House MX SA de CV", 14000, "resico"],
  ["2026-01-15", "ACO050101AB1", "ACME Consultoría SA de CV", 12000, "resico"],
  ["2026-02-11", "DIG180920QX3", "Digital House MX SA de CV", 13000, "resico"],
  ["2026-03-12", "TEC110704RM8", "Tecnológicas Norte SA de CV", 14000, "resico"],
  ["2026-04-08", "DIG180920QX3", "Digital House MX SA de CV", 15000, "resico"],
  ["2026-05-14", "ACO050101AB1", "ACME Consultoría SA de CV", 16000, "resico"],
  ["2026-06-10", "DIG180920QX3", "Digital House MX SA de CV", 18000, "resico"],
  // Plataformas — CFDIs de apps (suma $45,000 vigente)
  ["2025-07-20", "DMS180521KL2", "DiDi Mobility México", 7500, "plataforma"],
  ["2025-09-22", "UBE140317AB5", "Uber México (Plataforma)", 7500, "plataforma"],
  ["2025-11-18", "RAP190812CD7", "Rappi México (Plataforma)", 7500, "plataforma"],
  ["2026-01-25", "DMS180521KL2", "DiDi Mobility México", 7500, "plataforma"],
  ["2026-03-27", "UBE140317AB5", "Uber México (Plataforma)", 7500, "plataforma"],
  ["2026-05-29", "RAP190812CD7", "Rappi México (Plataforma)", 7500, "plataforma"],
  // Canceladas (no cuentan para ingreso ni IVA)
  ["2025-11-14", "TEC110704RM8", "Tecnológicas Norte SA de CV", 8000, "resico", "Cancelado"],
  ["2026-06-18", "TEC110704RM8", "Tecnológicas Norte SA de CV", 13000, "resico", "Cancelado"],
];

export const emitidasFixture: Invoice[] = EMITIDAS_ROWS.map(
  ([fecha, rfc, nombre, subtotal, , estado = "Vigente"], i) => ({
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

// ── Composición de ingreso (DERIVADA, para que el régimen cuadre) ────────────
/** Sueldo anual asalariado (nómina). No genera facturas emitidas → cifra aparte. */
export const NOMINA_ANUAL = 90000;

const sumaVigentePorFuente = (fuente: Fuente) =>
  EMITIDAS_ROWS.filter((r) => r[4] === fuente && (r[5] ?? "Vigente") === "Vigente").reduce(
    (s, r) => s + r[3],
    0,
  );

/** Ingreso anual por fuente — la base de la que se deriva el % por régimen. */
export const incomeComposition = (() => {
  const resico = sumaVigentePorFuente("resico");
  const plataforma = sumaVigentePorFuente("plataforma");
  const asalariado = NOMINA_ANUAL;
  const total = resico + plataforma + asalariado;
  return {
    resico,
    plataforma,
    asalariado,
    total,
    pct: {
      resico: Math.round((resico / total) * 100),
      asalariado: Math.round((asalariado / total) * 100),
      plataforma: Math.round((plataforma / total) * 100),
    },
  };
})();

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
// de SATI. Aquí se DERIVA de incomeComposition (ingreso por fuente), así siempre
// cuadra con las facturas + la nómina. Con data real se derivaría igual.
export const csfFixture: SkillResult & { skill: "generateCSF" } = {
  skill: "generateCSF",
  csf: {
    rfc: DEMO_RFC,
    nombre: "ANDRICK DANIEL RAMOS ORTEGA",
    regimenFiscal: [
      { nombre: "Régimen Simplificado de Confianza", porcentaje: incomeComposition.pct.resico },
      { nombre: "Régimen de Sueldos y Salarios e Ingresos Asimilados a Salarios", porcentaje: incomeComposition.pct.asalariado },
      { nombre: "Régimen de las Actividades Empresariales a través de Plataformas Tecnológicas", porcentaje: incomeComposition.pct.plataforma },
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
