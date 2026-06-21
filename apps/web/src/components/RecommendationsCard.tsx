import { motion } from 'motion/react';
import { AlertTriangle, TrendingUp, Info } from 'lucide-react';
import type { RecommendationItem } from '../types';

const PRIORITY = {
  high: {
    label: 'Alta prioridad',
    icon: AlertTriangle,
    bar: 'oklch(0.65 0.19 35)',
    bg: 'oklch(0.65 0.19 35 / 0.08)',
    border: 'oklch(0.65 0.19 35 / 0.25)',
    text: 'oklch(0.82 0.14 35)',
  },
  medium: {
    label: 'Media',
    icon: TrendingUp,
    bar: 'oklch(0.70 0.15 80)',
    bg: 'oklch(0.70 0.15 80 / 0.08)',
    border: 'oklch(0.70 0.15 80 / 0.25)',
    text: 'oklch(0.84 0.12 80)',
  },
  low: {
    label: 'Informativo',
    icon: Info,
    bar: 'oklch(0.62 0.16 240)',
    bg: 'oklch(0.62 0.16 240 / 0.08)',
    border: 'oklch(0.62 0.16 240 / 0.25)',
    text: 'oklch(0.78 0.12 240)',
  },
};

interface RecommendationsCardProps {
  title?: string;
  recommendations: RecommendationItem[];
}

export default function RecommendationsCard({ title = 'Recomendaciones fiscales', recommendations }: RecommendationsCardProps) {
  return (
    <div className="w-full rounded-2xl border border-border bg-surface p-5 space-y-4">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-ink tracking-tight">{title}</p>
        <span
          className="text-[10px] font-medium px-2 py-0.5 rounded-full"
          style={{ background: 'oklch(0.72 0.17 162 / 0.12)', color: 'oklch(0.72 0.17 162)' }}
        >
          {recommendations.length}
        </span>
      </div>

      <div className="space-y-3">
        {recommendations.map((rec, i) => {
          const p = PRIORITY[rec.priority];
          const Icon = p.icon;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.07, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-xl p-4 space-y-2"
              style={{ background: p.bg, border: `1px solid ${p.border}` }}
            >
              <div className="flex items-start gap-2.5">
                <Icon size={14} style={{ color: p.bar, marginTop: 2, flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[13px] font-semibold text-ink">{rec.title}</p>
                    <span
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                      style={{ background: `${p.bar}22`, color: p.text }}
                    >
                      {p.label}
                    </span>
                  </div>
                  <p className="text-xs text-muted mt-1 leading-relaxed">{rec.detail}</p>
                </div>
              </div>
              {rec.action && (
                <div
                  className="rounded-lg px-3 py-2 text-[11px] font-medium"
                  style={{ background: `${p.bar}15`, color: p.text }}
                >
                  → {rec.action}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
