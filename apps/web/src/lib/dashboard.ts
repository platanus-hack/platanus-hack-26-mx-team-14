import type { CSF, Invoice, SkillResult } from '../types';

/**
 * The dashboard canvas model. A dashboard is a list of Panels; each query the
 * agent answers turns into one or more panels that ACCUMULATE on the canvas
 * (they don't replace each other). Each panel declares its own size, which the
 * grid turns into a column span — that's what makes the layout voice-editable
 * later ("hazlo más grande" = change the size).
 */

export type PanelSize = 'sm' | 'md' | 'lg' | 'xl';

export interface KpiData {
  value: string;
  sub?: string;
  tone?: 'emerald' | 'amber' | 'red';
}

export type Panel =
  | { id: string; kind: 'csf'; size: PanelSize; title?: string; data: CSF }
  | {
      id: string;
      kind: 'invoices';
      size: PanelSize;
      title?: string;
      data: { invoices: Invoice[]; tipo: 'emitidas' | 'recibidas' };
    }
  | { id: string; kind: 'kpi'; size: PanelSize; title: string; data: KpiData };

let _seq = 0;
const newId = () => `panel-${Date.now()}-${_seq++}`;

const mxn = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);

/**
 * Convert a skill result into one or more panels, each with a sensible default
 * size. This is where "what the agent returned" becomes "what shows on the
 * canvas". Add a case here for each new skill/visualization.
 */
export function resultToPanels(result: SkillResult): Panel[] {
  switch (result.skill) {
    case 'generateCSF':
      return [{ id: newId(), kind: 'csf', size: 'lg', data: result.csf }];

    case 'getEmitedInvoices':
    case 'getReceiptInvoices': {
      const tipo = result.skill === 'getEmitedInvoices' ? 'emitidas' : 'recibidas';
      const vigentes = result.invoices.filter((i) => i.estado === 'Vigente');
      const iva = vigentes.reduce((s, i) => s + (i.iva ?? 0), 0);
      return [
        {
          id: newId(),
          kind: 'kpi',
          size: 'sm',
          title: tipo === 'emitidas' ? 'IVA trasladado' : 'IVA acreditable',
          data: { value: mxn(iva), sub: `${vigentes.length} vigentes`, tone: 'emerald' },
        },
        { id: newId(), kind: 'invoices', size: 'lg', data: { invoices: result.invoices, tipo } },
      ];
    }

    case 'generateInvoice':
      return [
        {
          id: newId(),
          kind: 'kpi',
          size: 'md',
          title: result.status === 'previewed' ? 'Vista previa' : 'Factura emitida',
          data:
            result.status === 'previewed'
              ? { value: mxn(result.preview.total), sub: 'Total a emitir', tone: 'amber' }
              : { value: result.issued.uuid, sub: 'Folio fiscal', tone: 'emerald' },
        },
      ];
  }
}
