import { motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, ArrowDownLeft, FileX } from 'lucide-react';
import type { InvoiceResult, Invoice } from '../invoiceTypes';

const TIPO_LABEL: Record<Invoice['tipoComprobante'], string> = {
  I: 'Ingreso',
  E: 'Egreso',
  P: 'Pago',
  N: 'Nómina',
  T: 'Traslado',
};

const fmt = (n: number) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(n);

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

const MAX_VISIBLE = 10;

interface InvoiceListCardProps {
  result: InvoiceResult;
}

export default function InvoiceListCard({ result }: InvoiceListCardProps) {
  const reduce = useReducedMotion();
  const { kind, invoices, from, to } = result;

  const isEmitidas = kind === 'emitidas';
  const vigentes = invoices.filter((i) => i.estado === 'Vigente');
  const canceladas = invoices.filter((i) => i.estado === 'Cancelado');
  const totalSum = vigentes.reduce((s, i) => s + i.total, 0);
  const ivaSum = vigentes.reduce((s, i) => s + (i.iva ?? 0), 0);
  const visible = invoices.slice(0, MAX_VISIBLE);

  const fade = reduce
    ? {}
    : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 } };

  return (
    <motion.div
      {...fade}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-2xl mx-auto grid gap-4"
      role="region"
      aria-label={isEmitidas ? 'Facturas emitidas' : 'Facturas recibidas'}
    >
      {/* Context header */}
      <div className="flex items-center gap-2 px-1">
        {isEmitidas ? (
          <ArrowUpRight size={15} className="text-emerald" aria-hidden="true" />
        ) : (
          <ArrowDownLeft size={15} className="text-sky-400" aria-hidden="true" />
        )}
        <h2 className="text-sm font-semibold text-ink tracking-tight">
          {isEmitidas ? 'Facturas Emitidas' : 'Facturas Recibidas'}
        </h2>
        <span className="text-xs text-muted ml-auto">
          {fmtDate(from)} – {fmtDate(to)}
        </span>
      </div>

      {/* Summary */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-xs text-muted">CFDIs</p>
            <p className="text-2xl font-semibold text-ink tracking-tight">
              {vigentes.length}
            </p>
            {canceladas.length > 0 && (
              <p className="text-xs text-muted">
                {canceladas.length} cancelada{canceladas.length > 1 ? 's' : ''}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-xs text-muted">Total</p>
            <p className="text-2xl font-semibold text-ink tracking-tight">
              {fmt(totalSum)}
            </p>
          </div>
          {ivaSum > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted">IVA</p>
              <p className="text-2xl font-semibold text-ink tracking-tight">
                {fmt(ivaSum)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Invoice list */}
      {invoices.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-8 flex flex-col items-center gap-3 text-center">
          <FileX size={28} className="text-subtle" aria-hidden="true" />
          <p className="text-sm text-muted">
            No se encontraron CFDIs en el período.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-medium text-muted">
              {isEmitidas ? 'Receptor' : 'Emisor'}
            </p>
            {invoices.length > MAX_VISIBLE && (
              <span className="text-xs text-muted">
                Mostrando {MAX_VISIBLE} de {invoices.length}
              </span>
            )}
          </div>

          <ul className="flex flex-col gap-1" role="list">
            {visible.map((inv, i) => {
              const name = isEmitidas
                ? (inv.nombreReceptor ?? inv.rfcReceptor)
                : (inv.nombreEmisor ?? inv.rfcEmisor);
              const rfc = isEmitidas ? inv.rfcReceptor : inv.rfcEmisor;
              const cancelled = inv.estado === 'Cancelado';

              return (
                <motion.li
                  key={inv.uuid}
                  {...(reduce
                    ? {}
                    : { initial: { opacity: 0, x: -8 }, animate: { opacity: 1, x: 0 } })}
                  transition={{ delay: 0.04 * i, duration: 0.3 }}
                  className="flex items-center gap-3 py-3 border-b border-border last:border-0"
                >
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      cancelled ? 'bg-red-400' : 'bg-emerald'
                    }`}
                    aria-hidden="true"
                  />

                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm truncate ${
                        cancelled ? 'line-through text-muted' : 'text-ink'
                      }`}
                    >
                      {name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-subtle font-mono">{rfc}</p>
                      <span className="text-xs text-subtle" aria-hidden="true">·</span>
                      <p className="text-xs text-subtle">{fmtDate(inv.fechaEmision)}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="hidden sm:inline-flex text-[10px] font-medium px-2 py-0.5 rounded-full border border-border text-muted bg-surface-hi">
                      {TIPO_LABEL[inv.tipoComprobante]}
                    </span>
                    <p
                      className={`text-sm font-medium ${
                        cancelled ? 'line-through text-subtle' : 'text-ink'
                      }`}
                    >
                      {fmt(inv.total)}
                    </p>
                  </div>
                </motion.li>
              );
            })}
          </ul>
        </div>
      )}
    </motion.div>
  );
}
