import { motion, useReducedMotion } from 'motion/react';
import type { ParsedObligacion, Urgency } from '../lib/obligaciones';

const R = 48;
const SW = 6;
const SZ = (R + SW) * 2 + 2;
const C = 2 * Math.PI * R;

const WINDOW = 30;

const arcStroke: Record<Urgency, string> = {
  overdue: 'oklch(0.65 0.20 25)',
  urgent:  'oklch(0.65 0.20 25)',
  soon:    'oklch(0.78 0.16 75)',
  normal:  'oklch(0.72 0.17 162)',
  unknown: 'oklch(0.40 0.008 257)',
};

const centerCls: Record<Urgency, string> = {
  overdue: 'text-red-300',
  urgent:  'text-red-300',
  soon:    'text-amber-300',
  normal:  'text-emerald',
  unknown: 'text-subtle',
};

export default function ObligacionRings({ obligaciones }: { obligaciones: ParsedObligacion[] }) {
  const reduce = useReducedMotion();

  return (
    <div className="flex flex-wrap gap-8">
      {obligaciones.map((o, i) => {
        const d = o.daysLeft;
        const fill = d == null ? 0 : d <= 0 ? 1 : Math.max(0, 1 - d / WINDOW);
        const filled = C * fill;
        const color = arcStroke[o.urgency];

        return (
          <motion.div
            key={`ring-${o.label}-${i}`}
            className="flex flex-col items-center gap-3"
            initial={reduce ? {} : { opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.06 * i, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="relative" style={{ width: SZ, height: SZ }}>
              <svg width={SZ} height={SZ} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
                <circle
                  cx={SZ / 2} cy={SZ / 2} r={R}
                  fill="none"
                  stroke="oklch(0.22 0.008 257)"
                  strokeWidth={SW}
                />
                <motion.circle
                  cx={SZ / 2} cy={SZ / 2} r={R}
                  fill="none"
                  stroke={color}
                  strokeWidth={SW}
                  strokeLinecap="round"
                  strokeDasharray={C}
                  initial={{ strokeDashoffset: C }}
                  animate={{ strokeDashoffset: C - filled }}
                  transition={{ delay: 0.1 + 0.06 * i, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                <span className={`text-3xl font-semibold leading-none tabular-nums ${centerCls[o.urgency]}`}>
                  {d == null ? '—' : d <= 0 ? '!' : d}
                </span>
                <span className="text-xs text-subtle uppercase tracking-widest">días</span>
              </div>
            </div>
            <div className="text-center" style={{ maxWidth: SZ }}>
              <p className="text-sm font-semibold text-ink leading-snug">{o.label}</p>
              <p className="text-xs text-subtle capitalize mt-0.5">{o.cadence}</p>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
