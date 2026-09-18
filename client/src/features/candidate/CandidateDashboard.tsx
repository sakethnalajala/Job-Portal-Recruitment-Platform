import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Bell, Bookmark, ClipboardList, Sparkles, UserRoundPen } from 'lucide-react';
import { interviewsApi } from '@/features/recruiter/portals.api';
import { UpcomingInterviews } from './ApplicationsPages';
import { Badge, Button, Card, CardSkeleton, EmptyState, ErrorState, PageHeader, APPLICATION_TONE } from '@/components/ui';
import { BreakdownBars, ChartCard } from '@/components/charts';
import { StatCard } from '@/components/ui/StatCard';
import { useAuth } from '@/features/auth/AuthProvider';
import { JobCard } from '@/features/jobs/JobCard';
import { jobKeys, jobsApi } from '@/features/jobs/jobs.api';
import { get, toApiError } from '@/lib/api';
import { LABELS, timeAgo } from '@/lib/utils';
import type { ApplicationStatus, JobCard as JobCardType } from '@/types/api';

interface CandidateStats {
  applications: { byStatus: Record<ApplicationStatus, number>; total: number };
  savedJobs: number;
  unreadNotifications: number;
  profile: { completion: number; skills: number; hasResume: boolean };
  recentApplications: { id: string; status: ApplicationStatus; appliedAt: string; job: JobCardType | null }[];
}

export function CandidateDashboard() {
  const { user } = useAuth();
  const stats = useQuery({ queryKey: ['stats', 'candidate'], queryFn: () => get<CandidateStats>('/stats/candidate'), select: (r) => r.data });
  const recommended = useQuery({ queryKey: jobKeys.recommended, queryFn: () => jobsApi.recommended(1, 3), select: (r) => r.data });
  const interviews = useQuery({ queryKey: ['interviews', 'mine'], queryFn: interviewsApi.mine, select: (r) => r.data.interviews.filter((i) => i.isUpcoming).length });

  const firstName = user?.profile?.fullName?.split(' ')[0] ?? 'there';
  const s = stats.data;
  const active = s ? s.applications.byStatus.applied + s.applications.byStatus.under_review + s.applications.byStatus.shortlisted + s.applications.byStatus.interview : 0;

  return (
    <div>
      <PageHeader title={`Good to see you, ${firstName}`} description="Here's what's happening with your job search." actions={<Link to="/jobs"><Button className="btn-gradient" rightIcon={<ArrowRight className="h-4 w-4" />}>Find jobs</Button></Link>} />

      {stats.isError ? (
        <ErrorState message={toApiError(stats.error).message} onRetry={() => void stats.refetch()} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Active applications" value={active} hint={s ? `${s.applications.total} total` : undefined} icon={<ClipboardList className="h-5 w-5" />} to="/candidate/applications" loading={stats.isPending} />
          <StatCard label="Interviews" value={s?.applications.byStatus.interview ?? 0} icon={<Sparkles className="h-5 w-5" />} tone="warning" to="/candidate/applications?status=interview" loading={stats.isPending} />
          <StatCard label="Saved jobs" value={s?.savedJobs ?? 0} icon={<Bookmark className="h-5 w-5" />} tone="violet" to="/candidate/saved" loading={stats.isPending} />
          <StatCard label="Profile strength" value={`${s?.profile.completion ?? 0}%`} hint={s && !s.profile.hasResume ? 'Upload a resume to apply' : undefined} icon={<UserRoundPen className="h-5 w-5" />} tone="success" to="/candidate/profile" loading={stats.isPending} />
        </div>
      )}

      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Your portals">
        {[
          { to: '/candidate/notifications', icon: Bell, title: 'Notifications', text: 'Job alerts, updates & invites', count: s?.unreadNotifications, countLabel: 'unread' },
          { to: '/candidate/saved', icon: Bookmark, title: 'Saved jobs & alerts', text: 'Bookmarks and new matches', count: s?.savedJobs, countLabel: 'saved' },
          { to: '/candidate/applications', icon: ClipboardList, title: 'Application tracking', text: 'Every stage, in one place', count: interviews.data, countLabel: 'upcoming interviews' },
          { to: '/candidate/profile', icon: UserRoundPen, title: 'Profile & resume', text: 'Skills, experience, resume', count: s ? `${s.profile.completion}%` : undefined, countLabel: 'complete' },
        ].map((l) => (
          <Link key={l.to} to={l.to} className="group flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-hover">
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 transition-transform group-hover:scale-105 dark:bg-primary-950/60 dark:text-primary-300">
              <l.icon className="h-5 w-5" />
              {l.to === '/candidate/notifications' && typeof l.count === 'number' && l.count > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-600 px-1 text-[10px] font-bold text-white">{l.count}</span>}
            </span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{l.title}</span><span className="block truncate text-xs text-muted">{l.text}</span></span>
            {l.count !== undefined && <span className="shrink-0 text-right"><span className="block text-sm font-semibold">{l.count}</span><span className="block text-[10px] uppercase tracking-wide text-faint">{l.countLabel}</span></span>}
          </Link>
        ))}
      </section>

      <div className="mt-6"><UpcomingInterviews /></div>

      <div className="mt-2 grid gap-6 lg:grid-cols-[1fr_360px]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recommended for you</h2>
            <Link to="/jobs" className="text-sm font-medium text-primary-600 hover:underline dark:text-primary-400">Browse all</Link>
          </div>
          {recommended.isPending ? (
            <div className="grid gap-4 md:grid-cols-2">{Array.from({ length: 2 }).map((_, i) => <CardSkeleton key={i} />)}</div>
          ) : recommended.isError || recommended.data.jobs.length === 0 ? (
            <EmptyState icon={<Sparkles className="h-6 w-6" />} title="No recommendations yet" description="Add skills and your city to your profile and we'll match you with open roles." action={<Link to="/candidate/profile"><Button variant="outline">Complete profile</Button></Link>} />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">{recommended.data.jobs.map((j) => <JobCard key={j.id} job={j} />)}</div>
          )}
        </section>

        <section className="space-y-6">
          <ChartCard title="Applications by stage" description="Where your applications stand" loading={stats.isPending} empty={!s || s.applications.total === 0}>
            <BreakdownBars data={(Object.entries(s?.applications.byStatus ?? {}) as [ApplicationStatus, number][]).filter(([, v]) => v > 0).map(([k, v]) => ({ key: k, label: LABELS.applicationStatus[k], value: v }))} />
          </ChartCard>
          <h2 className="mb-3 text-lg font-semibold">Recent applications</h2>
          <Card>
            {stats.isPending ? (
              <div className="space-y-3 p-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-3" />)}</div>
            ) : !s || s.recentApplications.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted">You haven't applied to anything yet.</div>
            ) : (
              <ul className="divide-y divide-border">
                {s.recentApplications.map((a) => (
                  <li key={a.id}>
                    <Link to={`/candidate/applications/${a.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{a.job?.title ?? 'Job unavailable'}</p>
                        <p className="truncate text-xs text-muted">{a.job?.companyName} · {timeAgo(a.appliedAt)}</p>
                      </div>
                      <Badge tone={APPLICATION_TONE[a.status] ?? 'neutral'}>{LABELS.applicationStatus[a.status]}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-border p-3 text-center">
              <Link to="/candidate/applications" className="text-sm font-medium text-primary-600 hover:underline dark:text-primary-400">View all applications</Link>
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
