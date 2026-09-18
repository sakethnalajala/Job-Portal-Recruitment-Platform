import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Briefcase, Eye, PlusCircle, Users, UserCheck, ArrowRight, CalendarClock, FolderKanban, BarChart3, Building2 } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, JOB_TONE } from '@/components/ui';
import { StatCard } from '@/components/ui/StatCard';
import { BreakdownBars, ChartCard, TimeSeriesChart } from '@/components/charts';
import { useAuth } from '@/features/auth/AuthProvider';
import { get, toApiError } from '@/lib/api';
import { LABELS } from '@/lib/utils';
import type { ApplicationStatus, JobCard, JobStatus } from '@/types/api';

interface RecruiterStats {
  jobs: { byStatus: Record<JobStatus, number>; total: number };
  applications: { byStatus: Record<ApplicationStatus, number>; total: number };
  totalViews: number;
  conversionRate: number;
  unreadNotifications: number;
  applicationsPerDay: { date: string; count: number }[];
  topJobs: (JobCard & { viewCount: number })[];
}

export function RecruiterDashboard() {
  const { user } = useAuth();
  const stats = useQuery({ queryKey: ['stats', 'recruiter'], queryFn: () => get<RecruiterStats>('/stats/recruiter'), select: (r) => r.data });
  const s = stats.data;
  const loading = stats.isPending;
  const apps30 = s?.applicationsPerDay.reduce((a, b) => a + b.count, 0) ?? 0;
  const byStage = (Object.entries(s?.applications.byStatus ?? {}) as [ApplicationStatus, number][]).filter(([, v]) => v > 0).map(([k, v]) => ({ key: k, label: LABELS.applicationStatus[k], value: v }));

  if (stats.isError) return <div><PageHeader title="Recruiter dashboard" /><ErrorState message={toApiError(stats.error).message} onRetry={() => void stats.refetch()} /></div>;

  return (
    <div>
      <PageHeader title={user?.profile?.companyName ?? 'Recruiter dashboard'} description={`Welcome back, ${user?.profile?.fullName?.split(' ')[0] ?? ''}. Here's your hiring snapshot.`} actions={<Link to="/recruiter/jobs/new"><Button className="btn-gradient" leftIcon={<PlusCircle className="h-4 w-4" />}>Post a job</Button></Link>} />

      <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.05 } } }} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Open jobs', value: s?.jobs.byStatus.open ?? 0, hint: `${s?.jobs.total ?? 0} total postings`, icon: <Briefcase className="h-5 w-5" />, to: '/recruiter/jobs', tone: 'primary' as const },
          { label: 'New applicants', value: s?.applications.byStatus.applied ?? 0, hint: 'awaiting review', icon: <Users className="h-5 w-5" />, to: '/recruiter/applicants?status=applied', tone: 'warning' as const },
          { label: 'In interview', value: s?.applications.byStatus.interview ?? 0, icon: <UserCheck className="h-5 w-5" />, to: '/recruiter/applicants?status=interview', tone: 'violet' as const },
          { label: 'Total views', value: s?.totalViews ?? 0, hint: s ? `${s.conversionRate}% of applicants selected` : undefined, icon: <Eye className="h-5 w-5" />, tone: 'success' as const },
        ].map((c) => <motion.div key={c.label} variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}><StatCard {...c} loading={loading} /></motion.div>)}
      </motion.div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[3fr_2fr]">
        <ChartCard title="Applications per day" description={`Last 30 days · ${apps30} received`} loading={loading} empty={!s?.applicationsPerDay.length}>
          <TimeSeriesChart data={s?.applicationsPerDay ?? []} name="Applications" />
        </ChartCard>
        <ChartCard title="Pipeline by stage" description="All applications to your jobs" loading={loading} empty={byStage.length === 0}>
          <BreakdownBars data={byStage} />
        </ChartCard>
      </div>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { to: '/recruiter/interviews', icon: CalendarClock, title: 'Interviews', text: 'Schedule, reschedule, remind' },
          { to: '/recruiter/talent-pool', icon: FolderKanban, title: 'Talent pool', text: 'Saved candidates & notes' },
          { to: '/recruiter/analytics', icon: BarChart3, title: 'Analytics', text: 'Funnel, trends, exports' },
          { to: '/recruiter/company?tab=team', icon: Building2, title: 'Company & team', text: 'Members, roles, activity' },
        ].map((l) => (
          <Link key={l.to} to={l.to} className="group flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-hover">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 transition-transform group-hover:scale-105 dark:bg-primary-950/60 dark:text-primary-300"><l.icon className="h-5 w-5" /></span>
            <span className="min-w-0"><span className="block text-sm font-semibold">{l.title}</span><span className="block truncate text-xs text-muted">{l.text}</span></span>
          </Link>
        ))}
      </section>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Top postings by applicants</h2><Link to="/recruiter/jobs" className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:underline dark:text-primary-400">All jobs <ArrowRight className="h-4 w-4" /></Link></div>
        <Card>
          {loading ? <div className="space-y-3 p-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-3" />)}</div>
            : !s || s.topJobs.length === 0 ? <EmptyState className="border-0" title="No job postings yet" description="Publish your first role to start receiving applications." action={<Link to="/recruiter/jobs/new"><Button>Post a job</Button></Link>} />
            : (
              <ul className="divide-y divide-border">
                {s.topJobs.map((j) => (
                  <li key={j.id}>
                    <Link to={`/recruiter/jobs/${j.id}/applicants`} className="row-hover flex items-center gap-4 px-4 py-3">
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{j.title}</p><p className="text-xs text-muted">{j.viewCount} views · {LABELS.workType[j.workType]}</p></div>
                      <Badge tone={JOB_TONE[j.status] ?? 'neutral'}>{LABELS.jobStatus[j.status]}</Badge>
                      <span className="w-24 text-right text-sm font-semibold">{j.applicationCount} <span className="font-normal text-muted">applicants</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
        </Card>
      </section>
    </div>
  );
}
