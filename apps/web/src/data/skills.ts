import api from '../lib/api';
import { mockSkillResult } from '@sat/events/mocks';
import type { CSF, Invoice, SkillName, SkillResult } from '../types';
import { csfSummary } from '../lib/obligaciones';

/**
 * Data source mode (VITE_DATA_MODE):
 *   mock    → canonical demo dataset only (default; safe for the live demo)
 *   live    → real SAT agent only (POST /skills/:skill/run)
 *   augment → real agent + mock fill, so thin/young accounts still look alive,
 *             with a safe fallback to mock if the agent fails.
 * Components downstream never change — they render the SkillResult union.
 */
type DataMode = 'mock' | 'live' | 'augment';
const MODE: DataMode = (import.meta.env.VITE_DATA_MODE as DataMode) || 'mock';

export interface Caller {
  userId: string;
  credentialId: string;
  rfc: string;
}

/** The canonical demo dataset (single source of truth: @sat/events/mocks). */
function mockFor(skill: SkillName, input: Record<string, unknown> = {}): SkillResult {
  return mockSkillResult(skill, input) as SkillResult;
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

// ── Merge: blend real data with mock so thin accounts still look alive ───────

/** Real first; mock fills the gaps. Deduped by uuid, newest first. */
function mergeInvoices(real: Invoice[], mock: Invoice[]): Invoice[] {
  const seen = new Set(real.map((i) => i.uuid));
  return [...real, ...mock.filter((i) => !seen.has(i.uuid))].sort((a, b) =>
    a.fechaEmision < b.fechaEmision ? 1 : -1,
  );
}

function augmentWithMock(real: SkillResult): SkillResult {
  if (real.skill === 'getEmitedInvoices') {
    const mock = mockFor('getEmitedInvoices');
    if (mock.skill === 'getEmitedInvoices') {
      return { skill: 'getEmitedInvoices', invoices: mergeInvoices(real.invoices, mock.invoices) };
    }
  }
  if (real.skill === 'getReceiptInvoices') {
    const mock = mockFor('getReceiptInvoices');
    if (mock.skill === 'getReceiptInvoices') {
      return { skill: 'getReceiptInvoices', invoices: mergeInvoices(real.invoices, mock.invoices) };
    }
  }
  if (real.skill === 'generateCSF') {
    const mock = mockFor('generateCSF');
    // Keep the real CSF, but fill the régimen % (a SATI estimate the SAT omits).
    const hasPct = real.csf.regimenFiscal.some((r) => r.porcentaje != null);
    if (mock.skill === 'generateCSF') {
      return {
        skill: 'generateCSF',
        csf: hasPct ? real.csf : { ...real.csf, regimenFiscal: mock.csf.regimenFiscal },
      };
    }
  }
  return real;
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

/**
 * Run a SAT skill and return its typed result. The only place that knows where
 * the data comes from — components render the same SkillResult in every mode.
 */
export async function runSkill(
  skill: SkillName,
  input: Record<string, unknown> = {},
  caller?: Caller,
): Promise<SkillResult> {
  if (MODE === 'mock') return mockFor(skill, input);
  if (MODE === 'live') return callLive(skill, input, caller);
  // augment: real + mock; fall back to mock if the agent fails → demo never breaks.
  try {
    return augmentWithMock(await callLive(skill, input, caller));
  } catch {
    return mockFor(skill, input);
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
    default:
      return 'Listo.';
  }
}
