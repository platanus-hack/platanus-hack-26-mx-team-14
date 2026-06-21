import { useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import type { WidgetSpec, WidgetDataPoint } from '../types';

const mxn = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n);

const compact = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n}`;
};

const PALETTE = [
  'oklch(0.72 0.17 162)',
  'oklch(0.62 0.16 240)',
  'oklch(0.65 0.19 35)',
  'oklch(0.68 0.18 300)',
  'oklch(0.70 0.15 80)',
  'oklch(0.60 0.17 200)',
  'oklch(0.66 0.20 150)',
  'oklch(0.58 0.18 25)',
];

function colorAt(i: number, override?: string) {
  if (override && i === 0) return override;
  return PALETTE[i % PALETTE.length]!;
}

// ── Pie / Donut ─────────────────────────────────────────────────────────────

function PieChart({ data, donut, color }: { data: WidgetDataPoint[]; donut?: boolean; color?: string }) {
  const reduce = useReducedMotion();
  const [hovered, setHovered] = useState<number | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;

  const cx = 50, cy = 50, r = 38, innerR = donut ? 22 : 0;
  let angle = -Math.PI / 2;

  const slices = data.map((d, i) => {
    const sweep = (d.value / total) * 2 * Math.PI;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    const midAngle = angle + sweep / 2;
    angle += sweep;
    const x2 = cx + r * Math.cos(angle);
    const y2 = cy + r * Math.sin(angle);
    const xi1 = cx + innerR * Math.cos(angle - sweep);
    const yi1 = cy + innerR * Math.sin(angle - sweep);
    const xi2 = cx + innerR * Math.cos(angle);
    const yi2 = cy + innerR * Math.sin(angle);
    const large = sweep > Math.PI ? 1 : 0;
    const d_path = donut
      ? `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${innerR} ${innerR} 0 ${large} 0 ${xi1} ${yi1} Z`
      : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
    return { d: d_path, color: colorAt(i, color), label: d.label, value: d.value, midAngle, pct: d.value / total };
  });

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <div className="relative shrink-0" style={{ width: 120, height: 120 }}>
        <svg viewBox="0 0 100 100" style={{ width: 120, height: 120 }}>
          {slices.map((s, i) => (
            <motion.path
              key={i}
              d={s.d}
              fill={s.color}
              opacity={hovered !== null && hovered !== i ? 0.5 : 0.9}
              initial={reduce ? {} : { scale: 0, transformOrigin: '50px 50px' }}
              animate={{ scale: 1, transformOrigin: '50px 50px' }}
              transition={{ duration: 0.5, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: 'default' }}
            />
          ))}
          {donut && (
            <text x="50" y="53" textAnchor="middle" fontSize="10" fontWeight="600" fill="oklch(0.96 0.003 257)">
              {compact(total)}
            </text>
          )}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex-1 min-w-0 space-y-1.5">
        {slices.map((s, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-2"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: s.color }} />
              <span className="text-[11px] text-muted truncate">{s.label}</span>
            </div>
            <span className="text-[11px] font-semibold font-mono tabular-nums text-ink shrink-0">
              {(s.pct * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {hovered !== null && (
          <motion.div
            className="absolute bottom-2 right-2 rounded-lg px-3 py-2 text-xs pointer-events-none z-10"
            style={{ border: '1px solid oklch(0.26 0.008 257)', background: 'oklch(0.13 0.007 257 / 0.97)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <span className="font-semibold text-ink">{slices[hovered]?.label}</span>
            <span className="text-muted ml-2 font-mono">{mxn(slices[hovered]?.value ?? 0)}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Bar Chart ───────────────────────────────────────────────────────────────

function BarChart({ data, color, series }: { data: WidgetDataPoint[]; color?: string; series?: string[] }) {
  const reduce = useReducedMotion();
  const [hovered, setHovered] = useState<string | null>(null);

  // Multi-series: series[0] = "value" (always), series[1..] = extra keys in data
  const seriesKeys: Array<{ key: string; label: string; color: string }> =
    series && series.length > 1
      ? series.map((s, si) => ({
          key: si === 0 ? 'value' : s.toLowerCase().replace(/\s+/g, '_'),
          label: s,
          color: colorAt(si, color),
        }))
      : [{ key: 'value', label: series?.[0] ?? '', color: color ?? PALETTE[0]! }];

  const allValues = data.flatMap(d =>
    seriesKeys.map(sk => Number((d as Record<string, unknown>)[sk.key] ?? 0))
  );
  const max = Math.max(...allValues, 1);

  if (seriesKeys.length > 1) {
    // Grouped bar layout
    return (
      <div className="space-y-3">
        {/* Legend */}
        <div className="flex items-center gap-4 flex-wrap">
          {seriesKeys.map(sk => (
            <div key={sk.key} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-sm" style={{ background: sk.color }} />
              <span className="text-[11px] text-muted">{sk.label}</span>
            </div>
          ))}
        </div>
        {data.map((d, i) => (
          <div key={i} className="space-y-1">
            <span className="text-[11px] text-muted">{d.label}</span>
            {seriesKeys.map(sk => {
              const val = Number((d as Record<string, unknown>)[sk.key] ?? 0);
              const pct = val / max;
              const hKey = `${i}-${sk.key}`;
              return (
                <div
                  key={sk.key}
                  className="flex items-center gap-2"
                  onMouseEnter={() => setHovered(hKey)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ background: 'oklch(0.22 0.008 257)' }}>
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: sk.color, opacity: hovered !== null && hovered !== hKey ? 0.4 : 0.85 }}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct * 100}%` }}
                      transition={{ duration: 0.55, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
                    />
                  </div>
                  <span className="text-[10px] font-semibold font-mono tabular-nums text-ink w-20 text-right shrink-0">
                    {mxn(val)}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  }

  // Single series
  const max1 = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="space-y-1.5">
      {data.map((d, i) => {
        const pct = d.value / max1;
        const c = colorAt(i, color);
        const hKey = String(i);
        return (
          <div
            key={i}
            className="flex items-center gap-3"
            onMouseEnter={() => setHovered(hKey)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className="text-[11px] text-muted w-28 truncate shrink-0">{d.label}</span>
            <div className="flex-1 h-5 rounded-full overflow-hidden" style={{ background: 'oklch(0.22 0.008 257)' }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: c, opacity: hovered !== null && hovered !== hKey ? 0.45 : 0.88 }}
                initial={{ width: 0 }}
                animate={{ width: `${pct * 100}%` }}
                transition={{ duration: 0.55, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
            <span className="text-[11px] font-semibold font-mono tabular-nums text-ink w-20 text-right shrink-0">
              {mxn(d.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Line / Area ─────────────────────────────────────────────────────────────

function LineChart({ data, area, color }: { data: WidgetDataPoint[]; area?: boolean; color?: string }) {
  const reduce = useReducedMotion();
  const [tooltip, setTooltip] = useState<{ i: number; x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const W = 100, H = 50;
  const pad = { left: 2, right: 2, top: 4, bottom: 16 };
  const cH = H - pad.top - pad.bottom;
  const cW = W - pad.left - pad.right;

  const vals = data.map(d => d.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;

  const pts = data.map((d, i) => ({
    x: pad.left + (i / Math.max(data.length - 1, 1)) * cW,
    y: pad.top + cH - ((d.value - min) / range) * cH,
    d,
  }));

  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const fillD = `${pathD} L ${pts.at(-1)!.x} ${H - pad.bottom} L ${pts[0]!.x} ${H - pad.bottom} Z`;
  const c = color ?? PALETTE[0]!;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 100, overflow: 'visible' }}
        onMouseLeave={() => setTooltip(null)}
      >
        {area && (
          <motion.path
            d={fillD}
            fill={c}
            opacity={0.12}
            initial={reduce ? {} : { opacity: 0 }}
            animate={{ opacity: 0.12 }}
            transition={{ duration: 0.6 }}
          />
        )}
        <motion.path
          d={pathD}
          fill="none"
          stroke={c}
          strokeWidth={0.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduce ? {} : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        />
        {pts.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x} cy={p.y} r={2}
              fill={c} opacity={tooltip?.i === i ? 1 : 0.6}
              onMouseEnter={e => {
                const rect = svgRef.current?.getBoundingClientRect();
                if (rect) setTooltip({ i, x: e.clientX - rect.left, y: e.clientY - rect.top });
              }}
            />
            <text x={p.x} y={H - 2} textAnchor="middle" fill="oklch(0.48 0.01 257)" fontSize="3.2">
              {p.d.label}
            </text>
          </g>
        ))}
      </svg>
      <AnimatePresence>
        {tooltip !== null && (
          <motion.div
            className="pointer-events-none absolute rounded-lg px-3 py-2 text-xs z-10"
            style={{
              left: Math.min(tooltip.x + 8, 180),
              top: Math.max(tooltip.y - 60, 0),
              border: '1px solid oklch(0.26 0.008 257)',
              background: 'oklch(0.13 0.007 257 / 0.97)',
            }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <p className="font-semibold text-ink">{data[tooltip.i]?.label}</p>
            <p className="font-mono text-muted">{mxn(data[tooltip.i]?.value ?? 0)}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Table ───────────────────────────────────────────────────────────────────

function TableWidget({ data }: { data: WidgetDataPoint[] }) {
  const cols = Object.keys(data[0] ?? {}).filter(k => k !== '__proto__');
  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              {cols.map(c => (
                <th key={c} className="text-left px-3 py-2.5 text-muted font-medium capitalize">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <motion.tr
                key={i}
                className="border-b border-border last:border-0 hover:bg-surface-hi transition-colors"
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.02, duration: 0.25 }}
              >
                {cols.map(c => (
                  <td key={c} className="px-3 py-2.5 text-ink">
                    {typeof row[c] === 'number'
                      ? c === 'value' ? mxn(row[c] as number) : String(row[c])
                      : String(row[c] ?? '')}
                  </td>
                ))}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Metric cards ─────────────────────────────────────────────────────────────

function MetricWidget({ data, color }: { data: WidgetDataPoint[]; color?: string }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(data.length, 3)}, 1fr)` }}>
      {data.map((d, i) => {
        const c = colorAt(i, color);
        return (
          <motion.div
            key={i}
            className="rounded-xl p-4 flex flex-col gap-1"
            style={{ border: `1px solid ${c}33`, background: `${c}0d` }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="text-[10px] font-medium" style={{ color: 'oklch(0.55 0.01 257)' }}>{d.label}</span>
            <span className="text-base font-semibold font-mono tabular-nums" style={{ color: c }}>{mxn(d.value)}</span>
          </motion.div>
        );
      })}
    </div>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────

interface ChartWidgetProps {
  spec: WidgetSpec;
}

export default function ChartWidget({ spec }: ChartWidgetProps) {
  const { kind, title, subtitle, data, color, series } = spec;
  if (!data?.length) return null;

  return (
    <div className="w-full rounded-2xl border border-border bg-surface p-5 space-y-4">
      {(title || subtitle) && (
        <div>
          {title && <p className="text-sm font-semibold text-ink tracking-tight">{title}</p>}
          {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
        </div>
      )}
      <div className="relative">
        {(kind === 'pie' || kind === 'donut') && (
          <PieChart data={data} donut={kind === 'donut'} color={color} />
        )}
        {kind === 'bar' && <BarChart data={data} color={color} series={series} />}
        {(kind === 'line' || kind === 'area') && <LineChart data={data} area={kind === 'area'} color={color} />}
        {kind === 'table' && <TableWidget data={data} />}
        {kind === 'metric' && <MetricWidget data={data} color={color} />}
      </div>
    </div>
  );
}
