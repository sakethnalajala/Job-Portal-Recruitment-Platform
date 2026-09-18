import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Bell, Building2, CalendarClock, CheckCircle2, ClipboardList, ExternalLink, FileText, MapPin, Phone, Sparkles, Video, XCircle, Bookmark } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, Card, CardSkeleton, EmptyState, ErrorState, PageHeader, Skeleton, APPLICATION_TONE } from '@/components/ui';
import { BackButton } from '@/components/ui/BackButton';
import { FilterPills, Pagination } from '@/components/ui/DataTable';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { JobCard } from '@/features/jobs/JobCard';
import { jobKeys, jobsApi } from '@/features/jobs/jobs.api';
import { interviewsApi, type Interview } from '@/features/recruiter/portals.api';
import { get, toApiError } from '@/lib/api';
import { formatDate, LABELS, timeAgo } from '@/lib/utils';
import type { ApplicationStatus } from '@/types/api';
import { candidateApi } from './candidate.api';

const STATUSES: ApplicationStatus[] = ['applied', 'under_review', 'shortlisted', 'interview', 'selected', 'rejected', 'withdrawn'];
const STAGES: ApplicationStatus[] = ['applied', 'under_review', 'shortlisted', 'interview', 'selected'];
const MODE_ICON = { video: Video, phone: Phone, onsite: MapPin } as const;

/** Upcoming interview rounds across all applications (from /interviews/me). */
export function UpcomingInterviews({ applicationId, title = 'Upcoming interviews' }: { applicationId?: string; title?: string }) {
  const q = useQuery({ queryKey: ['interviews', 'mine'], queryFn: interviewsApi.mine, select: (r) => r.data.interviews });
  const rounds = (q.data ?? []).filter((i) => (!applicationId || i.applicationId === applicationId) && (applicationId ? true : i.isUpcoming));
  if (q.isPending || rounds.length === 0) return null;
  return (
    <Card className="mb-5 overflow-hidden border-warning/40">
      <div className="flex items-center justify-between border-b border-border bg-warning-bg/40 px-4 py-2.5"><h2 className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="h-4 w-4 text-warning" />{title}</h2><span className="text-xs text-muted">{rounds.length} round{rounds.length > 1 ? 's' : ''}</span></div>
      <ul className="divide-y divide-border">
        {rounds.map((i: Interview) => { const Icon = MODE_ICON[i.mode]; return (
          <li key={i.id} className="flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{i.title} · Round {i.round}{i.job ? <span className="font-normal text-muted"> · {i.job.title} at {i.job.companyName}</span> : null}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
                <span>{formatDate(i.scheduledAt, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {i.durationMinutes} min</span>
                <span className="inline-flex items-center gap-1"><Icon className="h-3.5 w-3.5" />{i.mode === 'onsite' ? i.location ?? 'In person' : i.mode === 'video' ? 'Video call' : 'Phone'}</span>
                {i.meetingLink && <a href={i.meetingLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary-600 hover:underline"><ExternalLink className="h-3.5 w-3.5" />Join link</a>}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge tone={i.status === 'completed' ? 'success' : i.status === 'cancelled' || i.status === 'no_show' ? 'danger' : i.status === 'rescheduled' ? 'warning' : 'info'}>{i.status.replace('_', ' ')}</Badge>
              {!applicationId && <Link to={`/candidate/applications/${i.applicationId}`} className="text-xs font-medium text-primary-600 hover:underline">Details</Link>}
            </div>
          </li>
        ); })}
      </ul>
    </Card>
  );
}

export function ApplicationsPage() {
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? '') as ApplicationStatus | '';
  const page = Number(params.get('page') ?? 1);
  const query = useQuery({ queryKey: ['candidate', 'applications', { status, page }], queryFn: () => candidateApi.applications({ status: status || undefined, page, limit: 10 }), placeholderData: keepPreviousData });
  const stats = useQuery({ queryKey: ['stats', 'candidate'], queryFn: () => get<{ applications: { byStatus: Record<ApplicationStatus, number>; total: number } }>('/stats/candidate'), select: (r) => r.data.applications });
  const setStatus = (s: ApplicationStatus | '') => setParams(s ? { status: s } : {});
  const counts = stats.data ? { all: stats.data.total, ...stats.data.byStatus } : undefined;
  const active = stats.data ? stats.data.byStatus.applied + stats.data.byStatus.under_review + stats.data.byStatus.shortlisted + stats.data.byStatus.interview : 0;

  return (
    <div>
      <BackButton fallback="/candidate" className="mb-2" />
      <PageHeader title="My applications" description={stats.data ? `${active} in progress · ${stats.data.byStatus.selected} selected · ${stats.data.total} total` : 'Track every application from submission to offer.'} actions={<Link to="/candidate/notifications?type=application_status"><Button variant="outline" size="sm" leftIcon={<Bell className="h-4 w-4" />}>Status updates</Button></Link>} />
      <UpcomingInterviews />
      <div className="mb-4"><FilterPills value={status} onChange={setStatus} options={STATUSES.map((s) => ({ value: s, label: LABELS.applicationStatus[s] }))} counts={counts} /></div>

      {query.isPending ? <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}</div>
        : query.isError ? <ErrorState message={toApiError(query.error).message} onRetry={() => void query.refetch()} />
        : query.data.data.applications.length === 0 ? <EmptyState icon={<ClipboardList className="h-6 w-6" />} title={status ? `No ${LABELS.applicationStatus[status].toLowerCase()} applications` : "You haven't applied yet"} description="Find a role that matches your skills and apply with one click." action={<Link to="/jobs"><Button>Browse jobs</Button></Link>} />
        : (
          <ul className="space-y-3">
            {query.data.data.applications.map((a, i) => (
              <motion.li key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <Link to={`/candidate/applications/${a.id}`} className="block rounded-2xl border border-border bg-surface p-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-hover">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      {a.job?.companyLogoUrl ? <img src={a.job.companyLogoUrl} alt="" className="h-11 w-11 rounded-xl object-cover bg-surface-2" /> : <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-950/60 dark:text-primary-300"><Building2 className="h-5 w-5" /></div>}
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{a.job?.title ?? 'Job unavailable'}</p>
                        <p className="truncate text-sm text-muted">{a.job?.companyName} · {a.job?.location?.city ?? ''} · Applied {timeAgo(a.appliedAt)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                      <Badge tone={APPLICATION_TONE[a.status] ?? 'neutral'}>{LABELS.applicationStatus[a.status]}</Badge>
                      {a.status === 'interview' && a.interview?.scheduledAt && <span className="inline-flex items-center gap-1 text-xs text-warning"><CalendarClock className="h-3.5 w-3.5" />{formatDate(a.interview.scheduledAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
                      {a.statusHistory?.length > 1 && <span className="text-xs text-muted">Updated {timeAgo(a.statusHistory[a.statusHistory.length - 1]!.changedAt)}</span>}
                    </div>
                  </div>
                </Link>
              </motion.li>
            ))}
          </ul>
        )}
      <Pagination meta={query.data?.meta} onPage={(p) => setParams({ ...(status ? { status } : {}), page: String(p) })} className="mt-6" />
    </div>
  );
}

export function ApplicationDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const query = useQuery({ queryKey: ['candidate', 'application', id], queryFn: () => candidateApi.application(id), select: (r) => r.data.application, enabled: Boolean(id) });
  const withdraw = useMutation({
    mutationFn: () => candidateApi.withdraw(id),
    onSuccess: () => { toast.success('Application withdrawn'); setConfirm(false); void qc.invalidateQueries({ queryKey: ['candidate'] }); void qc.invalidateQueries({ queryKey: ['stats'] }); void qc.invalidateQueries({ queryKey: ['jobs'] }); },
    onError: (e) => toast.error(toApiError(e).message),
  });

  if (query.isPending) return <div className="space-y-4"><Skeleton className="h-8 w-40" /><Skeleton className="h-48 w-full" /></div>;
  if (query.isError) return <ErrorState title={toApiError(query.error).status === 404 ? 'Application not found' : undefined} message={toApiError(query.error).message} />;
  const a = query.data;
  const stageIndex = STAGES.indexOf(a.status);
  const terminalBad = a.status === 'rejected' || a.status === 'withdrawn';

  return (
    <div className="mx-auto max-w-4xl">
      <BackButton fallback="/candidate/applications" className="mb-2" />
      <PageHeader title={a.job?.title ?? 'Application'} description={a.job ? `${a.job.companyName} · Applied ${formatDate(a.appliedAt)}` : undefined} actions={
        <>
          {a.job && <Link to={`/jobs/${a.jobId}`}><Button variant="outline" leftIcon={<ExternalLink className="h-4 w-4" />}>View job</Button></Link>}
          {a.canWithdraw && <Button variant="danger" onClick={() => setConfirm(true)}>Withdraw</Button>}
        </>
      } />

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Progress</h2><Badge tone={APPLICATION_TONE[a.status] ?? 'neutral'}>{LABELS.applicationStatus[a.status]}</Badge></div>
        <ol className="grid grid-cols-5 gap-1" aria-label="Application stages">
          {STAGES.map((s, i) => {
            const done = !terminalBad && i <= stageIndex;
            return (
              <li key={s} className="text-center">
                <div className={`mx-auto mb-1.5 h-1.5 rounded-full transition-colors ${done ? 'bg-primary-600' : terminalBad ? 'bg-danger/40' : 'bg-surface-3'}`} />
                <p className={`text-[11px] sm:text-xs ${done ? 'font-medium text-text' : 'text-muted'}`}>{LABELS.applicationStatus[s]}</p>
              </li>
            );
          })}
        </ol>
        {terminalBad && <p className="mt-3 flex items-center gap-1.5 text-sm text-muted"><XCircle className="h-4 w-4 text-danger" />{a.status === 'withdrawn' ? `You withdrew this application on ${formatDate(a.withdrawnAt)}.` : 'The recruiter has moved forward with other candidates.'}</p>}
        {a.status === 'selected' && <p className="mt-3 flex items-center gap-1.5 text-sm text-success"><CheckCircle2 className="h-4 w-4" />Congratulations — you have been selected!</p>}
      </Card>

      {a.interview && a.interview.scheduledAt && (
        <Card className="mt-4 border-warning/40 bg-warning-bg/40 p-5">
          <h2 className="flex items-center gap-2 font-semibold"><CalendarClock className="h-5 w-5 text-warning" />Interview details</h2>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-muted">When</dt><dd className="font-medium">{formatDate(a.interview.scheduledAt, { dateStyle: 'full', timeStyle: 'short' })}</dd></div>
            <div><dt className="text-xs text-muted">Mode</dt><dd className="font-medium capitalize">{a.interview.mode}{a.interview.durationMinutes ? ` · ${a.interview.durationMinutes} min` : ''}</dd></div>
            {a.interview.meetingLink && <div className="sm:col-span-2"><dt className="text-xs text-muted">Meeting link</dt><dd><a href={a.interview.meetingLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary-600 hover:underline"><Video className="h-4 w-4" />{a.interview.meetingLink}</a></dd></div>}
            {a.interview.location && <div className="sm:col-span-2"><dt className="text-xs text-muted">Location</dt><dd className="flex items-center gap-1"><MapPin className="h-4 w-4 text-muted" />{a.interview.location}</dd></div>}
            {a.interview.notes && <div className="sm:col-span-2"><dt className="text-xs text-muted">Notes from the recruiter</dt><dd className="whitespace-pre-line">{a.interview.notes}</dd></div>}
          </dl>
        </Card>
      )}

      <div className="mt-4"><UpcomingInterviews applicationId={a.id} title="Interview rounds" /></div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {a.coverLetter && <Card className="p-5"><h2 className="font-semibold">Cover letter</h2><p className="mt-2 whitespace-pre-line text-sm text-text-secondary">{a.coverLetter}</p></Card>}
          {a.answers.length > 0 && (
            <Card className="p-5">
              <h2 className="font-semibold">Screening answers</h2>
              <dl className="mt-3 space-y-3">{a.answers.map((q) => <div key={q.questionId}><dt className="text-sm font-medium">{q.question}</dt><dd className="mt-0.5 text-sm text-text-secondary">{q.answer}</dd></div>)}</dl>
            </Card>
          )}
          <Card className="p-5">
            <h2 className="font-semibold">Timeline</h2>
            <ol className="mt-3 space-y-3 border-l border-border pl-4">
              {[...a.statusHistory].reverse().map((h, i) => (
                <li key={i} className="relative text-sm">
                  <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary-600 ring-4 ring-surface" />
                  <p className="font-medium">{LABELS.applicationStatus[h.status]}</p>
                  {h.note && <p className="text-text-secondary">{h.note}</p>}
                  <p className="text-xs text-muted">{formatDate(h.changedAt, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
        <aside className="space-y-4">
          {a.resume && <Card className="p-5"><h2 className="font-semibold">Submitted resume</h2><p className="mt-2 flex items-center gap-2 text-sm"><FileText className="h-4 w-4 text-primary-600" /><span className="truncate">{a.resume.originalName}</span></p></Card>}
          {a.job && <JobCard job={a.job} compact />}
        </aside>
      </div>

      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => withdraw.mutate()} loading={withdraw.isPending} tone="danger" title="Withdraw this application?" description="The recruiter will be notified. You cannot re-apply to the same job afterwards." confirmLabel="Withdraw" />
    </div>
  );
}

const ALERT_WINDOW_DAYS = 7;

/** Job alerts = fresh matches from the recommendation engine (skills + city + preferences), posted in the last week. */
function JobAlertsTab() {
  const q = useQuery({ queryKey: [...jobKeys.recommended, 'alerts'], queryFn: () => jobsApi.recommended(1, 24), select: (r) => r.data });
  const since = Date.now() - ALERT_WINDOW_DAYS * 86_400_000;
  const fresh = (q.data?.jobs ?? []).filter((j) => j.publishedAt && new Date(j.publishedAt).getTime() >= since);
  const older = (q.data?.jobs ?? []).filter((j) => !fresh.includes(j));
  const basis = q.data?.basis;
  const hasBasis = Boolean(basis && (basis.skills.length > 0 || basis.city));
  return (
    <div>
      <Card className="mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-sm">
          <p className="font-medium">Alerts are based on your profile</p>
          <p className="mt-0.5 text-muted">
            {hasBasis ? <>Matching {basis!.skills.length > 0 ? <>skills <span className="font-medium text-text">{basis!.skills.slice(0, 5).join(', ')}{basis!.skills.length > 5 ? ` +${basis!.skills.length - 5}` : ''}</span></> : null}{basis!.skills.length > 0 && basis!.city ? ' and ' : ''}{basis!.city ? <>jobs in <span className="font-medium text-text">{basis!.city}</span></> : null}.</> : 'Add skills and your city to start receiving matches.'}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link to="/candidate/profile"><Button variant="outline" size="sm">Update profile</Button></Link>
          <Link to="/candidate/notifications?tab=preferences"><Button variant="outline" size="sm" leftIcon={<Bell className="h-4 w-4" />}>Alert emails</Button></Link>
        </div>
      </Card>
      {q.isPending ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}</div>
        : q.isError ? <ErrorState message={toApiError(q.error).message} onRetry={() => void q.refetch()} />
        : !q.data.jobs.length ? <EmptyState icon={<Sparkles className="h-6 w-6" />} title="No matches yet" description="Add at least three skills and your city to your profile — new postings that match will appear here." action={<Link to="/candidate/profile"><Button>Complete profile</Button></Link>} />
        : (
          <>
            <div className="mb-3 flex items-center gap-2"><h2 className="font-semibold">New this week</h2><Badge tone={fresh.length ? 'primary' : 'neutral'}>{fresh.length}</Badge></div>
            {fresh.length === 0 ? <p className="mb-6 text-sm text-muted">Nothing new in the last {ALERT_WINDOW_DAYS} days. Earlier matches are below.</p>
              : <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{fresh.map((j) => <JobCard key={j.id} job={j} />)}</div>}
            {older.length > 0 && (
              <>
                <h2 className="mb-3 font-semibold">Earlier matches</h2>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{older.map((j) => <JobCard key={j.id} job={j} />)}</div>
              </>
            )}
          </>
        )}
    </div>
  );
}

export function SavedJobsPage() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? 1);
  const tab = params.get('tab') === 'alerts' ? 'alerts' : 'saved';
  const query = useQuery({ queryKey: [...jobKeys.saved, page], queryFn: () => jobsApi.saved(page, 12), placeholderData: keepPreviousData, enabled: tab === 'saved' });
  const total = query.data?.meta?.total;
  const tabClass = (active: boolean) => (active ? 'inline-flex items-center gap-2 rounded-lg bg-surface px-4 py-2 text-text shadow-sm' : 'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-muted hover:text-text');
  return (
    <div>
      <BackButton fallback="/candidate" className="mb-2" />
      <PageHeader title="Saved jobs & alerts" description={tab === 'saved' ? 'Roles you bookmarked to come back to.' : 'New postings that match your skills, city and preferences.'} actions={<Link to="/jobs"><Button variant="outline" size="sm">Browse jobs</Button></Link>} />
      <div className="mb-5 inline-flex rounded-xl border border-border bg-surface-2 p-1 text-sm font-medium" role="tablist">
        <button role="tab" aria-selected={tab === 'saved'} onClick={() => setParams({})} className={tabClass(tab === 'saved')}><Bookmark className="h-4 w-4" />Saved{typeof total === 'number' ? <span className="rounded-full bg-black/10 px-1.5 text-xs dark:bg-white/10">{total}</span> : null}</button>
        <button role="tab" aria-selected={tab === 'alerts'} onClick={() => setParams({ tab: 'alerts' })} className={tabClass(tab === 'alerts')}><Bell className="h-4 w-4" />Job alerts</button>
      </div>
      {tab === 'alerts' ? <JobAlertsTab /> : (
        <>
          {query.isPending ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}</div>
            : query.isError ? <ErrorState message={toApiError(query.error).message} onRetry={() => void query.refetch()} />
            : query.data.data.jobs.length === 0 ? <EmptyState icon={<Bookmark className="h-6 w-6" />} title="No saved jobs" description="Tap the bookmark on any job to keep it here." action={<Link to="/jobs"><Button>Browse jobs</Button></Link>} />
            : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{query.data.data.jobs.map((j) => <JobCard key={j.id} job={j} />)}</div>}
          <Pagination meta={query.data?.meta} onPage={(p) => setParams({ page: String(p) })} className="mt-6" />
        </>
      )}
    </div>
  );
}
