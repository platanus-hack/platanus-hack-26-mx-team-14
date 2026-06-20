import { motion, useReducedMotion } from 'motion/react';
import { Receipt, TrendingDown, TrendingUp, AlertCircle } from 'lucide-react';
import type { Invoice } from '../types';

interface InvoiceListCardProps {
  invoices: Invoice[];
  kind: 'emitidas' | 'recibidas';
}

const TIPO: Record<string, string> = {
  I: 'Ingreso', E: 'Egreso', P: 'Pago', N: 'Nómina', T: 'Traslado',
};

function fmt(n: number) {
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-');
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${d} ${months[parseInt(m, 10) - 1]} ${y}`;
}

export default function InvoiceListCard({ invoices, kind }: InvoiceListCardProps) {
  const reduce = useReducedMotion();
  const total = invoices.reduce((s, inv) => s + inv.total, 0);
  const vigentes = invoices.filter(inv => inv.estado === 'Vigente').length;
  const Icon = kind === 'emitidas' ? TrendingUp : TrendingDown;

  return (
    <motion.div
      initial={reduce ? {} : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="w-full"
      role="region"
      aria-label={`Facturas ${kind}`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-4 px-1">
        <Icon size={15} className="text-emerald" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-ink tracking-tight">
          Facturas {kind}
        </h2>
        <span className="ml-auto text-xs text-subtle">{invoices.length} registros</span>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: 'Total', value: fmt(total), accent: true },
          { label: 'Vigentes', value: vigentes.toString() },
          { label: 'Canceladas', value: (invoices.length - vigentes).toString() },
        ].map(({ label, value, accent }) => (
          <div key={label} className={`rounded-xl border p-3 ${accent ? 'border-emerald/30 bg-emerald-lo' : 'border-border bg-surface'}`}>
            <p className="text-[10px] font-medium text-muted uppercase tracking-wide mb-1">{label}</p>
            <p className={`text-sm font-semibold ${accent ? 'text-emerald' : 'text-ink'}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[500px]" role="table">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-muted font-medium">RFC {kind === 'emitidas' ? 'Receptor' : 'Emisor'}</th>
                <th className="text-left px-4 py-3 text-muted font-medium">Fecha</th>
                <th className="text-right px-4 py-3 text-muted font-medium">Total</th>
                <th className="text-center px-4 py-3 text-muted font-medium">Tipo</th>
                <th className="text-center px-4 py-3 text-muted font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv, i) => (
                <motion.tr
                  key={inv.uuid}
                  initial={reduce ? {} : { opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.03 * i, duration: 0.25 }}
                  className="border-b border-border last:border-0 hover:bg-surface-hi transition-colors"
                  role="row"
                >
                  <td className="px-4 py-3 font-mono text-ink">
                    {kind === 'emitidas' ? inv.rfcReceptor : inv.rfcEmisor}
                  </td>
                  <td className="px-4 py-3 text-muted">{fmtDate(inv.fechaEmision)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-ink">{fmt(inv.total)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="px-2 py-0.5 rounded-full bg-surface-hi border border-border text-muted">
                      {TIPO[inv.tipoComprobante] ?? inv.tipoComprobante}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                      inv.estado === 'Vigente'
                        ? 'border-emerald/30 text-emerald bg-emerald-lo'
                        : 'border-red-500/30 text-red-400 bg-red-950/20'
                    }`}>
                      {inv.estado === 'Cancelado' && <AlertCircle size={8} />}
                      {inv.estado}
                    </span>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>

        {invoices.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-10 text-muted">
            <Receipt size={24} className="text-subtle" />
            <p className="text-sm">Sin facturas en el período</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
