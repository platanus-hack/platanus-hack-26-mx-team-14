import { useMemo } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { FileText, Ban } from 'lucide-react';
import type { Invoice } from '../types';

interface InvoiceListProps {
  invoices: Invoice[];
  /** "emitidas" | "recibidas" — drives the title + which counterparty to show. */
  tipo: 'emitidas' | 'recibidas';
}

const mxn = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);

const fechaFmt = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });
const fecha = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : fechaFmt.format(d);
};

export default function InvoiceList({ invoices, tipo }: InvoiceListProps) {
  const reduce = useReducedMotion();

  const stats = useMemo(() => {
    const vigentes = invoices.filter((i) => i.estado === 'Vigente');
    return {
      total: vigentes.reduce((s, i) => s + i.total, 0),
      iva: vigentes.reduce((s, i) => s + (i.iva ?? 0), 0),
      vigentes: vigentes.length,
      canceladas: invoices.length - vigentes.length,
    };
  }, [invoices]);

  const fade = reduce ? {} : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 } };

  return (
    <motion.div
      {...fade}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-2xl mx-auto grid gap-4"
      role="region"
      aria-label={`Facturas ${tipo}`}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <FileText size={15} className="text-emerald" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-ink tracking-tight capitalize">
            Facturas {tipo}
          </h2>
        </div>
        <span className="text-xs text-muted">{invoices.length} CFDI</span>
      </div>

      {/* ── Summary (vigentes) ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-surface p-6">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-xs text-muted mb-1.5">Total facturado</p>
            <p className="text-3xl sm:text-4xl font-semibold text-ink tracking-tight leading-none">
              {mxn(stats.total)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted mb-1.5">IVA trasladado</p>
            <p className="text-3xl sm:text-4xl font-semibold text-emerald tracking-tight leading-none">
              {mxn(stats.iva)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-5 pt-4 border-t border-border text-xs">
          <span className="text-muted">{stats.vigentes} vigentes</span>
          {stats.canceladas > 0 && (
            <span className="text-red-300">· {stats.canceladas} cancelada{stats.canceladas === 1 ? '' : 's'}</span>
          )}
        </div>
      </div>

      {/* ── Lista ──────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <ul className="flex flex-col gap-1" role="list">
          {invoices.map((inv, i) => {
            const cancelada = inv.estado === 'Cancelado';
            const counterparty =
              (tipo === 'emitidas' ? inv.nombreReceptor : inv.nombreEmisor) ??
              (tipo === 'emitidas' ? inv.rfcReceptor : inv.rfcEmisor);
            return (
              <motion.li
                key={inv.uuid}
                {...(reduce ? {} : { initial: { opacity: 0, x: -8 }, animate: { opacity: 1, x: 0 } })}
                transition={{ delay: 0.04 * i, duration: 0.3 }}
                className="flex items-center gap-3 py-3 border-b border-border last:border-0"
              >
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${cancelada ? 'bg-red-400' : 'bg-emerald'}`}
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm truncate ${cancelada ? 'text-muted line-through' : 'text-ink'}`}>
                    {counterparty}
                  </p>
                  <p className="text-xs text-subtle">{fecha(inv.fechaEmision)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {cancelada && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-red-300 border border-red-500/40 bg-red-950/30 rounded-full px-2 py-0.5">
                      <Ban size={10} aria-hidden="true" /> Cancelada
                    </span>
                  )}
                  <span className={`text-sm ${cancelada ? 'text-muted' : 'text-ink'}`}>
                    {mxn(inv.total)}
                  </span>
                </div>
              </motion.li>
            );
          })}
        </ul>
      </div>
    </motion.div>
  );
}
