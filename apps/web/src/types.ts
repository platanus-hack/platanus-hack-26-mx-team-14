export type Page = 'landing' | 'auth' | 'dashboard';
export type AuthTab = 'login' | 'signup';
export type AuthStep = 1 | 2;
export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

// ── Skill result shapes ──────────────────────────────────────────────────
// Mirror of @sat/events (packages/events/src/results.ts). The web app doesn't
// import the backend package, so this is the shared contract for the dashboard.
// KEEP IN SYNC with packages/events/src/results.ts.
export interface Obligacion {
  descripcion: string;
  fechaInicio?: string;
  vencimiento?: string;
}

export interface CSF {
  rfc: string;
  nombre: string;
  regimenFiscal: string[];
  domicilioFiscal: {
    codigoPostal: string;
    entidad?: string;
    municipio?: string;
    colonia?: string;
  };
  obligaciones: Obligacion[];
  pdfArtifactId: string;
}

export interface Invoice {
  uuid: string; // folio fiscal
  rfcEmisor: string;
  rfcReceptor: string;
  nombreEmisor?: string;
  nombreReceptor?: string;
  fechaEmision: string; // ISO
  subtotal: number;
  iva?: number;
  total: number;
  estado: 'Vigente' | 'Cancelado';
  tipoComprobante: 'I' | 'E' | 'P' | 'N' | 'T';
}

export interface InvoicePreview {
  receptorRfc: string;
  conceptos: Record<string, unknown>[];
  subtotal: number;
  iva: number;
  total: number;
  rawArtifactId: string;
}

export interface IssuedInvoice {
  uuid: string;
  pdfArtifactId?: string;
  xmlArtifactId?: string;
}

export type SkillName =
  | 'getEmitedInvoices'
  | 'getReceiptInvoices'
  | 'generateCSF'
  | 'generateInvoice';

/** Discriminated union of what a skill run returns (mirror @sat/events). */
export type SkillResult =
  | { skill: 'getEmitedInvoices'; invoices: Invoice[] }
  | { skill: 'getReceiptInvoices'; invoices: Invoice[] }
  | { skill: 'generateCSF'; csf: CSF }
  | { skill: 'generateInvoice'; status: 'previewed'; preview: InvoicePreview }
  | { skill: 'generateInvoice'; status: 'issued'; issued: IssuedInvoice };
