import { motion } from 'motion/react';
import { TrendingUp, TrendingDown, Scale } from 'lucide-react';
import type { FiscalSummarySpec } from '../types';

const mxn = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n);

interface FiscalSummaryCardProps {
  summary: FiscalSummarySpec;
}

export default function FiscalSummaryCard({ summary }: FiscalSummaryCardProps) {
  const { period, ingresos, gastos, balance, ivaFavor, isrEstimado } = summary;
  const total = ingresos + gastos;
  const ingPct = total > 0 ? (ingresos / total) * 100 : 50;
  const isPositive = balance >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="w-full rounded-2xl border border-border bg-surface p-5 space-y-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-ink tracking-tight">Resumen fiscal</p>
        <span className="text-xs text-muted px-2.5 py-1 rounded-full border border-border">{period}</span>
      </div>

      {/* Main three metrics */}
      <div className="grid grid-cols-3 gap-3">
        {/* Ingresos */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <TrendingUp size={12} style={{ color: 'oklch(0.72 0.17 162)' }} />
            <span className="text-[10px] font-medium text-muted">Ingresos</span>
          </div>
          <p className="text-base font-semibold font-mono tabular-nums leading-none" style={{ color: 'oklch(0.72 0.17 162)' }}>
            {mxn(ingresos)}
          </p>
        </div>
        {/* Gastos */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <TrendingDown size={12} style={{ color: 'oklch(0.65 0.19 35)' }} />
            <span className="text-[10px] font-medium text-muted">Gastos</span>
          </div>
          <p className="text-base font-semibold font-mono tabular-nums leading-none" style={{ color: 'oklch(0.65 0.19 35)' }}>
            {mxn(gastos)}
          </p>
        </div>
        {/* Balance */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Scale size={12} style={{ color: isPositive ? 'oklch(0.72 0.17 162)' : 'oklch(0.65 0.19 25)' }} />
            <span className="text-[10px] font-medium text-muted">Balance</span>
          </div>
          <p
            className="text-base font-semibold font-mono tabular-nums leading-none"
            style={{ color: isPositive ? 'oklch(0.72 0.17 162)' : 'oklch(0.65 0.19 25)' }}
          >
            {isPositive ? '+' : ''}{mxn(balance)}
          </p>
        </div>
      </div>

      {/* Progress bar ingresos vs gastos */}
      <div className="space-y-1.5">
        <div className="h-2.5 rounded-full overflow-hidden flex" style={{ background: 'oklch(0.20 0.008 257)' }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: 'oklch(0.72 0.17 162)' }}
            initial={{ width: 0 }}
            animate={{ width: `${ingPct}%` }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          />
          <motion.div
            className="h-full rounded-full"
            style={{ background: 'oklch(0.65 0.19 35)' }}
            initial={{ width: 0 }}
            animate={{ width: `${100 - ingPct}%` }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted">
          <span>{ingPct.toFixed(0)}% ingresos</span>
          <span>{(100 - ingPct).toFixed(0)}% gastos</span>
        </div>
      </div>

      {/* Optional tax estimates */}
      {(ivaFavor !== undefined || isrEstimado !== undefined) && (
        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border">
          {ivaFavor !== undefined && (
            <div className="space-y-1">
              <p className="text-[10px] text-muted">IVA a favor</p>
              <p className="text-sm font-semibold font-mono tabular-nums" style={{ color: 'oklch(0.72 0.17 162)' }}>
                {mxn(ivaFavor)}
              </p>
            </div>
          )}
          {isrEstimado !== undefined && (
            <div className="space-y-1">
              <p className="text-[10px] text-muted">ISR estimado</p>
              <p className="text-sm font-semibold font-mono tabular-nums" style={{ color: 'oklch(0.82 0.16 80)' }}>
                {mxn(isrEstimado)}
              </p>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
