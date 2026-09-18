import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Bell, CalendarClock, CalendarDays, CheckCircle2, Clock, ExternalLink, MapPin, MoreHorizontal, Pencil, Phone, UserX, Video, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, PageHeader, Select, Skeleton, Textarea } from '@/components/ui';
import { BackButton } from '@/components/ui/BackButton';
import { FilterPills, Pagination } from '@/components/ui/DataTable';
import { Dialog } from '@/components/ui/Dialog';
import { Dropdown, MenuItem } from '@/components/ui/extras';
import { StatCard } from '@/components/ui/StatCard';
import { useListParams } from '@/features/admin/useListParams';
import { toApiError } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import { InterviewDialog } from './InterviewDialog';
import { interviewsApi, type Interview, type InterviewOutcome, type InterviewRange, type InterviewStatus } from './portals.api';

const STATUS_TONE: Record<InterviewStatus, 'info' | 'warning' | 'success' | 'danger' | 'neutral'> = { scheduled: 'info', rescheduled: 'warning', completed: 'success', cancelled: 'neutral', no_show: 'danger' };
const STATUS_LABEL: Record<InterviewStatus, string> = { scheduled: 'Scheduled', rescheduled: 'Rescheduled', completed: 'Completed', cancelled: 'Cancelled', no_show: 'No-show' };
const OUTCOME_LABEL: Record<InterviewOutcome, string> = { pending: 'Pending', advance: 'Advance', hold: 'On hold', reject: 'Reject' };
const MODE_ICON = { video: Video, phone: Phone, onsite: MapPin } as const;
const RANGES: { value: InterviewRange; label: string }[] = [{ value: 'today', label: 'Today' }, { value: 'week', label: 'This week' }, { value: 'past', label: 'Past' }, { value: 'all', label: 'All' }];

const hoursUntil = (iso: string) => (new Date(iso).getTime() - Date.now()) / 3_600_000;

export function InterviewsPage() {
  const qc = useQueryClient();
  const { get, page, set, setPage } = useListParams({ range: 'upcoming' });
  const range = (get('range') || 'upcoming') as InterviewRange;
  const status = get('status');
  const [edit, setEdit] = useState<Interview | null>(null);
  const [close, setClose] = useState<{ i: Interview; status: 'completed' | 'cancelled' | 'no_show' } | null>(null);
  const [closeForm, setCloseForm] = useState({ outcome: 'pending' as InterviewOutcome, feedback: '', reason: '' });

  const q = useQuery({ queryKey: ['interviews', { range, status, page }], queryFn: () => interviewsApi.list({ range, status, page, limit: 12 }), placeholderData: keepPreviousData });
  const invalidate = () => { void qc.invalidateQueries({ queryKey: ['interviews'] }); void qc.invalidateQueries({ queryKey: ['recruiter'] }); };
  const remind = useMutation({ mutationFn: (id: string) => interviewsApi.remind(id), onSuccess: () => { toast.success('Reminder sent to the candidate'); invalidate(); }, onError: (e) => toast.error(toApiError(e).message) });
  const setStatus = useMutation({
    mutationFn: () => interviewsApi.setStatus(close!.i.id, { status: close!.status, outcome: close!.status === 'completed' ? closeForm.outcome : undefined, feedback: closeForm.feedback || undefined, reason: closeForm.reason || undefined }),
    onSuccess: () => { toast.success(`Interview marked ${STATUS_LABEL[close!.status].toLowerCase()}`); setClose(null); setCloseForm({ outcome: 'pending', feedback: '', reason: '' }); invalidate(); },
    onError: (e) => toast.error(toApiError(e).message),
  });

  const s = q.data?.data.summary;
  const items = q.data?.data.interviews ?? [];

  return (
    <div>
      <BackButton fallback="/recruiter" className="mb-2" />
      <PageHeader title="Interviews" description="Schedule, track and follow up on every round." actions={<Link to="/recruiter/applicants?status=shortlisted"><Button leftIcon={<CalendarClock className="h-4 w-4" />}>Schedule from shortlist</Button></Link>} />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Upcoming" value={s?.upcoming ?? 0} icon={<CalendarDays className="h-5 w-5" />} loading={q.isPending} />
        <StatCard label="Today" value={s?.today ?? 0} icon={<Clock className="h-5 w-5" />} tone="warning" loading={q.isPending} />
        <StatCard label="Completed" value={s?.byStatus.completed ?? 0} hint={s ? `${s.byStatus.cancelled ?? 0} cancelled · ${s.byStatus.no_show ?? 0} no-show` : undefined} icon={<CheckCircle2 className="h-5 w-5" />} tone="success" loading={q.isPending} />
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterPills value={range === 'upcoming' ? '' : range} onChange={(v) => set({ range: v || 'upcoming' })} options={RANGES} allLabel="Upcoming" />
        <div className="w-44"><Select value={status} onChange={(e) => set({ status: e.target.value })} className="h-10" aria-label="Status"><option value="">Any status</option>{(Object.keys(STATUS_LABEL) as InterviewStatus[]).map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}</Select></div>
      </div>

      <div className="mt-4">
        {q.isPending ? <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}</div>
          : q.isError ? <ErrorState message={toApiError(q.error).message} onRetry={() => void q.refetch()} />
          : items.length === 0 ? <EmptyState icon={<CalendarClock className="h-6 w-6" />} title={range === 'upcoming' ? 'No upcoming interviews' : 'Nothing here'} description="Open a shortlisted application and schedule a round." action={<Link to="/recruiter/applicants?status=shortlisted"><Button variant="outline">View shortlisted candidates</Button></Link>} />
          : (
            <ul className="space-y-3">
              {items.map((i, idx) => {
                const Icon = MODE_ICON[i.mode];
                const soon = i.isUpcoming && hoursUntil(i.scheduledAt) <= 24;
                return (
                  <motion.li key={i.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}>
                    <Card className={cn('flex flex-col gap-4 p-4 sm:flex-row sm:items-center', soon && 'border-warning/50')}>
                      <div className="flex w-full min-w-0 items-center gap-3 sm:w-auto sm:flex-1">
                        <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-primary-50 text-primary-700 dark:bg-primary-950/60 dark:text-primary-300">
                          <span className="text-[11px] font-semibold uppercase">{formatDate(i.scheduledAt, { month: 'short' })}</span>
                          <span className="text-xl font-bold leading-none">{formatDate(i.scheduledAt, { day: 'numeric' })}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link to={`/recruiter/applications/${i.applicationId}`} className="truncate font-semibold hover:text-primary-600">{i.candidate?.fullName ?? 'Candidate'}</Link>
                            <Badge tone={STATUS_TONE[i.status]}>{STATUS_LABEL[i.status]}</Badge>
                            {i.status === 'completed' && i.outcome !== 'pending' && <Badge tone={i.outcome === 'advance' ? 'success' : i.outcome === 'reject' ? 'danger' : 'warning'}>{OUTCOME_LABEL[i.outcome]}</Badge>}
                            {soon && <Badge tone="warning">In {Math.max(1, Math.round(hoursUntil(i.scheduledAt)))}h</Badge>}
                          </div>
                          <p className="truncate text-sm text-muted">{i.title} · Round {i.round} · {i.job?.title}</p>
                          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
                            <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatDate(i.scheduledAt, { hour: '2-digit', minute: '2-digit' })} – {formatDate(i.endsAt, { hour: '2-digit', minute: '2-digit' })} · {i.durationMinutes} min</span>
                            <span className="inline-flex items-center gap-1"><Icon className="h-3.5 w-3.5" />{i.mode === 'onsite' ? i.location ?? 'On-site' : i.mode === 'video' ? 'Video call' : 'Phone'}</span>
                            {i.meetingLink && <a href={i.meetingLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary-600 hover:underline"><ExternalLink className="h-3.5 w-3.5" />Join link</a>}
                            {i.reminderSentAt && <span className="inline-flex items-center gap-1 text-muted"><Bell className="h-3 w-3" />reminded {formatDate(i.reminderSentAt, { day: 'numeric', month: 'short' })}</span>}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                        <Avatar src={i.candidate?.photoUrl} name={i.candidate?.fullName} size="sm" className="hidden sm:block" />
                        {i.isUpcoming && <Button size="sm" variant="outline" leftIcon={<Bell className="h-4 w-4" />} loading={remind.isPending && remind.variables === i.id} onClick={() => remind.mutate(i.id)}>Remind</Button>}
                        <Dropdown trigger={({ toggle }) => <Button variant="ghost" size="icon" className="h-9 w-9" onClick={toggle} aria-label="Interview actions"><MoreHorizontal className="h-4 w-4" /></Button>}>
                          {(closeMenu) => (
                            <>
                              <MenuItem icon={<ExternalLink className="h-4 w-4" />} to={`/recruiter/applications/${i.applicationId}`} onClick={closeMenu}>Open application</MenuItem>
                              {i.isUpcoming && <MenuItem icon={<Pencil className="h-4 w-4" />} onClick={() => { closeMenu(); setEdit(i); }}>Reschedule / edit</MenuItem>}
                              {i.isUpcoming || i.status === 'scheduled' || i.status === 'rescheduled' ? (
                                <>
                                  <MenuItem icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => { closeMenu(); setClose({ i, status: 'completed' }); }}>Mark completed</MenuItem>
                                  <MenuItem icon={<UserX className="h-4 w-4" />} onClick={() => { closeMenu(); setClose({ i, status: 'no_show' }); }}>Mark no-show</MenuItem>
                                  <MenuItem icon={<XCircle className="h-4 w-4" />} tone="danger" onClick={() => { closeMenu(); setClose({ i, status: 'cancelled' }); }}>Cancel interview</MenuItem>
                                </>
                              ) : null}
                            </>
                          )}
                        </Dropdown>
                      </div>
                    </Card>
                  </motion.li>
                );
              })}
            </ul>
          )}
      </div>
      <Pagination meta={q.data?.meta} onPage={setPage} className="mt-6" />

      <InterviewDialog open={Boolean(edit)} onClose={() => setEdit(null)} interview={edit} />
      <Dialog open={Boolean(close)} onClose={() => setClose(null)} title={close ? `Mark as ${STATUS_LABEL[close.status].toLowerCase()}` : ''} description={close?.status === 'cancelled' ? 'The candidate is notified that the interview was cancelled.' : 'Record the outcome for your team.'} size="sm"
        footer={<><Button variant="outline" onClick={() => setClose(null)}>Back</Button><Button variant={close?.status === 'cancelled' ? 'danger' : 'primary'} loading={setStatus.isPending} onClick={() => setStatus.mutate()}>Confirm</Button></>}>
        <div className="space-y-4">
          {close?.status === 'completed' && <Select label="Outcome" value={closeForm.outcome} onChange={(e) => setCloseForm({ ...closeForm, outcome: e.target.value as InterviewOutcome })}>{(Object.keys(OUTCOME_LABEL) as InterviewOutcome[]).map((o) => <option key={o} value={o}>{OUTCOME_LABEL[o]}</option>)}</Select>}
          {close?.status === 'cancelled'
            ? <Textarea label="Reason (shared with the candidate)" rows={3} value={closeForm.reason} onChange={(e) => setCloseForm({ ...closeForm, reason: e.target.value })} />
            : <Textarea label="Feedback (private)" rows={4} value={closeForm.feedback} onChange={(e) => setCloseForm({ ...closeForm, feedback: e.target.value })} placeholder="Strengths, concerns, next steps…" />}
        </div>
      </Dialog>
    </div>
  );
}
