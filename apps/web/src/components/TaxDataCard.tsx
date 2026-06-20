import { TrendingDown, TrendingUp, FileText, Download } from 'lucide-react';
import { motion } from 'motion/react';

interface TaxSummary {
  ivaFavor: number;
  isrEstimado: number;
  month: string;
}

interface Invoice {
  id: string;
  description: string;
  amount: number;
  date: string;
}

interface TaxDataCardProps {
  tax: TaxSummary;
  invoices: Invoice[];
}

const fmt = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);

export default function TaxDataCard({ tax, invoices }: TaxDataCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-2xl mx-auto grid gap-3"
      role="region"
      aria-label="Resumen fiscal"
    >
      {/* Tax summary card */}
      <div className="bg-surface rounded-xl p-5 border border-border">
        <p className="text-xs font-medium text-muted mb-4">
          Resumen Fiscal · {tax.month}
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-emerald">
              <TrendingUp size={16} aria-hidden="true" />
              <span className="text-xs font-medium text-muted">IVA a favor</span>
            </div>
            <p className="text-2xl font-semibold text-ink tracking-tight">
              {fmt(tax.ivaFavor)}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-amber-400">
              <TrendingDown size={16} aria-hidden="true" />
              <span className="text-xs font-medium text-muted">ISR estimado</span>
            </div>
            <p className="text-2xl font-semibold text-ink tracking-tight">
              {fmt(tax.isrEstimado)}
            </p>
          </div>
        </div>

        {/* Simple bar visual */}
        <div className="mt-4 pt-4 border-t border-border">
          <div className="flex items-center gap-2 text-xs text-muted mb-2">
            Balance neto
          </div>
          <div className="flex h-2 rounded-full overflow-hidden bg-border">
            <div
              className="bg-emerald transition-all duration-700"
              style={{ width: `${(tax.ivaFavor / (tax.ivaFavor + tax.isrEstimado)) * 100}%` }}
            />
            <div
              className="bg-amber-400 transition-all duration-700"
              style={{ width: `${(tax.isrEstimado / (tax.ivaFavor + tax.isrEstimado)) * 100}%` }}
            />
          </div>
          <div className="flex justify-between mt-1.5 text-[11px] text-muted">
            <span>IVA a favor</span>
            <span>ISR a pagar</span>
          </div>
        </div>
      </div>

      {/* Invoices card */}
      <div className="bg-surface rounded-xl p-5 border border-border">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-medium text-muted">
            Facturas emitidas · Este mes
          </p>
          <span className="text-xs text-emerald font-medium">{invoices.length} CFDI</span>
        </div>
        <ul className="flex flex-col gap-2.5" role="list">
          {invoices.map((inv) => (
            <li
              key={inv.id}
              className="flex items-center gap-3 py-2 border-b border-border last:border-0"
            >
              <FileText size={15} className="shrink-0 text-subtle" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-ink truncate">{inv.description}</p>
                <p className="text-xs text-muted">{inv.id} · {inv.date}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-sm font-medium text-ink">{fmt(inv.amount)}</span>
                <button
                  type="button"
                  className="text-subtle hover:text-emerald transition-colors"
                  aria-label={`Descargar ${inv.id}`}
                >
                  <Download size={14} aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}
