import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Flag, RotateCcw, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, Input, PageHeader, Textarea, JOB_TONE } from '@/components/ui';
import { DataTable, FilterPills, Pagination, type Column } from '@/components/ui/DataTable';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { toApiError } from '@/lib/api';
import { formatDate, LABELS } from '@/lib/utils';
import type { JobStatus } from '@/types/api';
import { adminApi, type AdminJob } from './admin.api';
import { useListParams } from './useListParams';

export function AdminJobsPage() {
  const qc = useQueryClient();
  const { get, page, set, setPage } = useListParams();
  const status = get('status');
  const q = get('q');
  const reported = get('reported') === 'true';
  const [search, setSearch] = useState(q);
  const [target, setTarget] = useState<{ job: AdminJob; action: 'remove' | 'restore' } | null>(null);
  const [reason, setReason] = useState('');
  useEffect(() => setSearch(q), [q]);

  const query = useQuery({ queryKey: ['admin', 'jobs', { status, q, reported, page }], queryFn: () => adminApi.jobs({ status, q, reported: reported || undefined, page, limit: 15 }), placeholderData: keepPreviousData });

  const moderate = useMutation({
    mutationFn: ({ job, action }: { job: AdminJob; action: 'remove' | 'restore' }) => adminApi.moderateJob(job.id, action, reason || undefined),
    onSuccess: (_r, v) => { toast.success(v.action === 'remove' ? 'Job removed and pending reports resolved' : 'Job restored (now closed — the recruiter can reopen it)'); setTarget(null); setReason(''); void qc.invalidateQueries({ queryKey: ['admin'] }); void qc.invalidateQueries({ queryKey: ['jobs'] }); },
    onError: (e) => toast.error(toApiError(e).message),
  });

  const columns: Column<AdminJob>[] = [
    { key: 'job', header: 'Job', cell: (j) => (
      <div className="min-w-0">
        <p className="truncate font-medium">{j.title}</p>
        <p className="flex items-center gap-1 truncate text-xs text-muted">{j.companyName}{j.companyVerified && <ShieldCheck className="h-3 w-3 text-primary-600" aria-label="Verified" />}</p>
      </div>
    ) },
    { key: 'status', header: 'Status', cell: (j) => <div className="flex flex-wrap gap-1"><Badge tone={JOB_TONE[j.status] ?? 'neutral'}>{LABELS.jobStatus[j.status]}</Badge>{j.isExpired && j.status === 'open' && <Badge tone="danger">Expired</Badge>}</div> },
    { key: 'reports', header: 'Reports', cell: (j) => j.pendingReports ? <Badge tone="warning"><Flag className="h-3 w-3" />{j.pendingReports} pending</Badge> : <span className="text-xs text-muted">—</span> },
    { key: 'apps', header: 'Applicants', hideBelow: 'md', cell: (j) => <span className="font-medium">{j.applicationCount}</span> },
    { key: 'views', header: 'Views', hideBelow: 'lg', cell: (j) => <span className="text-text-secondary">{j.viewCount}</span> },
    { key: 'posted', header: 'Posted', hideBelow: 'md', cell: (j) => <span className="text-text-secondary">{formatDate(j.publishedAt ?? j.createdAt)}</span> },
    { key: 'actions', header: <span className="sr-only">Actions</span>, className: 'text-right', cell: (j) => (
      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
        {j.status !== 'removed' && j.status !== 'draft' && <Link to={`/jobs/${j.id}`} target="_blank" rel="noreferrer"><Button variant="ghost" size="sm" leftIcon={<Eye className="h-4 w-4" />}>View</Button></Link>}
        {j.status === 'removed'
          ? <Button variant="outline" size="sm" leftIcon={<RotateCcw className="h-4 w-4" />} onClick={() => setTarget({ job: j, action: 'restore' })}>Restore</Button>
          : <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-bg" leftIcon={<Trash2 className="h-4 w-4" />} onClick={() => setTarget({ job: j, action: 'remove' })}>Remove</Button>}
      </div>
    ) },
  ];

  const submit = (e: FormEvent) => { e.preventDefault(); set({ q: search.trim() }); };
  const statuses: JobStatus[] = ['open', 'paused', 'closed', 'draft', 'removed'];

  return (
    <div>
      <PageHeader title="Job moderation" description="Every posting on the platform, with pending report counts." />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterPills value={status as JobStatus | ''} onChange={(v) => set({ status: v })} options={statuses.map((s) => ({ value: s, label: LABELS.jobStatus[s] }))} />
        <form onSubmit={submit} className="flex gap-2">
          <Button type="button" variant={reported ? 'primary' : 'outline'} className="h-10" leftIcon={<Flag className="h-4 w-4" />} onClick={() => set({ reported: reported ? '' : 'true' })} aria-pressed={reported}>Reported only</Button>
          <Input placeholder="Title or company" leftIcon={<Search className="h-4 w-4" />} value={search} onChange={(e) => setSearch(e.target.value)} className="h-10 w-full lg:w-56" aria-label="Search jobs" />
          <Button type="submit" className="h-10">Search</Button>
        </form>
      </div>

      <DataTable columns={columns} rows={query.data?.data.jobs} rowKey={(j) => j.id} loading={query.isPending} error={query.isError ? toApiError(query.error).message : null} onRetry={() => void query.refetch()} empty={{ title: reported ? 'No reported jobs' : 'No jobs match these filters' }} caption="Job postings" />
      <Pagination meta={query.data?.meta} onPage={setPage} className="mt-4" />

      <ConfirmDialog
        open={Boolean(target)}
        onClose={() => { setTarget(null); setReason(''); }}
        onConfirm={() => target && moderate.mutate(target)}
        loading={moderate.isPending}
        tone={target?.action === 'remove' ? 'danger' : 'primary'}
        title={target?.action === 'remove' ? 'Remove this job posting?' : 'Restore this job posting?'}
        description={target?.action === 'remove' ? 'The job disappears from search, the recruiter is locked out of editing it, and all pending reports are marked as actioned.' : 'The job is restored as “closed”; the recruiter can reopen it.'}
        confirmLabel={target?.action === 'remove' ? 'Remove job' : 'Restore'}
      >
        {target && <p className="mb-3 text-sm"><span className="font-medium">{target.job.title}</span> <span className="text-muted">· {target.job.companyName}</span></p>}
        <Textarea label="Reason (sent to the recruiter, recorded in audit log)" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="e.g. Confirmed scam — asks for a registration fee" />
      </ConfirmDialog>
    </div>
  );
}
