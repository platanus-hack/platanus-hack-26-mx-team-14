import { motion } from 'motion/react';
import type { KpiItem } from '../types';

const TONE = {
  emerald: { value: 'oklch(0.72 0.17 162)', bg: 'oklch(0.72 0.17 162 / 0.08)', border: 'oklch(0.72 0.17 162 / 0.20)' },
  amber:   { value: 'oklch(0.82 0.16 80)',  bg: 'oklch(0.82 0.16 80  / 0.08)', border: 'oklch(0.82 0.16 80  / 0.20)' },
  red:     { value: 'oklch(0.65 0.19 25)',  bg: 'oklch(0.65 0.19 25  / 0.08)', border: 'oklch(0.65 0.19 25  / 0.20)' },
};
const DEFAULT_TONE = { value: 'oklch(0.96 0.003 257)', bg: 'oklch(0.22 0.008 257)', border: 'oklch(0.28 0.008 257)' };

interface KpisGridProps {
  title?: string;
  kpis: KpiItem[];
}

export default function KpisGrid({ title, kpis }: KpisGridProps) {
  const cols = Math.min(kpis.length, 3);

  return (
    <div className="w-full space-y-3">
      {title && <p className="text-sm font-semibold text-ink tracking-tight">{title}</p>}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {kpis.map((kpi, i) => {
          const t = kpi.tone ? TONE[kpi.tone] : DEFAULT_TONE;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-xl p-4 flex flex-col gap-1.5"
              style={{ background: t.bg, border: `1px solid ${t.border}` }}
            >
              <p className="text-[11px] font-medium text-muted truncate">{kpi.title}</p>
              <p
                className="text-xl font-semibold font-mono tabular-nums leading-none truncate"
                style={{ color: t.value }}
              >
                {kpi.value}
              </p>
              {kpi.sub && (
                <p className="text-[10px] text-subtle leading-tight">{kpi.sub}</p>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
