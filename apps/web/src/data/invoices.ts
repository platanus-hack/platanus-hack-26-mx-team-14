import type { Invoice } from '../types';

/**
 * Anonymized demo invoices — same shape as the getEmitedInvoices /
 * getReceiptInvoices skill output. Used to build the visualization against the
 * real shape; the live data flows in via runSkill() when the backend is wired.
 */
export const invoicesFixture: Invoice[] = [
  {
    uuid: 'A1B2C3D4-0001-4E5F-9A0B-1C2D3E4F5A60',
    rfcEmisor: 'PEMJ900315H40',
    rfcReceptor: 'ACO050101AB1',
    nombreReceptor: 'ACME CONSULTORÍA SA DE CV',
    fechaEmision: '2026-05-22T10:15:00Z',
    subtotal: 15000,
    iva: 2400,
    total: 17400,
    estado: 'Vigente',
    tipoComprobante: 'I',
  },
  {
    uuid: 'A1B2C3D4-0002-4E5F-9A0B-1C2D3E4F5A61',
    rfcEmisor: 'PEMJ900315H40',
    rfcReceptor: 'DIG180920QX3',
    nombreReceptor: 'DIGITAL HOUSE MX SA DE CV',
    fechaEmision: '2026-05-18T09:00:00Z',
    subtotal: 8500,
    iva: 1360,
    total: 9860,
    estado: 'Vigente',
    tipoComprobante: 'I',
  },
  {
    uuid: 'A1B2C3D4-0003-4E5F-9A0B-1C2D3E4F5A62',
    rfcEmisor: 'PEMJ900315H40',
    rfcReceptor: 'TEC110704RM8',
    nombreReceptor: 'TECNOLOGÍAS NORTE SA DE CV',
    fechaEmision: '2026-05-15T16:40:00Z',
    subtotal: 6000,
    iva: 960,
    total: 6960,
    estado: 'Cancelado',
    tipoComprobante: 'I',
  },
  {
    uuid: 'A1B2C3D4-0004-4E5F-9A0B-1C2D3E4F5A63',
    rfcEmisor: 'PEMJ900315H40',
    rfcReceptor: 'ACO050101AB1',
    nombreReceptor: 'ACME CONSULTORÍA SA DE CV',
    fechaEmision: '2026-05-08T11:25:00Z',
    subtotal: 12000,
    iva: 1920,
    total: 13920,
    estado: 'Vigente',
    tipoComprobante: 'I',
  },
];
