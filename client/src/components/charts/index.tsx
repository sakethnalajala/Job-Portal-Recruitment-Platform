import type { ReactNode } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui';

/** Fixed categorical slots — assigned by entity, never cycled (see dataviz palette validation). */
export const SERIES = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)', 'var(--chart-7)'] as const;

/** Stable colour per application status so filters never repaint survivors. */
export const STATUS_COLOR: Record<string, string> = {
  applied: SERIES[0],
  under_review: SERIES[3],
  shortlisted: SERIES[5],
  interview: SERIES[1],
  selected: SERIES[2],
  rejected: SERIES[6],
  withdrawn: 'var(--chart-axis)',
  draft: 'var(--chart-axis)',
  open: SERIES[2],
  paused: SERIES[3],
  closed: SERIES[0],
  removed: SERIES[6],
};

export function ChartCard({ title, description, children, className, loading, empty, actions }: { title: string; description?: string; children: ReactNode; className?: string; loading?: boolean; empty?: boolean; actions?: ReactNode }) {
  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className={cn('rounded-2xl border border-border bg-surface p-5 shadow-card', className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{title}</h3>
          {description && <p className="text-xs text-muted">{description}</p>}
        </div>
        {actions}
      </div>
      {loading ? <Skeleton className="h-56 w-full" /> : empty ? <div className="flex h-56 items-center justify-center text-sm text-muted">No data for this period yet.</div> : children}
    </motion.section>
  );
}

function TooltipBox({ active, payload, label, formatter }: { active?: boolean; payload?: { name: string; value: number; color?: string; payload?: Record<string, unknown> }[]; label?: string; formatter?: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      {label && <p className="mb-1 font-medium text-text">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-text-secondary">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden />
          {p.name}: <span className="font-semibold text-text">{formatter ? formatter(p.value) : p.value}</span>
        </p>
      ))}
    </div>
  );
}

const axisProps = { tick: { fill: 'var(--chart-axis)', fontSize: 11 }, axisLine: false as const, tickLine: false as const };

/** Single-series area chart over dates (no legend needed: the title names the series). */
export function TimeSeriesChart({ data, name, color = SERIES[0], height = 224 }: { data: { date: string; count: number }[]; name: string; color?: string; height?: number }) {
  const rows = data.map((d) => ({ ...d, label: new Date(d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={rows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="tsFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={24} />
        <YAxis {...axisProps} allowDecimals={false} width={40} />
        <Tooltip content={<TooltipBox />} cursor={{ stroke: 'var(--chart-axis)', strokeDasharray: '3 3' }} />
        <Area type="monotone" dataKey="count" name={name} stroke={color} strokeWidth={2} fill="url(#tsFill)" dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--surface)' }} isAnimationActive animationDuration={700} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Horizontal bars for a categorical breakdown with direct value labels (relief rule). */
export function BreakdownBars({ data, height }: { data: { key: string; label: string; value: number; color?: string }[]; height?: number }) {
  const h = height ?? Math.max(160, data.length * 36 + 16);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 40, left: 8, bottom: 0 }} barCategoryGap={8}>
        <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
        <XAxis type="number" {...axisProps} allowDecimals={false} hide />
        <YAxis type="category" dataKey="label" {...axisProps} width={110} />
        <Tooltip content={<TooltipBox />} cursor={{ fill: 'color-mix(in srgb, var(--text) 5%, transparent)' }} />
        <Bar dataKey="value" name="Count" radius={[0, 4, 4, 0]} isAnimationActive animationDuration={600} label={{ position: 'right', fill: 'var(--text)', fontSize: 11 }}>
          {data.map((d) => <Cell key={d.key} fill={d.color ?? STATUS_COLOR[d.key] ?? SERIES[0]} stroke="var(--surface)" strokeWidth={2} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Donut with legend + centre total; ≤ 6 slices, rest folded into "Other". */
export function DonutChart({ data, total, height = 224 }: { data: { key: string; label: string; value: number; color?: string }[]; total?: number; height?: number }) {
  const sorted = [...data].filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, 6);
  const rest = sorted.slice(6).reduce((s, d) => s + d.value, 0);
  const rows = rest > 0 ? [...top, { key: 'other', label: 'Other', value: rest, color: 'var(--chart-axis)' }] : top;
  const sum = total ?? rows.reduce((s, d) => s + d.value, 0);
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={rows} dataKey="value" nameKey="label" innerRadius="58%" outerRadius="82%" paddingAngle={2} stroke="var(--surface)" strokeWidth={2} isAnimationActive animationDuration={700}>
            {rows.map((d) => <Cell key={d.key} fill={d.color ?? STATUS_COLOR[d.key] ?? SERIES[0]} />)}
          </Pie>
          <Tooltip content={<TooltipBox />} />
          <Legend verticalAlign="bottom" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)' }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 text-center">
        <p className="text-2xl font-bold leading-none">{sum}</p>
        <p className="text-[11px] text-muted">total</p>
      </div>
    </div>
  );
}
