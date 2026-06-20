import type { SkillResult } from '../types';
import CsfCard from './CsfCard';
import InvoiceList from './InvoiceList';

const mxn = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);

/**
 * Renders any skill result. This switch is the front↔back boundary on the view
 * side: whatever the agent returns (a SkillResult), we map it to the right
 * visualization. Add a case here for each new skill.
 */
export default function SkillResultView({ result }: { result: SkillResult }) {
  switch (result.skill) {
    case 'generateCSF':
      return <CsfCard csf={result.csf} />;
    case 'getEmitedInvoices':
      return <InvoiceList invoices={result.invoices} tipo="emitidas" />;
    case 'getReceiptInvoices':
      return <InvoiceList invoices={result.invoices} tipo="recibidas" />;
    case 'generateInvoice':
      return (
        <div className="w-full max-w-2xl mx-auto rounded-xl border border-border bg-surface p-5">
          <p className="text-sm text-ink">
            {result.status === 'previewed'
              ? `Vista previa lista · total ${mxn(result.preview.total)}`
              : `Factura emitida · folio ${result.issued.uuid}`}
          </p>
        </div>
      );
  }
}
