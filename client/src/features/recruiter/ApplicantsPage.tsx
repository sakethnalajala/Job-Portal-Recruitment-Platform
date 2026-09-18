import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Search, Star, Users } from 'lucide-react';
import { Avatar, Badge, Button, Input, PageHeader, Select, Skeleton, APPLICATION_TONE } from '@/components/ui';
import { BackButton } from '@/components/ui/BackButton';
import { DataTable, FilterPills, Pagination, type Column } from '@/components/ui/DataTable';
import { useListParams } from '@/features/admin/useListParams';
import { toApiError } from '@/lib/api';
import { formatDate, LABELS, timeAgo } from '@/lib/utils';
import type { ApplicationStatus } from '@/types/api';
import { recruiterApi, type ApplicantRow } from './recruiter.api';

const STATUSES: ApplicationStatus[] = ['applied', 'under_review', 'shortlisted', 'interview', 'selected', 'rejected', 'withdrawn'];

/** Used for both /recruiter/applicants (all jobs) and /recruiter/jobs/:id/applicants (one job). */
export function ApplicantsPage() {
  const { id: jobId } = useParams();
  const { get, page, set, setPage } = useListParams();
  const status = get('status') as ApplicationStatus | '';
  const q = get('q');
  const sort = get('sort') || 'newest';
  const jobFilter = jobId ?? get('job');
  const [search, setSearch] = useState(q);
  useEffect(() => setSearch(q), [q]);

  const jobs = useQuery({ queryKey: ['recruiter', 'jobs', 'all'], queryFn: () => recruiterApi.myJobs({ limit: 50 }), select: (r) => r.data.jobs });
  const query = useQuery({ queryKey: ['recruiter', 'applicants', { jobFilter, status, q, sort, page }], queryFn: () => recruiterApi.applicants({ job: jobFilter, status, q, sort, page, limit: 15 }), placeholderData: keepPreviousData });
  const job = jobs.data?.find((j) => j.id === jobFilter);
  const counts = query.data?.data.statusCounts ?? {};
  const total = Object.values(counts).reduce((s, v) => s + v, 0);

  const columns: Column<ApplicantRow>[] = [
    { key: 'candidate', header: 'Candidate', cell: (a) => (
      <div className="flex items-center gap-3">
        <Avatar src={a.candidate?.photoUrl} name={a.candidate?.fullName} size="sm" />
        <div className="min-w-0">
          <Link to={`/recruiter/applications/${a.id}`} className="block truncate font-medium hover:text-primary-600">{a.candidate?.fullName ?? 'Candidate'}</Link>
          <p className="truncate text-xs text-muted">{a.candidate?.headline ?? a.candidate?.email}</p>
        </div>
      </div>
    ) },
    ...(!jobId ? [{ key: 'job', header: 'Job', hideBelow: 'md' as const, cell: (a: ApplicantRow) => <span className="text-text-secondary">{a.job?.title ?? '—'}</span> }] : []),
    { key: 'skills', header: 'Skills', hideBelow: 'lg', cell: (a) => <div className="flex max-w-xs flex-wrap gap-1">{a.candidate?.skills.slice(0, 4).map((s) => <Badge key={s} className="capitalize">{s}</Badge>)}{(a.candidate?.skills.length ?? 0) > 4 && <Badge>+{a.candidate!.skills.length - 4}</Badge>}</div> },
    { key: 'exp', header: 'Exp', hideBelow: 'md', cell: (a) => <span className="text-text-secondary">{a.candidate?.totalExperienceYears ?? 0} yrs</span> },
    { key: 'status', header: 'Stage', cell: (a) => <div><Badge tone={APPLICATION_TONE[a.status] ?? 'neutral'}>{LABELS.applicationStatus[a.status]}</Badge>{a.status === 'interview' && a.interview?.scheduledAt && <p className="mt-1 text-xs text-warning">{formatDate(a.interview.scheduledAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>}</div> },
    { key: 'rating', header: 'Rating', hideBelow: 'md', cell: (a) => a.rating ? <span className="inline-flex items-center gap-0.5 text-warning">{Array.from({ length: a.rating }).map((_, i) => <Star key={i} className="h-3.5 w-3.5 fill-current" />)}</span> : <span className="text-xs text-muted">—</span> },
    { key: 'applied', header: 'Applied', cell: (a) => <span className="whitespace-nowrap text-muted">{timeAgo(a.appliedAt)}</span> },
    { key: 'actions', header: <span className="sr-only">Actions</span>, className: 'text-right', cell: (a) => <Link to={`/recruiter/applications/${a.id}`} onClick={(e) => e.stopPropagation()}><Button size="sm" variant="outline">Review</Button></Link> },
  ];

  const submit = (e: FormEvent) => { e.preventDefault(); set({ q: search.trim() }); };

  return (
    <div>
      <BackButton fallback={jobId ? '/recruiter/jobs' : '/recruiter'} className="mb-2" />
      <PageHeader title={jobId ? (job?.title ?? 'Applicants') : 'Applicants'} description={jobId ? `${total} application${total === 1 ? '' : 's'} for this posting` : 'Everyone who applied across your postings.'} actions={jobId ? <Link to={`/recruiter/jobs/${jobId}/edit`}><Button variant="outline">Edit job</Button></Link> : undefined} />

      {jobs.isPending ? <Skeleton className="mb-4 h-10 w-full" /> : (
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <FilterPills value={status} onChange={(v) => set({ status: v })} options={STATUSES.map((s) => ({ value: s, label: LABELS.applicationStatus[s] }))} counts={{ all: total, ...counts } as Record<string, number>} />
          <form onSubmit={submit} className="flex gap-2">
            {!jobId && <div className="w-48"><Select value={jobFilter} onChange={(e) => set({ job: e.target.value })} className="h-10" aria-label="Filter by job"><option value="">All jobs</option>{jobs.data?.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}</Select></div>}
            <Input placeholder="Name, headline or skill" leftIcon={<Search className="h-4 w-4" />} value={search} onChange={(e) => setSearch(e.target.value)} className="h-10 w-full lg:w-56" aria-label="Search applicants" />
            <div className="w-32"><Select value={sort} onChange={(e) => set({ sort: e.target.value }, false)} className="h-10" aria-label="Sort"><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="rating">Top rated</option></Select></div>
            <Button type="submit" className="h-10">Search</Button>
          </form>
        </div>
      )}

      <DataTable columns={columns} rows={query.data?.data.applicants} rowKey={(a) => a.id} loading={query.isPending} error={query.isError ? toApiError(query.error).message : null} onRetry={() => void query.refetch()} empty={{ title: 'No applicants yet', description: jobId ? 'Share the job link to attract candidates.' : 'Applications to your open jobs will appear here.' }} caption="Applicants" />
      <Pagination meta={query.data?.meta} onPage={setPage} className="mt-4" />
      {!jobId && !jobs.isPending && jobs.data?.length === 0 && <p className="mt-6 flex items-center gap-2 text-sm text-muted"><Users className="h-4 w-4" />You haven't posted any jobs yet. <Link to="/recruiter/jobs/new" className="text-primary-600 hover:underline">Post one</Link>.</p>}
    </div>
  );
}
