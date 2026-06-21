import { useMemo } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { CalendarClock, CalendarPlus, MapPin, AlertTriangle, BadgeCheck, FileText } from 'lucide-react';
import type { CSF } from '../types';
import {
  parseObligaciones,
  formatDueDate,
  regimenShort,
  type Urgency,
} from '../lib/obligaciones';
import ObligacionRings from './ObligacionRings';
import ObligacionRibbon from './ObligacionRibbon';
import type { ParsedObligacion } from '../lib/obligaciones';

function icsDate(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('');
}

function exportToICS(obligaciones: ParsedObligacion[], nombre: string) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SATI//Obligaciones Fiscales//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const o of obligaciones) {
    if (!o.nextDue) continue;
    const start = icsDate(o.nextDue);
    const nextDay = new Date(o.nextDue);
    nextDay.setDate(nextDay.getDate() + 1);
    const end = icsDate(nextDay);
    const uid = `sati-${o.label.toLowerCase().replace(/\s+/g, '-')}-${start}@sati.mx`;

    lines.push(
      'BEGIN:VEVENT',
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${o.label} — Vencimiento fiscal`,
      `DESCRIPTION:Obligación: ${o.label} (${o.cadence})\\nContribuyente: ${nombre}`,
      `UID:${uid}`,
      'BEGIN:VALARM',
      'TRIGGER:-P2D',
      'ACTION:DISPLAY',
      `DESCRIPTION:Recordatorio: ${o.label} vence en 2 días`,
      'END:VALARM',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'obligaciones-fiscales.ics';
  a.click();
  URL.revokeObjectURL(url);
}

interface CsfCardProps {
  csf: CSF;
}

/** Semantic styling per urgency — color carries meaning, not decoration. */
const urgency: Record<Urgency, { dot: string; text: string; ring: string; bg: string }> = {
  overdue: { dot: 'bg-red-400',   text: 'text-red-300',   ring: 'border-red-500/40',   bg: 'bg-red-950/30' },
  urgent:  { dot: 'bg-red-400',   text: 'text-red-300',   ring: 'border-red-500/40',   bg: 'bg-red-950/30' },
  soon:    { dot: 'bg-amber-400', text: 'text-amber-300', ring: 'border-amber-500/40', bg: 'bg-amber-950/30' },
  normal:  { dot: 'bg-emerald',   text: 'text-emerald',   ring: 'border-border',       bg: 'bg-surface' },
  unknown: { dot: 'bg-subtle',    text: 'text-subtle',    ring: 'border-border',       bg: 'bg-surface' },
};

export default function CsfCard({ csf }: CsfCardProps) {
  const reduce = useReducedMotion();
  // Parse once; sorted soonest-first. The first item is the hero.
  const obligaciones = useMemo(() => parseObligaciones(csf.obligaciones), [csf.obligaciones]);
  const next = obligaciones[0];
  const heroStyle = urgency[next?.urgency ?? 'unknown'];

  // A régimen is "active" if the obligations reference it (drives the layout).
  const isActive = (regimen: string) => {
    if (regimenShort(regimen).toLowerCase() === 'resico') {
      return csf.obligaciones.some((o) =>
        o.descripcion.toLowerCase().includes('simplificado de confianza'),
      );
    }
    return false;
  };

  const fade = reduce ? {} : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 } };

  return (
    <motion.div
      {...fade}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="w-full grid gap-4"
      role="region"
      aria-label="Constancia de Situación Fiscal"
    >
      {/* ── Context header ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-1">
        <FileText size={15} className="text-emerald" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-ink tracking-tight">
          Constancia de Situación Fiscal
        </h2>
      </div>

      {/* ── HERO: próximo vencimiento ─────────────────────────────── */}
      {next && (
        <div className={`rounded-2xl border p-6 ${heroStyle.ring} ${heroStyle.bg}`}>
          <div className="flex items-center gap-2 mb-4">
            {next.urgency === 'overdue' || next.urgency === 'urgent' ? (
              <AlertTriangle size={14} className={heroStyle.text} aria-hidden="true" />
            ) : (
              <CalendarClock size={14} className={heroStyle.text} aria-hidden="true" />
            )}
            <span className={`text-[11px] font-semibold tracking-widest uppercase ${heroStyle.text}`}>
              Próximo vencimiento
            </span>
          </div>
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm text-muted mb-1.5">{next.label}</p>
              <p className="text-4xl sm:text-5xl font-semibold text-ink tracking-tight leading-none">
                {formatDueDate(next.nextDue)}
              </p>
            </div>
            <motion.div
              {...(reduce ? {} : { initial: { opacity: 0, scale: 0.9 }, animate: { opacity: 1, scale: 1 } })}
              transition={{ delay: 0.15, duration: 0.3 }}
              className={`shrink-0 text-center px-4 py-2 rounded-xl border ${heroStyle.ring}`}
            >
              <p className={`text-base font-semibold leading-tight ${heroStyle.text}`}>
                {next.countdown}
              </p>
            </motion.div>
          </div>
        </div>
      )}

      {/* ── IDENTIDAD FISCAL ──────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <p className="text-lg font-semibold text-ink tracking-tight">{csf.nombre}</p>
        <p className="text-xs text-muted font-mono mt-1">{csf.rfc}</p>

        <div className="flex flex-wrap gap-2 mt-4" aria-label="Regímenes fiscales">
          {csf.regimenFiscal.map((r) => {
            const active = isActive(r.nombre);
            return (
              <span
                key={r.nombre}
                title={r.porcentaje != null ? `${r.nombre} (${r.porcentaje}%)` : r.nombre}
                className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border ${
                  active
                    ? 'border-emerald/40 text-emerald bg-emerald-lo'
                    : 'border-border text-muted bg-surface-hi'
                }`}
              >
                {active && <BadgeCheck size={12} aria-hidden="true" />}
                {regimenShort(r.nombre)}
                {r.porcentaje != null && (
                  <span className="text-subtle font-normal">· {r.porcentaje}%</span>
                )}
              </span>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 mt-4 text-xs text-muted">
          <MapPin size={13} className="text-subtle shrink-0" aria-hidden="true" />
          <span>
            {[
              csf.domicilioFiscal.colonia,
              csf.domicilioFiscal.municipio,
              csf.domicilioFiscal.entidad,
              `CP ${csf.domicilioFiscal.codigoPostal}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
      </div>

      {/* ── OBLIGACIONES: rings + ribbon ─────────────────────────── */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between mb-5">
          <p className="text-sm font-semibold text-ink">Tus obligaciones</p>
          <button
            type="button"
            onClick={() => exportToICS(obligaciones, csf.nombre)}
            className="flex items-center gap-1.5 text-[11px] text-muted hover:text-emerald transition-colors"
            aria-label="Exportar obligaciones al calendario"
          >
            <CalendarPlus size={13} aria-hidden="true" />
            Exportar al calendario
          </button>
        </div>
        <ObligacionRings obligaciones={obligaciones} />
        <div className="mt-6 pt-5" style={{ borderTop: '1px solid oklch(0.22 0.008 257 / 0.5)' }}>
          <ObligacionRibbon obligaciones={obligaciones} />
        </div>
      </div>
    </motion.div>
  );
}
