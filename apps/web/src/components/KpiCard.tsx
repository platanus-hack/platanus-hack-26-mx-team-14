import type { KpiData } from '../lib/dashboard';

const tone: Record<NonNullable<KpiData['tone']>, string> = {
  emerald: 'text-emerald',
  amber: 'text-amber-300',
  red: 'text-red-300',
};

/** A single-number panel (e.g. "IVA trasladado · $5,680"). */
export default function KpiCard({ title, data }: { title: string; data: KpiData }) {
  return (
    <div className="w-full rounded-xl border border-border bg-surface p-5">
      <p className="text-xs text-muted mb-2">{title}</p>
      <p
        className={`text-2xl sm:text-3xl font-semibold tracking-tight leading-none truncate ${
          data.tone ? tone[data.tone] : 'text-ink'
        }`}
      >
        {data.value}
      </p>
      {data.sub && <p className="text-xs text-subtle mt-2">{data.sub}</p>}
    </div>
  );
}
