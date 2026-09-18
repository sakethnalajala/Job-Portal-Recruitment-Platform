import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Briefcase, ClipboardList, Percent, TrendingUp, UserRound, Users } from 'lucide-react';
import { Badge, ErrorState, PageHeader } from '@/components/ui';
import { StatCard } from '@/components/ui/StatCard';
import { FilterPills } from '@/components/ui/DataTable';
import { BreakdownBars, ChartCard, DonutChart, SERIES, TimeSeriesChart } from '@/components/charts';
import { toApiError } from '@/lib/api';
import { LABELS } from '@/lib/utils';
import type { ApplicationStatus, EmploymentType, ExperienceLevel, JobStatus, WorkType } from '@/types/api';
import { adminPlatformApi, type Breakdown } from './admin.api';
import { useListParams } from './useListParams';

const RANGES = [{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: '365', label: '1 year' }] as const;
const toRows = (b: Breakdown[], label: (k: string) => string = (k) => k, color?: string) => b.map((x) => ({ key: x.key, label: label(x.key), value: x.count, ...(color ? { color } : {}) }));

export function AnalyticsPage() {
  const { get, set } = useListParams({ days: '30' });
  const days = Number(get('days'));
  const q = useQuery({ queryKey: ['admin', 'analytics', days], queryFn: () => adminPlatformApi.analytics(days), select: (r) => r.data, placeholderData: keepPreviousData });
  const a = q.data;
  const loading = q.isPending;

  if (q.isError) return <div><PageHeader title="Analytics" /><ErrorState message={toApiError(q.error).message} onRetry={() => void q.refetch()} /></div>;

  const inRange = a?.conversion.inRange;
  const cards = [
    { label: 'Total users', value: a?.totals.users ?? 0, hint: `${a?.totals.candidates ?? 0} candidates · ${a?.totals.recruiters ?? 0} recruiters`, icon: <Users className="h-5 w-5" />, tone: 'primary' as const },
    { label: 'Active jobs', value: a?.totals.activeJobs ?? 0, hint: `${a?.totals.jobs ?? 0} total postings`, icon: <Briefcase className="h-5 w-5" />, tone: 'success' as const },
    { label: 'Applications', value: a?.totals.applications ?? 0, hint: `${inRange?.applications ?? 0} in last ${days} days`, icon: <ClipboardList className="h-5 w-5" />, tone: 'violet' as const },
    { label: 'Interview rate', value: `${a?.conversion.allTime.interviewRate ?? 0}%`, hint: 'applications reaching interview', icon: <TrendingUp className="h-5 w-5" />, tone: 'warning' as const },
    { label: 'Offer rate', value: `${a?.conversion.allTime.offerRate ?? 0}%`, hint: `${a?.conversion.allTime.selected ?? 0} selected`, icon: <Percent className="h-5 w-5" />, tone: 'success' as const },
    { label: 'Verified recruiters', value: a?.totals.verifiedRecruiters ?? 0, hint: `${a?.totals.suspended ?? 0} suspended users`, icon: <UserRound className="h-5 w-5" />, tone: 'primary' as const },
  ];

  return (
    <div>
      <PageHeader title="Analytics" description="Computed live from the database — nothing here is hardcoded." actions={<FilterPills value={String(days) as (typeof RANGES)[number]['value']} onChange={(v) => set({ days: v || '30' })} options={[...RANGES]} allLabel="30 days" />} />

      <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.04 } } }} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {cards.map((c) => <motion.div key={c.label} variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}><StatCard {...c} loading={loading} /></motion.div>)}
      </motion.div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ChartCard title="User registrations" description={`Last ${days} days · ${a?.trends.signups.reduce((s, r) => s + r.count, 0) ?? 0} signups`} loading={loading} empty={!a?.trends.signups.length}>
          <TimeSeriesChart data={a?.trends.signups ?? []} name="Signups" color={SERIES[5]} />
        </ChartCard>
        <ChartCard title="Applications submitted" description={`Last ${days} days · ${inRange?.applications ?? 0}`} loading={loading} empty={!a?.trends.applications.length}>
          <TimeSeriesChart data={a?.trends.applications ?? []} name="Applications" />
        </ChartCard>
        <ChartCard title="Jobs posted" description={`Last ${days} days`} loading={loading} empty={!a?.trends.jobsPosted.length}>
          <TimeSeriesChart data={a?.trends.jobsPosted ?? []} name="Jobs" color={SERIES[2]} />
        </ChartCard>
        <ChartCard title="Conversion funnel" description={`Last ${days} days vs all time`} loading={loading}>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {[{ t: `Last ${days} days`, c: inRange }, { t: 'All time', c: a?.conversion.allTime }].map(({ t, c }) => (
              <div key={t} className="space-y-2 rounded-xl border border-border p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-faint">{t}</p>
                {[['Applications', c?.applications ?? 0, 100], ['Reached interview', c?.reachedInterview ?? 0, c?.interviewRate ?? 0], ['Selected', c?.selected ?? 0, c?.offerRate ?? 0]].map(([l, v, p]) => (
                  <div key={String(l)}>
                    <div className="flex justify-between"><span className="text-text-secondary">{l}</span><span className="font-semibold">{v} <span className="text-xs text-muted">({p}%)</span></span></div>
                    <div className="mt-1 h-1.5 rounded-full bg-surface-3"><div className="h-full rounded-full bg-primary-500 transition-[width] duration-500" style={{ width: `${Math.min(100, Number(p))}%` }} /></div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <ChartCard title="Application status" description="All applications" loading={loading} empty={!a?.breakdowns.applicationsByStatus.length}>
          <DonutChart data={toRows(a?.breakdowns.applicationsByStatus ?? [], (k) => LABELS.applicationStatus[k as ApplicationStatus] ?? k)} />
        </ChartCard>
        <ChartCard title="Jobs by status" loading={loading} empty={!a?.breakdowns.jobsByStatus.length}>
          <DonutChart data={toRows(a?.breakdowns.jobsByStatus ?? [], (k) => LABELS.jobStatus[k as JobStatus] ?? k)} />
        </ChartCard>
        <ChartCard title="Open jobs by employment type" loading={loading} empty={!a?.breakdowns.jobsByEmploymentType.length}>
          <BreakdownBars data={toRows(a?.breakdowns.jobsByEmploymentType ?? [], (k) => LABELS.employmentType[k as EmploymentType] ?? k, SERIES[0])} />
        </ChartCard>
        <ChartCard title="Open jobs by location" description="Top cities" loading={loading} empty={!a?.breakdowns.jobsByCity.length}>
          <BreakdownBars data={toRows(a?.breakdowns.jobsByCity ?? [], undefined, SERIES[2])} />
        </ChartCard>
        <ChartCard title="Open jobs by industry" description="From the company profile" loading={loading} empty={!a?.breakdowns.jobsByIndustry.length}>
          <BreakdownBars data={toRows(a?.breakdowns.jobsByIndustry ?? [], undefined, SERIES[5])} />
        </ChartCard>
        <ChartCard title="Work type & seniority" loading={loading}>
          <div className="space-y-4">
            <div><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Work type</p><div className="flex flex-wrap gap-2">{a?.breakdowns.jobsByWorkType.map((b) => <Badge key={b.key} tone="primary">{LABELS.workType[b.key as WorkType] ?? b.key} · {b.count}</Badge>)}</div></div>
            <div><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Experience level</p><div className="flex flex-wrap gap-2">{a?.breakdowns.jobsByExperienceLevel.map((b) => <Badge key={b.key} tone="violet">{LABELS.experienceLevel[b.key as ExperienceLevel] ?? b.key} · {b.count}</Badge>)}</div></div>
            <div><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Top hiring companies</p><ul className="space-y-1 text-sm">{a?.breakdowns.topCompanies.map((b) => <li key={b.key} className="flex justify-between"><span className="truncate text-text-secondary">{b.key}</span><span className="font-semibold">{b.count}</span></li>)}</ul></div>
          </div>
        </ChartCard>
      </div>

      <div className="mt-6">
        <ChartCard title="Most requested skills" description="Required skills across open jobs" loading={loading} empty={!a?.breakdowns.topSkills.length}>
          <BreakdownBars data={toRows(a?.breakdowns.topSkills ?? [], undefined, SERIES[0])} />
        </ChartCard>
      </div>
    </div>
  );
}
