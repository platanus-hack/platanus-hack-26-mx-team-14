import { motion, useReducedMotion } from 'motion/react';
import type { ParsedObligacion, Urgency } from '../lib/obligaciones';
import { formatDueDate } from '../lib/obligaciones';

const HORIZON = 365;

const pipCls: Record<Urgency, string> = {
  overdue: 'bg-red-400',
  urgent:  'bg-red-400',
  soon:    'bg-amber-400',
  normal:  'bg-emerald',
  unknown: 'bg-subtle',
};

const labelCls: Record<Urgency, string> = {
  overdue: 'text-red-300',
  urgent:  'text-red-300',
  soon:    'text-amber-300',
  normal:  'text-emerald',
  unknown: 'text-subtle',
};

export default function ObligacionRibbon({ obligaciones }: { obligaciones: ParsedObligacion[] }) {
  const reduce = useReducedMotion();

  const items = obligaciones
    .filter((o) => o.daysLeft != null)
    .map((o, i) => ({
      ...o,
      pct: Math.max(2, Math.min(95, ((o.daysLeft ?? 0) / HORIZON) * 100)),
      above: i % 2 === 0,
    }));

  return (
    <div className="relative w-full select-none" style={{ height: 160 }} aria-label="Línea de tiempo de obligaciones">
      {/* Axis */}
      <div
        className="absolute inset-x-0"
        style={{ top: 79, height: 1, background: 'oklch(0.28 0.01 257)' }}
        aria-hidden="true"
      />

      {/* Today anchor */}
      <div className="absolute flex flex-col items-center" style={{ left: 0, top: 58 }} aria-hidden="true">
        <div className="w-px h-5" style={{ background: 'oklch(0.40 0.008 257)' }} />
        <span className="text-xs text-subtle mt-1">hoy</span>
      </div>

      {items.map((o, i) => {
        const pip = (
          <div
            className={`w-3 h-3 rounded-full shrink-0 ${pipCls[o.urgency]}`}
            aria-hidden="true"
          />
        );
        const connector = (
          <div
            className="w-px flex-1 min-h-[10px]"
            style={{ background: 'oklch(0.28 0.01 257)' }}
            aria-hidden="true"
          />
        );
        const label = (
          <div className="text-center" style={{ maxWidth: 100 }}>
            <p className={`text-xs font-semibold leading-tight whitespace-nowrap ${labelCls[o.urgency]}`}>
              {o.label}
            </p>
            <p className="text-xs text-subtle whitespace-nowrap mt-0.5">{formatDueDate(o.nextDue)}</p>
          </div>
        );

        return (
          <motion.div
            key={`ribbon-${o.label}-${i}`}
            className="absolute flex flex-col items-center"
            style={{
              left: `${o.pct}%`,
              transform: 'translateX(-50%)',
              top: o.above ? 0 : 81,
              height: 79,
            }}
            initial={reduce ? {} : { opacity: 0, y: o.above ? -5 : 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 * i, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            {o.above ? (
              <>{label}{connector}{pip}</>
            ) : (
              <>{pip}{connector}{label}</>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
