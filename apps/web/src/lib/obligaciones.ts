import type { CSF, Obligacion } from '../types';

/**
 * The brain of the CSF visualization.
 *
 * SAT obligations arrive as free legal text in `vencimiento`, e.g.
 *   "A más tardar el día 17 del mes de calendario inmediato posterior a aquél..."
 *   "A más tardar el día 30 del mes de abril del ejercicio siguiente"
 * A raw render is useless. This module turns each obligation into a concrete
 * next-due date, a human countdown, and an urgency level — the thing an
 * accountant actually does. That transform IS the product value.
 */

export type Urgency = 'overdue' | 'urgent' | 'soon' | 'normal' | 'unknown';
export type Cadence = 'mensual' | 'anual' | 'variable';

export interface ParsedObligacion {
  raw: Obligacion;
  /** Short label derived from descripcion, e.g. "ISR mensual". */
  label: string;
  /** Concrete next due date, or null if not parseable. */
  nextDue: Date | null;
  /** Whole days from today to nextDue (negative = overdue), or null. */
  daysLeft: number | null;
  /** Human countdown: "en 27 días" | "hoy" | "vencido hace 3 días". */
  countdown: string;
  urgency: Urgency;
  cadence: Cadence;
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Detect cadence from the description (the impuesto cadence lives there). */
function detectCadence(desc: string, venc: string): Cadence {
  const t = `${desc} ${venc}`.toLowerCase();
  if (/\bmensual\b/.test(t)) return 'mensual';
  if (/\banual\b|declaraci[oó]n anual|ejercicio siguiente/.test(t)) return 'anual';
  if (/posterior|mes inmediato|mes siguiente/.test(t)) return 'mensual';
  return 'variable';
}

/** Concise label: impuesto + cadence, e.g. "ISR mensual", "IVA mensual". */
function buildLabel(desc: string, cadence: Cadence): string {
  const t = desc.toLowerCase();
  const impuesto =
    /\bisr\b/.test(t) ? 'ISR' :
    /\biva\b/.test(t) ? 'IVA' :
    /\bieps\b/.test(t) ? 'IEPS' :
    /\bdiot\b/.test(t) ? 'DIOT' : null;
  const cad = cadence === 'variable' ? '' : cadence;
  if (impuesto) return `${impuesto}${cad ? ` ${cad}` : ''}`;
  // Fallback: first clause, trimmed of the "Régimen…" tail.
  return desc.split('.')[0].replace(/\s+/g, ' ').trim().slice(0, 32);
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Build a due date, clamping the day to the month's real last day. */
function dueOn(year: number, month: number, day: number): Date {
  return new Date(year, month, Math.min(day, lastDayOfMonth(year, month)));
}

/** Compute the next concrete due date from the vencimiento text. */
function computeNextDue(venc: string, cadence: Cadence, now: Date): Date | null {
  const t = venc.toLowerCase();
  const dayMatch = t.match(/d[ií]a\s+(\d{1,2})/);
  const day = dayMatch ? parseInt(dayMatch[1], 10) : null;
  if (!day) return null;

  const today = startOfDay(now);

  if (cadence === 'anual') {
    // Named month → that month/day, next occurrence on/after today.
    const monthIdx = MESES.findIndex((m) => t.includes(m));
    if (monthIdx < 0) return null;
    let due = dueOn(now.getFullYear(), monthIdx, day);
    if (due < today) due = dueOn(now.getFullYear() + 1, monthIdx, day);
    return due;
  }

  // Monthly: next occurrence of `day` this month, else next month.
  let due = dueOn(now.getFullYear(), now.getMonth(), day);
  if (due < today) due = dueOn(now.getFullYear(), now.getMonth() + 1, day);
  return due;
}

function daysBetween(from: Date, to: Date): number {
  const ms = startOfDay(to).getTime() - startOfDay(from).getTime();
  return Math.round(ms / 86_400_000);
}

function buildCountdown(daysLeft: number | null): string {
  if (daysLeft == null) return 'fecha variable';
  if (daysLeft === 0) return 'hoy';
  if (daysLeft === 1) return 'mañana';
  if (daysLeft > 0) return `en ${daysLeft} días`;
  const overdue = Math.abs(daysLeft);
  return overdue === 1 ? 'vencido ayer' : `vencido hace ${overdue} días`;
}

function classifyUrgency(daysLeft: number | null): Urgency {
  if (daysLeft == null) return 'unknown';
  if (daysLeft < 0) return 'overdue';
  if (daysLeft <= 7) return 'urgent';
  if (daysLeft <= 30) return 'soon';
  return 'normal';
}

/** Parse one obligation. `now` is injectable for tests/determinism. */
export function parseObligacion(raw: Obligacion, now: Date = new Date()): ParsedObligacion {
  const desc = raw.descripcion ?? '';
  const venc = raw.vencimiento ?? '';
  const cadence = detectCadence(desc, venc);
  const nextDue = computeNextDue(venc, cadence, now);
  const daysLeft = nextDue ? daysBetween(now, nextDue) : null;
  return {
    raw,
    label: buildLabel(desc, cadence),
    nextDue,
    daysLeft,
    countdown: buildCountdown(daysLeft),
    urgency: classifyUrgency(daysLeft),
    cadence,
  };
}

/** Parse all obligations, sorted by soonest due first (unknown dates last). */
export function parseObligaciones(
  obligaciones: Obligacion[],
  now: Date = new Date(),
): ParsedObligacion[] {
  return obligaciones
    .map((o) => parseObligacion(o, now))
    .sort((a, b) => {
      if (a.nextDue && b.nextDue) return a.nextDue.getTime() - b.nextDue.getTime();
      if (a.nextDue) return -1;
      if (b.nextDue) return 1;
      return 0;
    });
}

const FMT = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long' });
/** "17 de julio" — es-MX, no year (clean). */
export function formatDueDate(d: Date | null): string {
  return d ? FMT.format(d) : '—';
}

/** A short, speakable summary derived from the CSF — for the assistant reply. */
export function csfSummary(csf: CSF): string {
  const regimen = csf.regimenFiscal.map((r) => regimenShort(r.nombre)).join(' y ');
  const next = parseObligaciones(csf.obligaciones)[0];
  if (next && next.nextDue) {
    return `Tu régimen es ${regimen}. Tu próximo vencimiento es ${next.label} el ${formatDueDate(next.nextDue)}, ${next.countdown}.`;
  }
  return `Tu régimen es ${regimen}. Aquí está tu información fiscal.`;
}

/** Short, human régimen label for badges. */
export function regimenShort(regimen: string): string {
  const t = regimen.toLowerCase();
  if (t.includes('simplificado de confianza')) return 'RESICO';
  if (t.includes('sueldos y salarios')) return 'Sueldos y Salarios';
  if (t.includes('actividad empresarial')) return 'Actividad Empresarial';
  if (t.includes('arrendamiento')) return 'Arrendamiento';
  if (t.includes('personas morales') || t.includes('persona moral')) return 'Persona Moral';
  return regimen.length > 28 ? `${regimen.slice(0, 28)}…` : regimen;
}
