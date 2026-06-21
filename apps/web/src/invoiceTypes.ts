// Invoice (CFDI) result shapes — mirror of packages/events/src/results.ts.
// The web app doesn't import the backend package; this is the shared contract.
// KEEP IN SYNC with packages/events/src/results.ts.

export interface Invoice {
  uuid: string;
  rfcEmisor: string;
  rfcReceptor: string;
  nombreEmisor?: string;
  nombreReceptor?: string;
  /** ISO date string */
  fechaEmision: string;
  total: number;
  subtotal: number;
  iva?: number;
  estado: 'Vigente' | 'Cancelado';
  tipoComprobante: 'I' | 'E' | 'P' | 'N' | 'T';
}

export interface InvoiceResult {
  kind: 'emitidas' | 'recibidas';
  invoices: Invoice[];
  /** Inclusive ISO date range the query covered. */
  from: string;
  to: string;
}

// Discriminated union returned by /agent/turn as `toolResult`.
// Import CSF from ./types to avoid duplicating the definition.
import type { CSF } from './types';
export type ToolResult =
  | { type: 'invoices'; data: InvoiceResult }
  | { type: 'csf'; data: CSF };
