import api from '../lib/api';
import type { CSF, SkillName, SkillResult } from '../types';
import { csfSummary } from '../lib/obligaciones';

export interface Caller {
  userId: string;
  credentialId: string;
  rfc: string;
}

// ── Adapters: make raw agent output safe for the components ──────────────────

/** Real SAT CSF returns regimenFiscal as string[]; components want objects. */
function normalizeCSF(csf: CSF): CSF {
  const reg = csf.regimenFiscal as unknown as Array<string | { nombre: string; porcentaje?: number }>;
  const regimenFiscal = (reg ?? []).map((r) => (typeof r === 'string' ? { nombre: r } : r));
  return { ...csf, regimenFiscal };
}

function normalize(result: SkillResult): SkillResult {
  return result.skill === 'generateCSF'
    ? { skill: 'generateCSF', csf: normalizeCSF(result.csf) }
    : result;
}

async function callLive(
  skill: SkillName,
  input: Record<string, unknown>,
  caller?: Caller,
): Promise<SkillResult> {
  const { data } = await api.post(`/skills/${skill}/run`, {
    userId: caller?.userId,
    credentialId: caller?.credentialId,
    rfc: caller?.rfc,
    input,
  });
  return normalize(data.result as SkillResult);
}

export async function runSkill(
  skill: SkillName,
  input: Record<string, unknown> = {},
  caller?: Caller,
): Promise<SkillResult> {
  return callLive(skill, input, caller);
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
    default:
      return 'Listo.';
  }
}
