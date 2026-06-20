import api from '../lib/api';
import type { SkillName, SkillResult } from '../types';
import { csfSummary } from '../lib/obligaciones';
import { csfFixture } from './csf';
import { emitidasFixture, recibidasFixture } from './invoices';

/**
 * Single switch for the whole front↔back connection.
 * TODAY: `true` → components render anonymized fixtures (real shape).
 * WHEN THE BACKEND SKILLS ARE LIVE: flip to `false` → runSkill() hits
 *   POST /skills/:skill/run and the SAME components render real SAT data.
 * (Can also be driven by an env flag: import.meta.env.VITE_USE_FIXTURES.)
 */
const USE_FIXTURES = true;

export interface Caller {
  userId: string;
  credentialId: string;
  rfc: string;
}

/**
 * Run a SAT skill and return its typed result. The components downstream never
 * change between fixture and live — they render the `SkillResult` union, which
 * is identical in both modes. This function is the only place that knows where
 * the data comes from.
 */
export async function runSkill(
  skill: SkillName,
  input: Record<string, unknown> = {},
  caller?: Caller,
): Promise<SkillResult> {
  if (USE_FIXTURES) return fixtureFor(skill);

  const { data } = await api.post(`/skills/${skill}/run`, {
    userId: caller?.userId,
    credentialId: caller?.credentialId,
    rfc: caller?.rfc,
    input,
  });
  return data.result as SkillResult;
}

function fixtureFor(skill: SkillName): SkillResult {
  switch (skill) {
    case 'generateCSF':
      return { skill: 'generateCSF', csf: csfFixture };
    case 'getEmitedInvoices':
      return { skill: 'getEmitedInvoices', invoices: emitidasFixture };
    case 'getReceiptInvoices':
      return { skill: 'getReceiptInvoices', invoices: recibidasFixture };
    case 'generateInvoice':
      return {
        skill: 'generateInvoice',
        status: 'previewed',
        preview: {
          receptorRfc: 'XAXX010101000',
          conceptos: [
            {
              claveProdServ: '01010101',
              descripcion: 'Prueba',
              claveUnidad: 'H87',
              cantidad: 1,
              valorUnitario: 11600,
              descuento: 0,
              objetoImpuesto: '02',
            },
          ],
          subtotal: 11600,
          iva: 1856,
          total: 13456,
          rawArtifactId: 'e7f1f401-3b41-4791-93cb-163bf2140ff6',
        },
      };
  }
}

/** Map a natural-language request to a skill (simple intent detection). */
export function detectSkill(text: string): SkillName {
  const t = text.toLowerCase();
  // Constancia / régimen / obligaciones → CSF
  if (/constancia|csf|r[eé]gimen|situaci[oó]n fiscal|obligaci|vencimiento|domicilio fiscal/.test(t)) {
    return 'generateCSF';
  }
  // CREAR una factura nueva (verbo de creación + "factura/cfdi", o "facturar a …").
  // Va antes que la consulta de facturas para no confundirse con "facturas emitidas".
  if (
    /(gen[eé]r|emit|crea|elabor|haz|saca|nueva|quier|necesit|dame)[^.]{0,18}\b(factura|cfdi)\b/.test(t) ||
    /facturar\b/.test(t)
  ) {
    return 'generateInvoice';
  }
  // Consultar facturas recibidas (de proveedores / lo que me facturaron).
  if (/recibid|me factur|proveedor/.test(t)) return 'getReceiptInvoices';
  // Consultar facturas emitidas / ingresos.
  if (/emit|factura|cfdi|ingreso/.test(t)) return 'getEmitedInvoices';
  return 'generateCSF';
}

const mxn = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);

/** A short, speakable reply derived from the result (for the orb). */
export function replyFor(result: SkillResult): string {
  switch (result.skill) {
    case 'generateCSF':
      return csfSummary(result.csf);
    case 'getEmitedInvoices':
    case 'getReceiptInvoices': {
      const tipo = result.skill === 'getEmitedInvoices' ? 'emitidas' : 'recibidas';
      const vigentes = result.invoices.filter((i) => i.estado === 'Vigente');
      const total = vigentes.reduce((s, i) => s + i.total, 0);
      const n = result.invoices.length;
      return `Encontré ${n} factura${n === 1 ? '' : 's'} ${tipo}, por un total de ${mxn(total)}.`;
    }
    case 'generateInvoice':
      return result.status === 'previewed'
        ? `Tu vista previa está lista: total ${mxn(result.preview.total)}. ¿La emito?`
        : `Factura emitida con folio ${result.issued.uuid}.`;
  }
}
