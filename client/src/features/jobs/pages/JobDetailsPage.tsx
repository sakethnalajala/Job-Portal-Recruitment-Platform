import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BriefcaseBusiness, Building2, CalendarClock, CheckCircle2, Clock, Globe, GraduationCap, IndianRupee, MapPin, ShieldCheck, Users } from 'lucide-react';
import { Badge, Button, Card, ErrorState, Skeleton, APPLICATION_TONE } from '@/components/ui';
import { BackButton } from '@/components/ui/BackButton';
import { useAuth } from '@/features/auth/AuthProvider';
import { toApiError } from '@/lib/api';
import { formatDate, formatSalary, LABELS, timeAgo } from '@/lib/utils';
import { SaveButton } from '../JobCard';
import { jobKeys, jobsApi } from '../jobs.api';

export function JobDetailsPage({ embedded = false }: { embedded?: boolean }) {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const query = useQuery({ queryKey: jobKeys.detail(id), queryFn: () => jobsApi.detail(id), enabled: Boolean(id) });

  if (query.isPending) {
    return (
      <div className={embedded ? 'space-y-4' : 'mx-auto max-w-5xl space-y-4 px-4 py-8 sm:px-6'}>
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (query.isError) {
    const err = toApiError(query.error);
    return (
      <div className={embedded ? '' : 'mx-auto max-w-5xl px-4 py-8 sm:px-6'}>
        <ErrorState title={err.status === 404 ? 'Job not found' : undefined} message={err.status === 404 ? 'This posting may have been closed or removed.' : err.message} onRetry={err.status === 404 ? undefined : () => void query.refetch()} />
      </div>
    );
  }

  const { job, company } = query.data.data;
  const canApply = job.status === 'open' && !job.isExpired;
  const applyTarget = !user ? '/login' : user.role === 'candidate' ? `/candidate/apply/${job.id}` : null;

  return (
    <div className={embedded ? '' : 'mx-auto max-w-5xl px-4 py-8 sm:px-6'}>
      <BackButton fallback={embedded ? '/candidate/jobs' : '/jobs'} className="mb-4" />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-start gap-4">
              {job.companyLogoUrl ? (
                <img src={job.companyLogoUrl} alt="" className="h-14 w-14 rounded-xl object-cover bg-surface-2" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-950/60 dark:text-primary-300"><Building2 className="h-6 w-6" /></div>
              )}
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-bold leading-tight">{job.title}</h1>
                <p className="mt-1 flex items-center gap-1.5 text-muted">
                  <Link to={`/companies/${job.recruiterProfileId}`} className="font-medium text-text hover:underline">{job.companyName}</Link>
                  {job.companyVerified && <ShieldCheck className="h-4 w-4 text-primary-600 dark:text-primary-400" aria-label="Verified company" />}
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-1 text-sm"><Clock className="h-3.5 w-3.5" />Posted {timeAgo(job.publishedAt ?? job.createdAt)}</span>
                </p>
              </div>
              <SaveButton job={job} />
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Badge tone={job.workType === 'remote' ? 'success' : 'neutral'}>{LABELS.workType[job.workType]}</Badge>
              <Badge>{LABELS.employmentType[job.employmentType]}</Badge>
              <Badge>{LABELS.experienceLevel[job.experienceLevel]}</Badge>
              {job.status !== 'open' && <Badge tone="danger">{LABELS.jobStatus[job.status]}</Badge>}
              {job.isExpired && <Badge tone="danger">Deadline passed</Badge>}
              {job.hasApplied && job.applicationStatus && <Badge tone={APPLICATION_TONE[job.applicationStatus] ?? 'info'}>You: {LABELS.applicationStatus[job.applicationStatus]}</Badge>}
            </div>

            <dl className="mt-6 grid gap-4 border-t border-border pt-5 text-sm sm:grid-cols-2">
              <Fact icon={<MapPin className="h-4 w-4" />} label="Location" value={[job.location?.city, job.location?.country].filter(Boolean).join(', ') || 'India'} />
              <Fact icon={<IndianRupee className="h-4 w-4" />} label="Salary" value={formatSalary(job.salary)} />
              <Fact icon={<BriefcaseBusiness className="h-4 w-4" />} label="Experience" value={job.experienceYears?.min !== undefined ? `${job.experienceYears.min}–${job.experienceYears.max ?? '+'} years` : LABELS.experienceLevel[job.experienceLevel]} />
              <Fact icon={<Users className="h-4 w-4" />} label="Openings" value={`${job.openings} · ${job.applicationCount} applied`} />
              {job.deadline && <Fact icon={<CalendarClock className="h-4 w-4" />} label="Apply by" value={formatDate(job.deadline)} />}
              {job.educationRequirement && <Fact icon={<GraduationCap className="h-4 w-4" />} label="Education" value={job.educationRequirement} />}
            </dl>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-semibold">About the role</h2>
            <div className="prose-sm mt-3 whitespace-pre-line text-text-secondary">{job.description}</div>
            {job.responsibilities.length > 0 && (
              <>
                <h3 className="mt-6 font-semibold">Responsibilities</h3>
                <ul className="mt-2 space-y-1.5 text-sm text-text-secondary">
                  {job.responsibilities.map((r) => <li key={r} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />{r}</li>)}
                </ul>
              </>
            )}
            <h3 className="mt-6 font-semibold">Required skills</h3>
            <div className="mt-2 flex flex-wrap gap-1.5">{job.requiredSkills.map((s) => <Badge key={s} tone="primary" className="capitalize">{s}</Badge>)}</div>
            {job.preferredSkills.length > 0 && (
              <>
                <h3 className="mt-5 font-semibold">Nice to have</h3>
                <div className="mt-2 flex flex-wrap gap-1.5">{job.preferredSkills.map((s) => <Badge key={s} className="capitalize">{s}</Badge>)}</div>
              </>
            )}
            {job.benefits.length > 0 && (
              <>
                <h3 className="mt-6 font-semibold">Benefits</h3>
                <ul className="mt-2 flex flex-wrap gap-1.5">{job.benefits.map((b) => <Badge key={b} tone="success">{b}</Badge>)}</ul>
              </>
            )}
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            {job.hasApplied ? (
              <Button className="w-full" variant="secondary" disabled>Already applied</Button>
            ) : canApply ? (
              applyTarget ? (
                <Link to={applyTarget} state={{ from: { pathname: `/jobs/${job.id}` } }}><Button className="w-full" size="lg">Apply now</Button></Link>
              ) : (
                <p className="text-center text-sm text-muted">Log in as a candidate to apply.</p>
              )
            ) : (
              <Button className="w-full" variant="secondary" disabled>{job.isExpired ? 'Deadline passed' : 'Not accepting applications'}</Button>
            )}
            {!user && <p className="mt-3 text-center text-xs text-muted">You'll need a candidate account. <Link to="/register/candidate" className="text-primary-600 hover:underline">Sign up free</Link></p>}
            {job.customQuestions.length > 0 && <p className="mt-3 text-center text-xs text-muted">This application includes {job.customQuestions.length} screening question{job.customQuestions.length > 1 ? 's' : ''}.</p>}
          </Card>

          {company && (
            <Card className="p-5">
              <h2 className="font-semibold">About {company.companyName}</h2>
              {company.companyDescription && <p className="mt-2 line-clamp-5 text-sm text-muted">{company.companyDescription}</p>}
              <dl className="mt-4 space-y-2 text-sm">
                {company.industry && <div className="flex justify-between gap-3"><dt className="text-muted">Industry</dt><dd className="text-right">{company.industry}</dd></div>}
                {company.companySize && <div className="flex justify-between gap-3"><dt className="text-muted">Size</dt><dd>{company.companySize} people</dd></div>}
                {company.location?.city && <div className="flex justify-between gap-3"><dt className="text-muted">HQ</dt><dd>{company.location.city}</dd></div>}
              </dl>
              {company.website && (
                <a href={company.website} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:underline dark:text-primary-400">
                  <Globe className="h-4 w-4" /> Visit website
                </a>
              )}
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-muted">{icon}</span>
      <div>
        <dt className="text-xs text-muted">{label}</dt>
        <dd className="font-medium">{value}</dd>
      </div>
    </div>
  );
}
