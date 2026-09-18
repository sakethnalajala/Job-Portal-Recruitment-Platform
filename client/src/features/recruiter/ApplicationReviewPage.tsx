import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookmarkCheck, BookmarkPlus, CalendarClock, Download, ExternalLink, FileText, Github, Globe, Linkedin, Mail, MapPin, Phone, Star, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, Badge, Button, Card, ErrorState, PageHeader, Skeleton, Textarea, APPLICATION_TONE } from '@/components/ui';
import { BackButton } from '@/components/ui/BackButton';
import { Dialog } from '@/components/ui/Dialog';
import { toApiError } from '@/lib/api';
import { cn, formatDate, LABELS } from '@/lib/utils';
import type { ApplicationStatus } from '@/types/api';
import { recruiterApi } from './recruiter.api';
import { InterviewDialog } from './InterviewDialog';
import { TalentEntryDialog } from './TalentPoolPage';
import { interviewsApi, talentApi } from './portals.api';

export function ApplicationReviewPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['recruiter', 'application', id], queryFn: () => recruiterApi.application(id), select: (r) => r.data.application, enabled: Boolean(id) });
  const [pending, setPending] = useState<ApplicationStatus | null>(null);
  const [note, setNote] = useState('');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [poolOpen, setPoolOpen] = useState(false);
  const rounds = useQuery({ queryKey: ['interviews', 'application', id], queryFn: () => interviewsApi.forApplication(id), select: (r) => r.data.interviews, enabled: Boolean(id) });
  const pool = useQuery({ queryKey: ['talent', 'check', query.data?.candidateId], queryFn: () => talentApi.check(query.data!.candidateId), select: (r) => r.data, enabled: Boolean(query.data?.candidateId) });
  const [notes, setNotes] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  useEffect(() => { if (query.data) { setNotes(query.data.recruiterNotes ?? ''); setRating(query.data.rating); } }, [query.data]);

  const invalidate = () => { void qc.invalidateQueries({ queryKey: ['recruiter'] }); void qc.invalidateQueries({ queryKey: ['stats'] }); };
  const move = useMutation({
    mutationFn: (status: ApplicationStatus) => recruiterApi.updateStatus(id, { status, note: note || undefined }),
    onSuccess: (_r, s) => { toast.success(`Moved to ${LABELS.applicationStatus[s]} — candidate notified`); setPending(null); setNote(''); invalidate(); },
    onError: (e) => { const err = toApiError(e); toast.error(err.details[0]?.message ?? err.message); },
  });
  const saveNotes = useMutation({ mutationFn: () => recruiterApi.updateNotes(id, { recruiterNotes: notes, rating }), onSuccess: () => { toast.success('Notes saved'); invalidate(); }, onError: (e) => toast.error(toApiError(e).message) });

  if (query.isPending) return <div className="space-y-4"><Skeleton className="h-8 w-40" /><Skeleton className="h-64 w-full" /></div>;
  if (query.isError) return <ErrorState title={toApiError(query.error).status === 404 ? 'Application not found' : undefined} message={toApiError(query.error).message} />;
  const a = query.data;
  const c = a.candidate;

  return (
    <div className="mx-auto max-w-5xl">
      <BackButton fallback={`/recruiter/jobs/${a.jobId}/applicants`} className="mb-2" />
      <PageHeader title={c?.fullName ?? 'Applicant'} description={`Applied for ${a.job?.title ?? 'a job'} · ${formatDate(a.appliedAt)}`} actions={
        <div className="flex flex-wrap items-center gap-2">
          {pool.data?.saved ? <Badge tone="success" className="text-sm"><BookmarkCheck className="h-3.5 w-3.5" />In talent pool · {pool.data.entry?.category}</Badge> : <Button variant="outline" size="sm" leftIcon={<BookmarkPlus className="h-4 w-4" />} onClick={() => setPoolOpen(true)}>Save to talent pool</Button>}
          <Badge tone={APPLICATION_TONE[a.status] ?? 'neutral'} className="text-sm">{LABELS.applicationStatus[a.status]}</Badge>
        </div>
      } />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          {/* Candidate */}
          <Card className="p-5">
            <div className="flex items-start gap-4">
              <Avatar src={c?.photoUrl} name={c?.fullName} size="lg" />
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold">{c?.fullName}</h2>
                <p className="text-sm text-muted">{c?.headline ?? '—'}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-secondary">
                  {c?.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:text-primary-600"><Mail className="h-3.5 w-3.5" />{c.email}</a>}
                  {c?.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{c.phone}</span>}
                  {c?.location?.city && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{c.location.city}</span>}
                  <span>{c?.totalExperienceYears ?? 0} yrs experience</span>
                </div>
                <div className="mt-2 flex gap-2">
                  {c?.linkedinUrl && <a href={c.linkedinUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-border p-1.5 text-muted hover:text-primary-600" aria-label="LinkedIn"><Linkedin className="h-4 w-4" /></a>}
                  {c?.githubUrl && <a href={c.githubUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-border p-1.5 text-muted hover:text-primary-600" aria-label="GitHub"><Github className="h-4 w-4" /></a>}
                  {c?.portfolioUrl && <a href={c.portfolioUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-border p-1.5 text-muted hover:text-primary-600" aria-label="Portfolio"><Globe className="h-4 w-4" /></a>}
                  {c && <Link to={`/recruiter/candidates/${c.id}`} className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-text-secondary hover:text-primary-600"><ExternalLink className="h-3.5 w-3.5" />Full profile</Link>}
                </div>
              </div>
            </div>
            {c && c.skills.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">{c.skills.map((s) => <Badge key={s} tone={a.job?.requiredSkills.includes(s) ? 'primary' : 'neutral'} className="capitalize">{s}</Badge>)}</div>
            )}
            {a.job && <p className="mt-2 text-xs text-muted">Highlighted skills match the job's required skills.</p>}
          </Card>

          {a.resume && (
            <Card className="flex items-center gap-3 p-4">
              <FileText className="h-6 w-6 shrink-0 text-primary-600" />
              <div className="min-w-0 flex-1"><p className="truncate font-medium">{a.resume.originalName}</p><p className="text-xs text-muted">{(a.resume.size / 1024).toFixed(0)} KB · submitted with this application</p></div>
              {a.resume.downloadUrl ? <a href={a.resume.downloadUrl} target="_blank" rel="noreferrer"><Button size="sm" leftIcon={<Download className="h-4 w-4" />}>Open resume</Button></a> : <Badge>Storage not configured</Badge>}
            </Card>
          )}

          {a.coverLetter && <Card className="p-5"><h2 className="font-semibold">Cover letter</h2><p className="mt-2 whitespace-pre-line text-sm text-text-secondary">{a.coverLetter}</p></Card>}
          {a.answers.length > 0 && <Card className="p-5"><h2 className="font-semibold">Screening answers</h2><dl className="mt-3 space-y-3">{a.answers.map((q) => <div key={q.questionId}><dt className="text-sm font-medium">{q.question}</dt><dd className="mt-0.5 text-sm text-text-secondary">{q.answer}</dd></div>)}</dl></Card>}

          <Card className="p-5">
            <h2 className="font-semibold">Timeline</h2>
            <ol className="mt-3 space-y-3 border-l border-border pl-4">
              {[...a.statusHistory].reverse().map((h, i) => (
                <li key={i} className="relative text-sm"><span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary-600 ring-4 ring-surface" /><p className="font-medium">{LABELS.applicationStatus[h.status]}</p>{h.note && <p className="text-text-secondary">{h.note}</p>}<p className="text-xs text-muted">{formatDate(h.changedAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p></li>
              ))}
            </ol>
          </Card>
        </div>

        {/* Actions */}
        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            <h2 className="font-semibold">Move to stage</h2>
            {a.allowedTransitions.length === 0 ? <p className="mt-2 text-sm text-muted">This application is in a final state.</p> : (
              <div className="mt-3 grid gap-2">
                {a.allowedTransitions.map((s) => (
                  <Button key={s} variant={s === 'rejected' ? 'outline' : 'primary'} className={cn(s === 'rejected' && 'text-danger hover:bg-danger-bg', s === 'selected' && 'btn-gradient')} onClick={() => (s === 'interview' ? setScheduleOpen(true) : setPending(s))} leftIcon={s === 'interview' ? <CalendarClock className="h-4 w-4" /> : s === 'rejected' ? <XCircle className="h-4 w-4" /> : undefined}>
                    {s === 'interview' ? 'Schedule interview' : LABELS.applicationStatus[s]}
                  </Button>
                ))}
                {a.status === 'interview' && <Button variant="outline" leftIcon={<CalendarClock className="h-4 w-4" />} onClick={() => setScheduleOpen(true)}>Schedule another round</Button>}
              </div>
            )}
            {rounds.data && rounds.data.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-faint">Interview history</p>
                {rounds.data.map((r) => (
                  <div key={r.id} className={cn('rounded-xl border p-3 text-sm', r.isUpcoming ? 'border-warning/40 bg-warning-bg/50' : 'border-border')}>
                    <p className="flex items-center justify-between gap-2 font-medium"><span className="flex items-center gap-1.5"><CalendarClock className="h-4 w-4 text-warning" />{r.title} · R{r.round}</span><Badge tone={r.status === 'completed' ? 'success' : r.status === 'cancelled' || r.status === 'no_show' ? 'danger' : 'info'}>{r.status.replace('_', ' ')}</Badge></p>
                    <p className="mt-1 text-text-secondary">{formatDate(r.scheduledAt, { dateStyle: 'medium', timeStyle: 'short' })} · {r.mode}{r.outcome !== 'pending' ? ` · outcome: ${r.outcome}` : ''}</p>
                    {r.meetingLink && <a href={r.meetingLink} target="_blank" rel="noreferrer" className="mt-1 block truncate text-primary-600 hover:underline">{r.meetingLink}</a>}
                    {r.feedback && <p className="mt-1 text-xs text-muted">Feedback: {r.feedback}</p>}
                  </div>
                ))}
                <Link to="/recruiter/interviews" className="inline-block text-xs text-primary-600 hover:underline">Manage in Interviews</Link>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="font-semibold">Private notes</h2>
            <p className="text-xs text-muted">Only your team sees these.</p>
            <div className="mt-3 flex items-center gap-1" role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => setRating(rating === n ? null : n)} className={cn('rounded p-0.5 transition-transform hover:scale-110', (rating ?? 0) >= n ? 'text-warning' : 'text-faint')}><Star className={cn('h-5 w-5', (rating ?? 0) >= n && 'fill-current')} /></button>)}
            </div>
            <Textarea className="mt-3" rows={5} maxLength={3000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Strong fundamentals; check system design depth…" aria-label="Recruiter notes" />
            <Button className="mt-3 w-full" variant="secondary" loading={saveNotes.isPending} onClick={() => saveNotes.mutate()}>Save notes</Button>
          </Card>
        </aside>
      </div>

      <Dialog open={Boolean(pending)} onClose={() => setPending(null)} title={pending ? `Move to “${LABELS.applicationStatus[pending]}”` : ''} description="The candidate is notified of the new stage." size="md"
        footer={<><Button variant="outline" onClick={() => setPending(null)} disabled={move.isPending}>Cancel</Button><Button variant={pending === 'rejected' ? 'danger' : 'primary'} loading={move.isPending} onClick={() => pending && move.mutate(pending)}>Confirm</Button></>}>
        <div className="space-y-4">
          <Textarea label={pending === 'rejected' ? 'Message to the candidate (optional)' : 'Note (optional, visible to the candidate)'} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </Dialog>
      <InterviewDialog open={scheduleOpen} onClose={() => setScheduleOpen(false)} applicationId={a.id} candidateName={c?.fullName} onDone={() => { void qc.invalidateQueries({ queryKey: ['recruiter', 'application', id] }); void qc.invalidateQueries({ queryKey: ['interviews'] }); }} />
      <TalentEntryDialog open={poolOpen} onClose={() => { setPoolOpen(false); void qc.invalidateQueries({ queryKey: ['talent'] }); }} candidateId={a.candidateId} candidateName={c?.fullName} sourceApplication={a.id} />
    </div>
  );
}
