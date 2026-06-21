import { z } from "zod";
import { type TicketExtraction } from "./skills.js";

/** ---- Normalized result shapes returned by the scraper flows ---- */

export const invoice = z.object({
  uuid: z.string(), // folio fiscal
  rfcEmisor: z.string(),
  rfcReceptor: z.string(),
  nombreEmisor: z.string().optional(),
  nombreReceptor: z.string().optional(),
  fechaEmision: z.string(), // ISO
  subtotal: z.number(),
  iva: z.number().optional(),
  total: z.number(),
  estado: z.enum(["Vigente", "Cancelado"]),
  tipoComprobante: z.enum(["I", "E", "P", "N", "T"]),
});
export type Invoice = z.infer<typeof invoice>;

export const obligacion = z.object({
  descripcion: z.string(),
  fechaInicio: z.string().optional(),
  vencimiento: z.string().optional(),
});

/** A fiscal régimen from the CSF, with its allocation % when the persona has several. */
export const regimenCsf = z.object({
  nombre: z.string(),
  porcentaje: z.number().optional(),
});
export type RegimenCsf = z.infer<typeof regimenCsf>;

export const csf = z.object({
  rfc: z.string(),
  nombre: z.string(),
  regimenFiscal: z.array(regimenCsf),
  domicilioFiscal: z.object({
    codigoPostal: z.string(),
    entidad: z.string().optional(),
    municipio: z.string().optional(),
    colonia: z.string().optional(),
  }),
  obligaciones: z.array(obligacion),
  pdfArtifactId: z.string(),
});
export type CSF = z.infer<typeof csf>;

/**
 * Claude's read of the vista-previa PDF: the CFDI's parties, payment/timbrado data
 * and a plain-language insight ("a quién va dirigida", qué ampara, etc.). Best-effort
 * — all fields optional so a failed extraction never blocks the preview.
 */
export const invoiceAnalysis = z.object({
  emisor: z.object({ rfc: z.string(), nombre: z.string() }).partial().optional(),
  receptor: z
    .object({ rfc: z.string(), nombre: z.string(), usoCFDI: z.string() })
    .partial()
    .optional(),
  efectoComprobante: z.string().optional(), // Ingreso / Egreso / Pago …
  formaPago: z.string().optional(),
  metodoPago: z.string().optional(),
  moneda: z.string().optional(),
  folioFiscal: z.string().optional(),
  fechaEmision: z.string().optional(),
  selloDigitalPresente: z.boolean().optional(),
  /** Resumen en lenguaje natural: a quién va dirigida, qué ampara, estado de timbrado. */
  insight: z.string(),
});
export type InvoiceAnalysis = z.infer<typeof invoiceAnalysis>;

export const invoicePreview = z.object({
  receptorRfc: z.string(),
  conceptos: z.array(z.record(z.unknown())),
  subtotal: z.number(),
  iva: z.number(),
  total: z.number(),
  rawArtifactId: z.string(),
  analysis: invoiceAnalysis.optional(),
});
export type InvoicePreview = z.infer<typeof invoicePreview>;

export const issuedInvoice = z.object({
  uuid: z.string(),
  pdfArtifactId: z.string().optional(),
  xmlArtifactId: z.string().optional(),
});
export type IssuedInvoice = z.infer<typeof issuedInvoice>;

/** Discriminated union of what a skill run returns. */
export type SkillResult =
  | { skill: "getEmitedInvoices"; invoices: Invoice[] }
  | { skill: "getReceiptInvoices"; invoices: Invoice[] }
  | { skill: "generateCSF"; csf: CSF }
  | { skill: "generateInvoice"; status: "previewed"; preview: InvoicePreview }
  | { skill: "generateInvoice"; status: "issued"; issued: IssuedInvoice }
  | { skill: "extractTicket"; extraction: TicketExtraction };
