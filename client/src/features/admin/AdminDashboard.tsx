import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowRight, Briefcase, ClipboardList, Flag, ShieldCheck, UserRound, Users, Building2 } from 'lucide-react';
import { Badge, ErrorState, PageHeader } from '@/components/ui';
import { StatCard } from '@/components/ui/StatCard';
import { BreakdownBars, ChartCard, DonutChart, TimeSeriesChart } from '@/components/charts';
import { toApiError } from '@/lib/api';
import { LABELS } from '@/lib/utils';
import type { ApplicationStatus, JobStatus } from '@/types/api';
import { adminApi } from './admin.api';

export function AdminDashboard() {
  const stats = useQuery({ queryKey: ['admin', 'stats'], queryFn: adminApi.stats, select: (r) => r.data });
  const s = stats.data;
  const loading = stats.isPending;

  if (stats.isError) {
    return (
      <div>
        <PageHeader title="Platform overview" />
        <ErrorState message={toApiError(stats.error).message} onRetry={() => void stats.refetch()} />
      </div>
    );
  }

  const jobsByStatus = Object.entries(s?.jobs.byStatus ?? {}).map(([k, v]) => ({ key: k, label: LABELS.jobStatus[k as JobStatus] ?? k, value: v }));
  const appsByStatus = Object.entries(s?.applications.byStatus ?? {}).map(([k, v]) => ({ key: k, label: LABELS.applicationStatus[k as ApplicationStatus] ?? k, value: v }));
  const signups30 = s?.timeseries.signups.reduce((a, b) => a + b.count, 0) ?? 0;
  const apps30 = s?.timeseries.applications.reduce((a, b) => a + b.count, 0) ?? 0;

  return (
    <div>
      <PageHeader title="Platform overview" description="Live health of the marketplace — every number comes from the database." actions={<Link to="/admin/reports" className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-2">Review queue <ArrowRight className="h-4 w-4" /></Link>} />

      <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.05 } } }} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {[
          { label: 'Total users', value: s?.users.total ?? 0, hint: `${s?.users.byStatus.active ?? 0} active`, icon: <Users className="h-5 w-5" />, to: '/admin/users', tone: 'primary' as const },
          { label: 'Candidates', value: s?.users.byRole.candidate ?? 0, icon: <UserRound className="h-5 w-5" />, to: '/admin/users?role=candidate', tone: 'violet' as const },
          { label: 'Recruiters', value: s?.users.byRole.recruiter ?? 0, hint: `${s?.recruiters.verified ?? 0} verified`, icon: <Building2 className="h-5 w-5" />, to: '/admin/users?role=recruiter', tone: 'primary' as const },
          { label: 'Active jobs', value: s?.jobs.byStatus.open ?? 0, hint: `${s?.jobs.total ?? 0} total`, icon: <Briefcase className="h-5 w-5" />, to: '/admin/jobs?status=open', tone: 'success' as const },
          { label: 'Applications', value: s?.applications.total ?? 0, hint: `${apps30} in last 30 days`, icon: <ClipboardList className="h-5 w-5" />, tone: 'violet' as const },
          { label: 'Pending reports', value: s?.reports.pending ?? 0, icon: <Flag className="h-5 w-5" />, to: '/admin/reports?status=pending', tone: 'warning' as const },
        ].map((c) => (
          <motion.div key={c.label} variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}>
            <StatCard label={c.label} value={c.value} hint={c.hint} icon={c.icon} to={c.to} tone={c.tone} loading={loading} />
          </motion.div>
        ))}
      </motion.div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ChartCard title="Applications per day" description={`Last 30 days · ${apps30} total`} loading={loading} empty={!s?.timeseries.applications.length}>
          <TimeSeriesChart data={s?.timeseries.applications ?? []} name="Applications" />
        </ChartCard>
        <ChartCard title="New signups per day" description={`Last 30 days · ${signups30} total`} loading={loading} empty={!s?.timeseries.signups.length}>
          <TimeSeriesChart data={s?.timeseries.signups ?? []} name="Signups" color="var(--chart-6)" />
        </ChartCard>
        <ChartCard title="Jobs by status" description="All postings on the platform" loading={loading} empty={jobsByStatus.length === 0}>
          <DonutChart data={jobsByStatus} total={s?.jobs.total} />
        </ChartCard>
        <ChartCard title="Applications by stage" description="Across every job" loading={loading} empty={appsByStatus.length === 0}>
          <BreakdownBars data={appsByStatus} />
        </ChartCard>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <ChartCard title="Most requested skills" description="Required skills across open jobs" loading={loading} empty={!s?.topSkills.length}>
          <BreakdownBars data={(s?.topSkills ?? []).map((t) => ({ key: t.skill, label: t.skill, value: t.count, color: 'var(--chart-1)' }))} />
        </ChartCard>
        <ChartCard title="Trust & safety" description="Moderation snapshot" loading={loading}>
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5"><dt className="flex items-center gap-2 text-muted"><ShieldCheck className="h-4 w-4 text-success" />Verified companies</dt><dd className="font-semibold">{s?.recruiters.verified ?? 0}</dd></div>
            <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5"><dt className="text-muted">Suspended users</dt><dd className="font-semibold">{s?.users.byStatus.suspended ?? 0}</dd></div>
            <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5"><dt className="text-muted">Deleted accounts</dt><dd className="font-semibold">{s?.users.byStatus.deleted ?? 0}</dd></div>
            <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5"><dt className="text-muted">Removed jobs</dt><dd className="font-semibold">{s?.jobs.byStatus.removed ?? 0}</dd></div>
            <div className="flex items-center justify-between rounded-xl border border-warning/40 bg-warning-bg px-3 py-2.5"><dt className="text-warning">Reports awaiting review</dt><dd><Badge tone="warning">{s?.reports.pending ?? 0}</Badge></dd></div>
          </dl>
        </ChartCard>
      </div>
    </div>
  );
}
