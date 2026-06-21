/**
 * Invoice payload builder — generates the JSON for the generateInvoice tool
 * based on minimal user input. Supports two receptor types:
 *
 *   - Empresa (RFC 12 chars): uses Régimen 601, Uso G03 by default
 *   - Persona (RFC 13 chars): uses Régimen 612, Uso G03 by default
 *   - Público en general (XAXX010101000): uses Régimen 616, Uso S01, with facturaGlobal
 */

import type { GenerateInvoiceInput, Concepto } from "@sat/events";

const RFC_GENERICO_NACIONAL = "XAXX010101000";
const RFC_GENERICO_EXTRANJERO = "XEXX010101000";

export type ReceptorType = "empresa" | "persona" | "publico_en_general";

export interface InvoiceItem {
  descripcion: string;
  cantidad: number;
  valorUnitario: number;
  descuento?: number;
  claveProdServ?: string;
  claveUnidad?: string;
  objetoImpuesto?: string;
}

export interface BuildInvoiceInput {
  /** Receptor RFC (12 = empresa, 13 = persona, XAXX... = público en general) */
  rfcReceptor: string;
  /** Receptor nombre / razón social */
  nombreReceptor: string;
  /** Código postal del receptor (default: "01000") */
  codigoPostal?: string;
  /** Régimen fiscal del receptor (auto-detected from RFC if omitted) */
  regimenFiscalReceptor?: string;
  /** Uso CFDI (default: "G03" for empresa/persona, "S01" for público en general) */
  usoCFDI?: string;
  /** Líneas de la factura */
  conceptos: InvoiceItem[];
  /** Moneda (default: "MXN") */
  moneda?: string;
  /** Tipo de cambio (required if moneda !== "MXN") */
  tipoCambio?: number;
  /** For factura global: periodicidad (01-05), meses (01-18), año */
  facturaGlobal?: { periodicidad: string; meses: string; anio: number };
}

/**
 * Detect whether an RFC belongs to a company (12 chars), individual (13 chars),
 * or is the generic publico-en-general RFC.
 */
export function detectReceptorType(rfc: string): ReceptorType {
  const upper = rfc.toUpperCase().trim();
  if (upper === RFC_GENERICO_NACIONAL || upper === RFC_GENERICO_EXTRANJERO) {
    return "publico_en_general";
  }
  return upper.length === 13 ? "persona" : "empresa";
}

/**
 * Auto-select regimen fiscal based on receptor type.
 */
function defaultRegimen(tipo: ReceptorType): string {
  switch (tipo) {
    case "empresa":
      return "601"; // General de Ley Personas Morales
    case "persona":
      return "612"; // Actividades Empresariales y Profesionales
    case "publico_en_general":
      return "616"; // Sin obligaciones fiscales
  }
}

/**
 * Auto-select Uso CFDI based on receptor type.
 */
function defaultUsoCfdi(tipo: ReceptorType): string {
  switch (tipo) {
    case "empresa":
    case "persona":
      return "G03"; // Gastos en general
    case "publico_en_general":
      return "S01"; // Sin efectos fiscales
  }
}

/**
 * Build the complete GenerateInvoiceInput payload for the generateInvoice tool.
 *
 * @example
 * ```ts
 * const payload = buildInvoicePayload({
 *   rfcReceptor: "XAXX010101000",
 *   nombreReceptor: "FACTURA GLOBAL",
 *   conceptos: [
 *     { descripcion: "Servicio de consultoría", cantidad: 1, valorUnitario: 5000 },
 *   ],
 * });
 * // payload.receptor.rfc === "XAXX010101000"
 * // payload.conceptos[0].objetoImpuesto === "02"
 * // payload.confirmed === false
 * ```
 */
export function buildInvoicePayload(input: BuildInvoiceInput): GenerateInvoiceInput {
  const rfc = input.rfcReceptor.toUpperCase().trim();
  const tipo = detectReceptorType(rfc);
  const esGenerico = tipo === "publico_en_general";

  const nombre = input.nombreReceptor.trim().toUpperCase();
  const codigoPostal = input.codigoPostal ?? "01000";
  const regimenFiscal = input.regimenFiscalReceptor ?? defaultRegimen(tipo);
  const usoCFDI = input.usoCFDI ?? defaultUsoCfdi(tipo);

  // For publico en general with "PUBLICO EN GENERAL" name, we need facturaGlobal
  const esPublicoGeneral =
    esGenerico && (nombre === "PUBLICO EN GENERAL" || nombre === "PÚBLICO EN GENERAL");

  const conceptos: Concepto[] = input.conceptos.map((c) => ({
    claveProdServ: c.claveProdServ ?? "01010101", // Genérico: Productos
    descripcion: c.descripcion,
    claveUnidad: c.claveUnidad ?? "H87", // Pieza
    cantidad: c.cantidad,
    valorUnitario: c.valorUnitario,
    descuento: c.descuento ?? 0,
    objetoImpuesto: c.objetoImpuesto ?? "02", // Tasa
  }));

  const payload: GenerateInvoiceInput = {
    receptor: {
      rfc,
      nombreRazonSocial: nombre,
      codigoPostal,
      regimenFiscalReceptor: regimenFiscal,
      usoCFDI,
    },
    conceptos,
    moneda: input.moneda ?? "MXN",
    confirmed: false,
  };

  if (input.tipoCambio) {
    payload.tipoCambio = input.tipoCambio;
  }

  // Factura global: required for PUBLICO EN GENERAL + generic RFC
  if (esPublicoGeneral) {
    payload.facturaGlobal = input.facturaGlobal ?? {
      periodicidad: "01", // Diario
      meses: "01", // Enero (mes actual se puede ajustar)
      anio: new Date().getFullYear(),
    };
  }

  return payload;
}

/**
 * Calculate IVA breakdown from conceptos (16% tasa).
 */
export function calculateIva(conceptos: InvoiceItem[]): {
  subtotal: number;
  iva: number;
  total: number;
} {
  const subtotal = conceptos.reduce(
    (sum, c) => sum + c.cantidad * c.valorUnitario - (c.descuento ?? 0),
    0,
  );
  const iva = Math.round(subtotal * 0.16 * 100) / 100;
  const total = Math.round((subtotal + iva) * 100) / 100;
  return { subtotal, iva, total };
}
