import { z } from "zod";

/** ---- Skill input schemas (mirror the Anthropic tool schemas in @sat/agent) ---- */

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

export const getEmitedInvoicesInput = z.object({
  from: dateStr,
  to: dateStr,
  rfcReceptor: z.string().optional(),
  estado: z.enum(["Vigente", "Cancelado"]).optional(),
  tipoComprobante: z.enum(["I", "E", "P", "N", "T"]).optional(),
});

export const getReceiptInvoicesInput = z.object({
  from: dateStr,
  to: dateStr,
  rfcEmisor: z.string().optional(),
  estado: z.enum(["Vigente", "Cancelado"]).optional(),
});

export const generateCSFInput = z.object({});

export const conceptoInput = z.object({
  claveProdServ: z.string().optional(),
  descripcion: z.string(),
  claveUnidad: z.string().optional(),
  cantidad: z.number().positive(),
  valorUnitario: z.number().nonnegative(),
  descuento: z.number().nonnegative().default(0),
  objetoImpuesto: z.string().optional(),
  numeroIdentificacion: z.string().optional(),
});

export const generateInvoiceInput = z.object({
  receptor: z.object({
    rfc: z.string(),
    nombreRazonSocial: z.string(),
    codigoPostal: z.string(),
    regimenFiscalReceptor: z.string(),
    usoCFDI: z.string(),
  }),
  conceptos: z.array(conceptoInput).min(1),
  moneda: z.string().default("MXN"),
  tipoCambio: z.number().positive().optional(),
  /**
   * InformacionGlobal — required by CFDI 4.0 when the receptor is the RFC genérico
   * (XAXX010101000 / XEXX010101000), i.e. a factura al público en general.
   */
  facturaGlobal: z
    .object({
      periodicidad: z.string(), // c_Periodicidad: 01 Diario … 05 Bimestral
      meses: z.string(), // c_Meses: 01-12 (o 13-18 bimestres)
      anio: z.number().int(),
    })
    .optional(),
  /** Must be true to actually emit. The agent sets this only after a human "yes". */
  confirmed: z.boolean().default(false),
});

export const extractTicketInput = z.object({
  imageBase64: z.string().min(1),
  imageMediaType: z.string().min(1),
});

export const ticketExtraction = z.object({
  tipoDocumento: z.enum(["ticket", "factura", "nota_venta", "recibo", "otro"]),
  emisor: z
    .object({
      nombre: z.string().optional(),
      rfc: z.string().optional(),
    })
    .optional(),
  fecha: z.string().optional(),
  conceptos: z
    .array(
      z.object({
        descripcion: z.string(),
        cantidad: z.number().positive().default(1),
        valorUnitario: z.number().nonnegative(),
        descuento: z.number().nonnegative().default(0),
      }),
    )
    .min(1),
  subtotal: z.number().optional(),
  iva: z.number().optional(),
  total: z.number(),
  moneda: z.string().default("MXN"),
  observaciones: z.string().optional(),
});

export const skillInput = {
  getEmitedInvoices: getEmitedInvoicesInput,
  getReceiptInvoices: getReceiptInvoicesInput,
  generateCSF: generateCSFInput,
  generateInvoice: generateInvoiceInput,
  extractTicket: extractTicketInput,
} as const;

export type SkillName = keyof typeof skillInput;
export const SKILL_NAMES = Object.keys(skillInput) as SkillName[];

export type GetEmitedInvoicesInput = z.infer<typeof getEmitedInvoicesInput>;
export type GetReceiptInvoicesInput = z.infer<typeof getReceiptInvoicesInput>;
export type GenerateCSFInput = z.infer<typeof generateCSFInput>;
export type GenerateInvoiceInput = z.infer<typeof generateInvoiceInput>;
export type ExtractTicketInput = z.infer<typeof extractTicketInput>;
export type TicketExtraction = z.infer<typeof ticketExtraction>;
export type Concepto = z.infer<typeof conceptoInput>;
