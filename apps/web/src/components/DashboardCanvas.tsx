import { motion, AnimatePresence } from 'motion/react';
import { X, MessageSquare } from 'lucide-react';
import type { Panel, PanelSize } from '../lib/dashboard';
import CsfCard from './CsfCard';
import InvoiceListCard from './InvoiceListCard';
import KpiCard from './KpiCard';

/** Panel size → column span on the 12-col grid (stacks full-width on mobile). */
const span: Record<PanelSize, string> = {
  sm: 'md:col-span-4',
  md: 'md:col-span-6',
  lg: 'md:col-span-8',
  xl: 'md:col-span-12',
};

function PanelContent({ panel }: { panel: Panel }) {
  switch (panel.kind) {
    case 'csf':
      return <CsfCard csf={panel.data} />;
    case 'invoices':
      return <InvoiceListCard invoices={panel.data.invoices} kind={panel.data.tipo} />;
    case 'kpi':
      return <KpiCard title={panel.title} data={panel.data} />;
  }
}

interface DashboardCanvasProps {
  panels: Panel[];
  onRemove?: (id: string) => void;
}

/**
 * The canvas: a responsive 12-column grid that grows as panels are added.
 * Each panel spans columns per its size; `motion layout` reflows smoothly when
 * panels appear or are removed.
 */
export default function DashboardCanvas({ panels, onRemove }: DashboardCanvasProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start [grid-auto-flow:dense]">
      <AnimatePresence mode="popLayout">
        {panels.map((panel) => (
          <motion.div
            key={panel.id}
            layout
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className={`relative group ${span[panel.size]}`}
          >
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(panel.id)}
                aria-label="Quitar panel"
                className="absolute -top-2 -right-2 z-10 w-6 h-6 rounded-full bg-surface-hi border border-border text-muted hover:text-ink hover:border-ink/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={12} aria-hidden="true" />
              </button>
            )}
            {panel.query && (
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare size={13} className="text-muted shrink-0" aria-hidden="true" />
                <span className="text-sm text-muted truncate">"{panel.query}"</span>
              </div>
            )}
            <PanelContent panel={panel} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
