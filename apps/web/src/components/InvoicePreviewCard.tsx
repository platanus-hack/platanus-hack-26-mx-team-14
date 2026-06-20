import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { FileCheck, AlertTriangle } from 'lucide-react';
import type { InvoicePreview } from '../types';

interface InvoicePreviewCardProps {
  preview: InvoicePreview;
  onConfirm?: () => void;
  onCancel?: () => void;
}

function fmt(n: number) {
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
}

export default function InvoicePreviewCard({ preview, onConfirm, onCancel }: InvoicePreviewCardProps) {
  const reduce = useReducedMotion();
  const [confirmed, setConfirmed] = useState(false);

  function handleConfirm() {
    setConfirmed(true);
    onConfirm?.();
  }

  return (
    <motion.div
      initial={reduce ? {} : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="w-full"
      role="region"
      aria-label="Vista previa de factura"
    >
      <div className="flex items-center gap-2 mb-4 px-1">
        <FileCheck size={15} className="text-amber-400" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-ink tracking-tight">Vista previa — pendiente de emisión</h2>
      </div>

      <div className="rounded-2xl border border-amber-500/25 bg-amber-950/10 overflow-hidden">
        {/* Warning banner */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-amber-500/20 bg-amber-950/20">
          <AlertTriangle size={13} className="text-amber-400 shrink-0" aria-hidden="true" />
          <p className="text-xs text-amber-300">
            Esta factura NO ha sido emitida. Revisa los datos antes de confirmar.
          </p>
        </div>

        {/* Receptor */}
        <div className="px-5 py-4 border-b border-amber-500/15">
          <p className="text-[10px] font-medium text-muted uppercase tracking-wide mb-1">Receptor</p>
          <p className="text-sm font-mono text-ink">{preview.receptorRfc}</p>
        </div>

        {/* Conceptos */}
        <div className="px-5 py-4 border-b border-amber-500/15">
          <p className="text-[10px] font-medium text-muted uppercase tracking-wide mb-3">Conceptos</p>
          <div className="flex flex-col gap-2">
            {preview.conceptos.map((c, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-ink truncate">{String(c.descripcion ?? 'Sin descripción')}</p>
                  <p className="text-xs text-muted">
                    {String(c.cantidad ?? 1)} × {fmt(Number(c.valorUnitario ?? 0))}
                  </p>
                </div>
                <p className="text-sm font-semibold text-ink shrink-0">
                  {fmt(Number(c.cantidad ?? 1) * Number(c.valorUnitario ?? 0))}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Totals */}
        <div className="px-5 py-4 border-b border-amber-500/15">
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted">Subtotal</span>
              <span className="text-ink">{fmt(preview.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">IVA 16%</span>
              <span className="text-ink">{fmt(preview.iva)}</span>
            </div>
            <div className="flex justify-between text-base font-semibold pt-1 border-t border-amber-500/20 mt-1">
              <span className="text-ink">Total</span>
              <span className="text-amber-300">{fmt(preview.total)}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        {!confirmed ? (
          <div className="px-5 py-4 flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 h-10 rounded-full border border-border text-sm text-muted hover:text-ink hover:border-ink/30 transition-colors"
            >
              Cancelar
            </button>
            <motion.button
              type="button"
              onClick={handleConfirm}
              className="flex-1 h-10 rounded-full bg-amber-500 text-black font-semibold text-sm flex items-center justify-center gap-2 hover:bg-amber-400 transition-colors"
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12 }}
            >
              <FileCheck size={14} aria-hidden="true" />
              Sí, emitir factura
            </motion.button>
          </div>
        ) : (
          <div className="px-5 py-4 flex items-center justify-center gap-2 text-emerald text-sm font-medium">
            <FileCheck size={15} />
            Emisión confirmada
          </div>
        )}
      </div>
    </motion.div>
  );
}
