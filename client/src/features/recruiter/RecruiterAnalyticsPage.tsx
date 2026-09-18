import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Briefcase, CalendarClock, ClipboardList, Download, Eye, FileJson, Percent, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, ErrorState, PageHeader, JOB_TONE } from '@/components/ui';
import { BackButton } from '@/components/ui/BackButton';
import { DataTable, FilterPills, type Column } from '@/components/ui/DataTable';
import { Dropdown, MenuItem } from '@/components/ui/extras';
import { StatCard } from '@/components/ui/StatCard';
import { BreakdownBars, ChartCard, DonutChart, SERIES, TimeSeriesChart } from '@/components/charts';
import { useListParams } from '@/features/admin/useListParams';
import { toApiError } from '@/lib/api';
import { formatDate, LABELS } from '@/lib/utils';
import type { ApplicationStatus, JobStatus, WorkType, ExperienceLevel } from '@/types/api';
import { recruiterAnalyticsApi, type RecruiterAnalytics } from './portals.api';

const RANGES = [{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: '365', label: '1 year' }] as const;
type JobRow = RecruiterAnalytics['jobs'][number];

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
const csvEscape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export function RecruiterAnalyticsPage() {
  const { get, set } = useListParams({ days: '30' });
  const days = Number(get('days'));
  const q = useQuery({ queryKey: ['stats', 'recruiter', 'analytics', days], queryFn: () => recruiterAnalyticsApi.get(days), select: (r) => r.data, placeholderData: keepPreviousData });
  const a = q.data;
  const loading = q.isPending;

  const exportCsv = () => {
    if (!a) return;
    const header = ['Job', 'Status', 'Published', 'Views', 'Applications', 'Shortlisted', 'Interview', 'Selected', 'Rejected', 'View→apply %'];
    const rows = a.jobs.map((j) => [j.title, j.status, j.publishedAt ? formatDate(j.publishedAt) : '', j.views, j.applications, j.shortlisted, j.interview, j.selected, j.rejected, j.conversion]);
    const summary = [['Range (days)', a.rangeDays], ['Total jobs', a.totals.jobs], ['Open jobs', a.totals.openJobs], ['Applications (all time)', a.totals.applications], [`Applications (last ${a.rangeDays}d)`, a.totals.applicationsInRange], ['Total views', a.totals.views], ['Offer rate %', a.funnel.allTime.offerRate], ['Interview rate %', a.funnel.allTime.interviewRate]];
    const csv = [...summary.map((r) => r.map(csvEscape).join(',')), '', header.map(csvEscape).join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\n');
    download(`talentbridge-recruiter-report-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8');
    toast.success('CSV report downloaded');
  };
  const exportJson = () => { if (!a) return; download(`talentbridge-recruiter-analytics-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(a, null, 2), 'application/json'); toast.success('JSON export downloaded'); };

  if (q.isError) return <div><PageHeader title="Analytics" /><ErrorState message={toApiError(q.error).message} onRetry={() => void q.refetch()} /></div>;

  const funnel = a?.funnel.inRange;
  const columns: Column<JobRow>[] = [
    { key: 'job', header: 'Job', cell: (j) => <div className="min-w-0"><Link to={`/recruiter/jobs/${j.id}/applicants`} className="truncate font-medium hover:text-primary-600">{j.title}</Link><p className="text-xs text-muted">{j.publishedAt ? `Posted ${formatDate(j.publishedAt)}` : 'Draft'}</p></div> },
    { key: 'status', header: 'Status', hideBelow: 'md', cell: (j) => <Badge tone={JOB_TONE[j.status] ?? 'neutral'}>{LABELS.jobStatus[j.status as JobStatus] ?? j.status}</Badge> },
    { key: 'views', header: 'Views', cell: (j) => <span className="font-medium">{j.views}</span> },
    { key: 'apps', header: 'Applications', cell: (j) => <span className="font-medium">{j.applications}</span> },
    { key: 'conv', header: 'View → apply', hideBelow: 'md', cell: (j) => <div className="flex items-center gap-2"><div className="h-1.5 w-20 rounded-full bg-surface-3"><div className="h-full rounded-full bg-primary-500" style={{ width: `${Math.min(100, j.conversion)}%` }} /></div><span className="text-xs">{j.conversion}%</span></div> },
    { key: 'pipeline', header: 'Shortlist / Interview / Selected', hideBelow: 'lg', cell: (j) => <span className="text-text-secondary">{j.shortlisted} / {j.interview} / <span className="font-semibold text-success">{j.selected}</span></span> },
  ];

  return (
    <div>
      <BackButton fallback="/recruiter" className="mb-2" />
      <PageHeader title="Analytics" description="Hiring performance across your postings — computed live." actions={
        <div className="flex items-center gap-2">
          <FilterPills value={String(days) as (typeof RANGES)[number]['value']} onChange={(v) => set({ days: v || '30' })} options={[...RANGES]} allLabel="30 days" />
          <Dropdown trigger={({ toggle }) => <Button variant="outline" onClick={toggle} leftIcon={<Download className="h-4 w-4" />} disabled={!a}>Export</Button>}>
            {(close) => <><MenuItem icon={<Download className="h-4 w-4" />} onClick={() => { close(); exportCsv(); }}>Report as CSV</MenuItem><MenuItem icon={<FileJson className="h-4 w-4" />} onClick={() => { close(); exportJson(); }}>Raw data as JSON</MenuItem></>}
          </Dropdown>
        </div>
      } />

      <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.04 } } }} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {[
          { label: 'Job postings', value: a?.totals.jobs ?? 0, hint: `${a?.totals.openJobs ?? 0} open`, icon: <Briefcase className="h-5 w-5" />, tone: 'primary' as const, to: '/recruiter/jobs' },
          { label: 'Total applicants', value: a?.totals.applications ?? 0, hint: `${a?.totals.applicationsInRange ?? 0} in last ${days}d`, icon: <ClipboardList className="h-5 w-5" />, tone: 'violet' as const, to: '/recruiter/applicants' },
          { label: 'Job views', value: a?.totals.views ?? 0, hint: `${a?.totals.viewToApplyRate ?? 0}% apply after viewing`, icon: <Eye className="h-5 w-5" />, tone: 'success' as const },
          { label: 'Interview rate', value: `${a?.funnel.allTime.interviewRate ?? 0}%`, hint: 'of all applicants', icon: <TrendingUp className="h-5 w-5" />, tone: 'warning' as const },
          { label: 'Offer rate', value: `${a?.funnel.allTime.offerRate ?? 0}%`, hint: `${a?.funnel.allTime.selected ?? 0} selected`, icon: <Percent className="h-5 w-5" />, tone: 'success' as const },
          { label: 'Upcoming interviews', value: a?.totals.upcomingInterviews ?? 0, hint: `${a?.totals.interviewsHeld ?? 0} completed`, icon: <CalendarClock className="h-5 w-5" />, tone: 'primary' as const, to: '/recruiter/interviews' },
        ].map((c) => <motion.div key={c.label} variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}><StatCard {...c} loading={loading} /></motion.div>)}
      </motion.div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ChartCard title="Application trend" description={`Last ${days} days · ${a?.totals.applicationsInRange ?? 0} received`} loading={loading} empty={!a?.trends.applications.length}>
          <TimeSeriesChart data={a?.trends.applications ?? []} name="Applications" />
        </ChartCard>
        <ChartCard title="Candidate conversion" description={`Funnel for applications received in the last ${days} days`} loading={loading}>
          <div className="space-y-2.5 text-sm">
            {[['Applied', funnel?.applications ?? 0, 100], ['Shortlisted', funnel?.shortlisted ?? 0, funnel?.shortlistRate ?? 0], ['Interviewed', funnel?.interview ?? 0, funnel?.interviewRate ?? 0], ['Selected', funnel?.selected ?? 0, funnel?.offerRate ?? 0]].map(([l, v, p], i) => (
              <div key={String(l)}>
                <div className="flex justify-between"><span className="text-text-secondary">{l}</span><span className="font-semibold">{v} <span className="text-xs text-muted">({p}%)</span></span></div>
                <div className="mt-1 h-2.5 rounded-full bg-surface-3"><div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.min(100, Number(p))}%`, background: SERIES[i === 3 ? 2 : 0] }} /></div>
              </div>
            ))}
            <p className="pt-1 text-xs text-muted">{funnel?.rejected ?? 0} rejected · {funnel?.withdrawn ?? 0} withdrawn</p>
          </div>
        </ChartCard>
        <ChartCard title="Applications by stage" description="All time" loading={loading} empty={!a || a.totals.applications === 0}>
          <DonutChart data={Object.entries(a?.breakdowns.applicationsByStatus ?? {}).map(([k, v]) => ({ key: k, label: LABELS.applicationStatus[k as ApplicationStatus] ?? k, value: v }))} total={a?.totals.applications} />
        </ChartCard>
        <ChartCard title="Jobs posted" description={`Last ${days} days`} loading={loading} empty={!a?.trends.jobsPosted.length}>
          <TimeSeriesChart data={a?.trends.jobsPosted ?? []} name="Jobs" color={SERIES[2]} />
        </ChartCard>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <ChartCard title="Open jobs by work type" loading={loading} empty={!Object.keys(a?.breakdowns.openJobsByWorkType ?? {}).length}>
          <BreakdownBars data={Object.entries(a?.breakdowns.openJobsByWorkType ?? {}).map(([k, v]) => ({ key: k, label: LABELS.workType[k as WorkType] ?? k, value: v, color: SERIES[0] }))} />
        </ChartCard>
        <ChartCard title="Open jobs by seniority" loading={loading} empty={!Object.keys(a?.breakdowns.openJobsByLevel ?? {}).length}>
          <BreakdownBars data={Object.entries(a?.breakdowns.openJobsByLevel ?? {}).map(([k, v]) => ({ key: k, label: LABELS.experienceLevel[k as ExperienceLevel] ?? k, value: v, color: SERIES[5] }))} />
        </ChartCard>
        <ChartCard title="Interviews" description="All rounds" loading={loading} empty={!Object.keys(a?.breakdowns.interviewsByStatus ?? {}).length}>
          <BreakdownBars data={Object.entries(a?.breakdowns.interviewsByStatus ?? {}).map(([k, v]) => ({ key: k, label: k.replace('_', ' '), value: v, color: k === 'completed' ? SERIES[2] : k === 'cancelled' || k === 'no_show' ? SERIES[6] : SERIES[3] }))} />
        </ChartCard>
      </div>

      <div className="mt-6">
        <h2 className="mb-3 text-lg font-semibold">Job performance</h2>
        <DataTable columns={columns} rows={a?.jobs} rowKey={(j) => j.id} loading={loading} empty={{ title: 'No job postings yet', action: <Link to="/recruiter/jobs/new"><Button>Post a job</Button></Link> }} caption="Job performance" />
      </div>
    </div>
  );
}
