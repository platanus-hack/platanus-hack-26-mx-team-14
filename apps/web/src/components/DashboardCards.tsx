import { AnimatePresence, motion } from 'motion/react';
import CsfCard from './CsfCard';
import InvoiceListCard from './InvoiceListCard';
import type { CSF } from '../types';
import type { InvoiceResult } from '../invoiceTypes';

interface DashboardCardsProps {
  showCards: boolean;
  csf: CSF | null;
  invoiceResult: InvoiceResult | null;
}

/**
 * Renders whichever result card is relevant for the last agent turn.
 * When invoices are present they take the primary slot; CSF shows only
 * when there's no invoice result (it acts as fiscal-context background).
 * Wire this in DashboardPage by replacing the showCards block with:
 *   <DashboardCards showCards={showCards} csf={csf} invoiceResult={invoiceResult} />
 */
export default function DashboardCards({
  showCards,
  csf,
  invoiceResult,
}: DashboardCardsProps) {
  const hasContent = invoiceResult !== null || csf !== null;

  return (
    <AnimatePresence>
      {showCards && hasContent && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="w-full"
        >
          {invoiceResult ? (
            <InvoiceListCard result={invoiceResult} />
          ) : (
            csf && <CsfCard csf={csf} />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
