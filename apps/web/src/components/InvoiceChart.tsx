import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import api from '../lib/api';

// ── Types ──────────────────────────────────────────────────────────────────
interface MonthData {
  month: string;
  emitido: number;
  recibido: number;
  cntEmitido: number;
  cntRecibido: number;
}
interface ChartPoint extends MonthData { name: string }

// ── Formatters ─────────────────────────────────────────────────────────────
const mxn = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n);

const compact = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${Math.round(n)}`;
};

const monthLabel = (m: string) => {
  const [, mo] = m.split('-');
  return ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][parseInt(mo!) - 1] ?? m;
};

// ── Count-up animation ─────────────────────────────────────────────────────
function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0);
  const raf = useRef(0);
  const t0 = useRef<number | null>(null);
  useEffect(() => {
    t0.current = null;
    const tick = (ts: number) => {
      if (!t0.current) t0.current = ts;
      const p = Math.min((ts - t0.current) / duration, 1);
      const e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setValue(Math.round(target * e));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return value;
}

// ── Trend pill ─────────────────────────────────────────────────────────────
function TrendBadge({ pct }: { pct: number }) {
  if (!isFinite(pct) || isNaN(pct)) return null;
  const up = pct >= 0;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
      style={{
        background: up ? 'oklch(0.72 0.17 162 / 0.12)' : 'oklch(0.65 0.22 15 / 0.12)',
        color: up ? 'oklch(0.72 0.17 162)' : 'oklch(0.75 0.18 15)',
      }}
    >
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

// ── Metric pill ────────────────────────────────────────────────────────────
function MetricPill({
  label, value, prev, accent,
}: {
  label: string; value: number; prev: number; accent: string;
}) {
  const animated = useCountUp(value);
  const trend = prev > 0 ? ((value - prev) / prev) * 100 : 0;

  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-[11px] font-medium text-muted">{label}</span>
      <span
        className="text-lg font-semibold font-mono tabular-nums leading-none"
        style={{ color: accent }}
      >
        {mxn(animated)}
      </span>
      <TrendBadge pct={trend} />
    </div>
  );
}

// ── Chart geometry ─────────────────────────────────────────────────────────
const W = 560, H = 160;
const PAD = { left: 52, right: 4, top: 10, bottom: 34 };
const CHART_H = H - PAD.top - PAD.bottom; // 116
const CHART_W = W - PAD.left - PAD.right; // 504

const EM = 'oklch(0.72 0.17 162)';
const RO = 'oklch(0.65 0.22 15)';
const SK = 'oklch(0.66 0.16 222)';

// ── Main component ─────────────────────────────────────────────────────────
export default function InvoiceChart() {
  const reduce = useReducedMotion();
  const [data, setData] = useState<MonthData[]>([]);
  // Init from token so we don't setState synchronously in the effect when there's none.
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem('sati_token')));
  const [active, setActive] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; i: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const token = localStorage.getItem('sati_token');
    if (!token) return;
    api.get('/me/invoice-summary')
      .then(r => setData(r.data.months ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="h-44 flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 animate-spin"
          style={{ borderColor: `${EM} transparent ${EM} transparent` }} />
      </div>
    );
  }
  if (data.length === 0) return null;

  const pts: ChartPoint[] = data.slice(-12).map(d => ({ ...d, name: monthLabel(d.month) }));
  const n = pts.length;

  // Summaries
  const last3 = data.slice(-3);
  const prev3 = data.slice(-6, -3);
  const sumE = (arr: MonthData[]) => arr.reduce((s, d) => s + d.emitido, 0);
  const sumR = (arr: MonthData[]) => arr.reduce((s, d) => s + d.recibido, 0);

  const totalE = sumE(last3), prevE = sumE(prev3);
  const totalR = sumR(last3), prevR = sumR(prev3);
  const balance = totalE - totalR, prevBalance = prevE - prevR;

  // Chart math
  const maxVal = Math.max(...pts.flatMap(d => [d.emitido, d.recibido]), 1);
  const groupW = CHART_W / n;
  const bw = Math.min(groupW * 0.3, 16);
  const gap = groupW * 0.06;

  const gx = (i: number) => PAD.left + i * groupW;
  const toY = (v: number) => PAD.top + CHART_H - Math.max(v, 0) / maxVal * CHART_H;
  const clampY = (y: number) => Math.max(PAD.top, Math.min(PAD.top + CHART_H, y));

  // Balance line path (clamped to chart area)
  const balPts = pts.map((d, i) => ({
    x: gx(i) + groupW / 2,
    y: clampY(toY(d.emitido - d.recibido)),
  }));
  const linePath = balPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = [
    `M ${balPts[0]!.x} ${PAD.top + CHART_H}`,
    ...balPts.map(p => `L ${p.x} ${p.y}`),
    `L ${balPts[n - 1]!.x} ${PAD.top + CHART_H}`,
    'Z',
  ].join(' ');

  // Grid ticks
  const ticks = [0.25, 0.5, 0.75, 1];

  function handleMove(e: React.MouseEvent, i: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    setActive(i);
    setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, i });
  }

  return (
    <div className="space-y-4" onMouseLeave={() => { setActive(null); setTooltip(null); }}>

      {/* Metric pills */}
      <div className="flex items-start gap-6">
        <MetricPill label="Facturado · 3m" value={totalE} prev={prevE} accent={EM} />
        <div style={{ width: 1, height: 40, background: 'oklch(0.22 0.008 257)', alignSelf: 'center' }} />
        <MetricPill label="Gastos · 3m" value={totalR} prev={prevR} accent={RO} />
        <div style={{ width: 1, height: 40, background: 'oklch(0.22 0.008 257)', alignSelf: 'center' }} />
        <MetricPill label="Balance" value={balance} prev={prevBalance} accent={balance >= 0 ? SK : RO} />
      </div>

      {/* SVG chart — natural aspect ratio, no fixed height */}
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          overflow="hidden"
          aria-label="Historial de facturación"
          role="img"
        >
          <defs>
            {/* Bar gradients */}
            <linearGradient id="ic-grad-e" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={EM} stopOpacity="0.92" />
              <stop offset="100%" stopColor={EM} stopOpacity="0.08" />
            </linearGradient>
            <linearGradient id="ic-grad-r" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={RO} stopOpacity="0.85" />
              <stop offset="100%" stopColor={RO} stopOpacity="0.06" />
            </linearGradient>
            {/* Balance area gradient */}
            <linearGradient id="ic-grad-bal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SK} stopOpacity="0.22" />
              <stop offset="100%" stopColor={SK} stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Grid */}
          {ticks.map(t => (
            <line
              key={t}
              x1={PAD.left} y1={PAD.top + CHART_H * (1 - t)}
              x2={W - PAD.right} y2={PAD.top + CHART_H * (1 - t)}
              stroke="oklch(0.22 0.008 257)" strokeWidth="0.6"
            />
          ))}

          {/* Baseline (x-axis) */}
          <line
            x1={PAD.left} y1={PAD.top + CHART_H}
            x2={W - PAD.right} y2={PAD.top + CHART_H}
            stroke="oklch(0.30 0.008 257)" strokeWidth="0.8"
          />

          {/* Y-axis labels — skip 0 (baseline is visually obvious) */}
          {[0.5, 1].map(t => (
            <text
              key={t}
              x={PAD.left - 4} y={PAD.top + CHART_H * (1 - t) + 3.5}
              textAnchor="end" fill="oklch(0.38 0.009 257)" fontSize="9"
            >
              {compact(maxVal * t)}
            </text>
          ))}

          {/* Column hover highlight */}
          {active !== null && (
            <rect
              x={gx(active)} y={PAD.top}
              width={groupW} height={CHART_H}
              fill="oklch(0.96 0.003 257 / 0.04)"
              rx={2}
            />
          )}

          {/* Balance area + line */}
          <motion.path
            d={areaPath} fill="url(#ic-grad-bal)"
            initial={reduce ? {} : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.4 }}
          />
          <motion.path
            d={linePath} fill="none"
            stroke={SK} strokeWidth="1.2"
            strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray="2 2"
            initial={reduce ? {} : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          />
          {/* Balance dots */}
          {balPts.map((p, i) => (
            <motion.circle
              key={i} cx={p.x} cy={p.y} r={1.8}
              fill={SK}
              initial={reduce ? {} : { opacity: 0, scale: 0 }}
              animate={{ opacity: active === i ? 1 : 0.5, scale: 1 }}
              transition={{ duration: 0.3, delay: 0.5 + i * 0.02 }}
              style={{ transformOrigin: `${p.x}px ${p.y}px` }}
            />
          ))}

          {/* Grouped bars */}
          {pts.map((pt, i) => {
            const x0 = gx(i) + (groupW - 2 * bw - gap) / 2;
            const x1 = x0 + bw + gap;
            const yE = toY(pt.emitido), hE = pt.emitido / maxVal * CHART_H;
            const yR = toY(pt.recibido), hR = pt.recibido / maxVal * CHART_H;
            const isActive = active === i;
            const dimmed = active !== null && !isActive;

            return (
              <g
                key={pt.month}
                onMouseMove={e => handleMove(e, i)}
                style={{ cursor: 'default' }}
              >
                {/* Invisible hit area — chart area only */}
                <rect
                  x={gx(i)} y={PAD.top}
                  width={groupW} height={CHART_H}
                  fill="transparent"
                />

                {/* Emitido bar — scaleY from baseline, no y/height animation */}
                <motion.rect
                  x={x0} y={yE} width={bw} height={hE} rx={1.5}
                  fill="url(#ic-grad-e)"
                  opacity={dimmed ? 0.3 : 0.95}
                  initial={reduce ? {} : { scaleY: 0, opacity: dimmed ? 0.3 : 0.95 }}
                  animate={{ scaleY: 1, opacity: dimmed ? 0.3 : 0.95 }}
                  transition={{ duration: 0.55, delay: reduce ? 0 : i * 0.03, ease: [0.16, 1, 0.3, 1] }}
                  style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}
                />

                {/* Recibido bar */}
                <motion.rect
                  x={x1} y={yR} width={bw} height={hR} rx={1.5}
                  fill="url(#ic-grad-r)"
                  opacity={dimmed ? 0.3 : 0.85}
                  initial={reduce ? {} : { scaleY: 0, opacity: dimmed ? 0.3 : 0.85 }}
                  animate={{ scaleY: 1, opacity: dimmed ? 0.3 : 0.85 }}
                  transition={{ duration: 0.55, delay: reduce ? 0 : i * 0.03 + 0.04, ease: [0.16, 1, 0.3, 1] }}
                  style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}
                />

                {/* Month label */}
                <text
                  x={gx(i) + groupW / 2} y={H - 4}
                  textAnchor="middle"
                  fill={isActive ? 'oklch(0.65 0.01 257)' : 'oklch(0.36 0.008 257)'}
                  fontSize="9"
                  fontWeight={isActive ? '600' : '400'}
                >
                  {pt.name}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Tooltip */}
        <AnimatePresence>
          {tooltip !== null && active !== null && (
            <motion.div
              key="tt"
              initial={{ opacity: 0, y: 6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-none absolute z-10 rounded-xl px-3 py-2.5 text-xs"
              style={{
                left: Math.min(Math.max(tooltip.x - 70, 0), 200),
                top: Math.max(tooltip.y - 90, 0),
                border: '1px solid oklch(0.24 0.009 257)',
                background: 'oklch(0.11 0.006 257 / 0.97)',
                backdropFilter: 'blur(12px)',
                minWidth: 148,
              }}
            >
              <p className="font-semibold text-ink mb-2 text-[11px]">{pts[active]?.name}</p>
              <div className="space-y-1">
                <div className="flex justify-between gap-5">
                  <span className="text-muted">Facturado</span>
                  <span className="font-mono font-semibold" style={{ color: EM }}>
                    {mxn(pts[active]?.emitido ?? 0)}
                  </span>
                </div>
                <div className="flex justify-between gap-5">
                  <span className="text-muted">Gastos</span>
                  <span className="font-mono font-semibold" style={{ color: RO }}>
                    {mxn(pts[active]?.recibido ?? 0)}
                  </span>
                </div>
                <div
                  className="flex justify-between gap-5 pt-1.5"
                  style={{ borderTop: '1px solid oklch(0.20 0.008 257)' }}
                >
                  <span className="text-muted">Balance</span>
                  <span
                    className="font-mono font-semibold"
                    style={{ color: (pts[active]?.emitido ?? 0) >= (pts[active]?.recibido ?? 0) ? SK : RO }}
                  >
                    {mxn((pts[active]?.emitido ?? 0) - (pts[active]?.recibido ?? 0))}
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm" style={{ background: 'url(#ic-grad-e)', backgroundColor: EM, opacity: 0.8 }} />
          <span className="text-[11px] text-muted">Facturado</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: RO, opacity: 0.75 }} />
          <span className="text-[11px] text-muted">Gastos</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="14" height="6" viewBox="0 0 14 6">
            <line x1="0" y1="3" x2="14" y2="3" stroke={SK} strokeWidth="1.5" strokeDasharray="2 2" />
            <circle cx="7" cy="3" r="2" fill={SK} />
          </svg>
          <span className="text-[11px] text-muted">Balance</span>
        </div>
      </div>
    </div>
  );
}
