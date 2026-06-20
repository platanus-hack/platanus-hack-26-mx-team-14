import type { Invoice } from '../types';

/**
 * Demo invoices for the test RFC RAOA0111176P7 — same shape as the
 * getReceiptInvoices / getEmitedInvoices skill output. `recibidasFixture` is the
 * real `getReceiptInvoices` result; `emitidasFixture` mirrors it for the emitidas
 * intent (no real emitidas sample yet). Live data flows in via runSkill() when
 * the backend is wired — the components never change.
 */

/** Real `getReceiptInvoices` result for RAOA0111176P7 (1 factura recibida). */
export const recibidasFixture: Invoice[] = [
  {
    uuid: '70333722-2728-46D5-B255-5835C7756332',
    rfcEmisor: 'ROM240313I36',
    rfcReceptor: 'RAOA0111176P7',
    fechaEmision: '2026-01-30',
    subtotal: 253.45,
    iva: 40.55,
    total: 294,
    estado: 'Vigente',
    tipoComprobante: 'I',
  },
];

/** Facturas emitidas por RAOA0111176P7 (muestra coherente para el intent emitidas). */
export const emitidasFixture: Invoice[] = [
  {
    uuid: 'E7F1F401-3B41-4791-93CB-163BF2140FF6',
    rfcEmisor: 'RAOA0111176P7',
    rfcReceptor: 'XAXX010101000',
    nombreReceptor: 'FACTURA GLOBAL',
    fechaEmision: '2026-01-30',
    subtotal: 11600,
    iva: 1856,
    total: 13456,
    estado: 'Vigente',
    tipoComprobante: 'I',
  },
  {
    uuid: 'A8C2D110-0042-4E5F-9A0B-7C2D3E4F5A11',
    rfcEmisor: 'RAOA0111176P7',
    rfcReceptor: 'ROM240313I36',
    nombreReceptor: 'ROMA SERVICIOS DIGITALES',
    fechaEmision: '2026-01-15',
    subtotal: 5000,
    iva: 800,
    total: 5800,
    estado: 'Vigente',
    tipoComprobante: 'I',
  },
];

/** Back-compat alias used by the recibidas intent. */
export const invoicesFixture = recibidasFixture;
