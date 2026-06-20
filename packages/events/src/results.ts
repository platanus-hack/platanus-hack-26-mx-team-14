import { z } from "zod";

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

export const csf = z.object({
  rfc: z.string(),
  nombre: z.string(),
  regimenFiscal: z.array(z.string()),
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

export const invoicePreview = z.object({
  receptorRfc: z.string(),
  conceptos: z.array(z.record(z.unknown())),
  subtotal: z.number(),
  iva: z.number(),
  total: z.number(),
  rawArtifactId: z.string(),
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
  | { skill: "generateInvoice"; status: "issued"; issued: IssuedInvoice };
