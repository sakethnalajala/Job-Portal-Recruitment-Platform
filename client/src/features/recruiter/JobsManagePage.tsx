import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, MoreHorizontal, Pause, Pencil, Play, PlusCircle, Trash2, Users, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, PageHeader, JOB_TONE } from '@/components/ui';
import { BackButton } from '@/components/ui/BackButton';
import { DataTable, FilterPills, Pagination, type Column } from '@/components/ui/DataTable';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Dropdown, MenuItem } from '@/components/ui/extras';
import { useListParams } from '@/features/admin/useListParams';
import { toApiError } from '@/lib/api';
import { formatDate, LABELS } from '@/lib/utils';
import type { JobCard, JobStatus } from '@/types/api';
import { recruiterApi } from './recruiter.api';

type Row = JobCard & { viewCount: number };

export function JobsManagePage() {
  const qc = useQueryClient();
  const { get, page, set, setPage } = useListParams();
  const status = get('status') as JobStatus | '';
  const [confirm, setConfirm] = useState<{ job: Row; action: 'delete' | 'close' } | null>(null);

  const query = useQuery({ queryKey: ['recruiter', 'jobs', { status, page }], queryFn: () => recruiterApi.myJobs({ status, page, limit: 12 }), placeholderData: keepPreviousData });
  const invalidate = () => { void qc.invalidateQueries({ queryKey: ['recruiter'] }); void qc.invalidateQueries({ queryKey: ['jobs'] }); void qc.invalidateQueries({ queryKey: ['stats'] }); };

  const setStatus = useMutation({ mutationFn: ({ id, s }: { id: string; s: 'open' | 'paused' | 'closed' }) => recruiterApi.setJobStatus(id, s), onSuccess: (_r, v) => { toast.success({ open: 'Job published', paused: 'Job paused', closed: 'Job closed' }[v.s]); setConfirm(null); invalidate(); }, onError: (e) => toast.error(toApiError(e).message) });
  const remove = useMutation({ mutationFn: (id: string) => recruiterApi.deleteJob(id), onSuccess: () => { toast.success('Job deleted'); setConfirm(null); invalidate(); }, onError: (e) => { toast.error(toApiError(e).message); setConfirm(null); } });

  const columns: Column<Row>[] = [
    { key: 'title', header: 'Job', cell: (j) => <div className="min-w-0"><Link to={`/recruiter/jobs/${j.id}/applicants`} className="truncate font-medium hover:text-primary-600">{j.title}</Link><p className="text-xs text-muted">{LABELS.workType[j.workType]} · {LABELS.employmentType[j.employmentType]} · {j.location?.city ?? 'India'}</p></div> },
    { key: 'status', header: 'Status', cell: (j) => <div className="flex flex-wrap gap-1"><Badge tone={JOB_TONE[j.status] ?? 'neutral'}>{LABELS.jobStatus[j.status]}</Badge>{j.isExpired && j.status === 'open' && <Badge tone="danger">Expired</Badge>}</div> },
    { key: 'applicants', header: 'Applicants', cell: (j) => <Link to={`/recruiter/jobs/${j.id}/applicants`} className="inline-flex items-center gap-1 font-medium hover:text-primary-600"><Users className="h-4 w-4 text-muted" />{j.applicationCount}</Link> },
    { key: 'views', header: 'Views', hideBelow: 'md', cell: (j) => <span className="text-text-secondary">{j.viewCount}</span> },
    { key: 'deadline', header: 'Deadline', hideBelow: 'lg', cell: (j) => <span className="text-text-secondary">{j.deadline ? formatDate(j.deadline) : '—'}</span> },
    { key: 'posted', header: 'Posted', hideBelow: 'md', cell: (j) => <span className="text-muted">{j.publishedAt ? formatDate(j.publishedAt) : 'Draft'}</span> },
    { key: 'actions', header: <span className="sr-only">Actions</span>, className: 'text-right', cell: (j) => (
      <Dropdown trigger={({ toggle }) => <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggle} aria-label={`Actions for ${j.title}`}><MoreHorizontal className="h-4 w-4" /></Button>}>
        {(close) => (
          <>
            <MenuItem icon={<Users className="h-4 w-4" />} to={`/recruiter/jobs/${j.id}/applicants`} onClick={close}>View applicants</MenuItem>
            {j.status !== 'removed' && <MenuItem icon={<Pencil className="h-4 w-4" />} to={`/recruiter/jobs/${j.id}/edit`} onClick={close}>Edit</MenuItem>}
            {(j.status === 'open' || j.status === 'closed') && <MenuItem icon={<Eye className="h-4 w-4" />} to={`/jobs/${j.id}`} onClick={close}>View public page</MenuItem>}
            {(j.status === 'draft' || j.status === 'paused' || j.status === 'closed') && <MenuItem icon={<Play className="h-4 w-4" />} onClick={() => { close(); setStatus.mutate({ id: j.id, s: 'open' }); }}>{j.status === 'draft' ? 'Publish' : 'Reopen'}</MenuItem>}
            {j.status === 'open' && <MenuItem icon={<Pause className="h-4 w-4" />} onClick={() => { close(); setStatus.mutate({ id: j.id, s: 'paused' }); }}>Pause</MenuItem>}
            {(j.status === 'open' || j.status === 'paused') && <MenuItem icon={<XCircle className="h-4 w-4" />} onClick={() => { close(); setConfirm({ job: j, action: 'close' }); }}>Close hiring</MenuItem>}
            {(j.status === 'draft' || j.applicationCount === 0) && j.status !== 'removed' && <MenuItem icon={<Trash2 className="h-4 w-4" />} tone="danger" onClick={() => { close(); setConfirm({ job: j, action: 'delete' }); }}>Delete</MenuItem>}
          </>
        )}
      </Dropdown>
    ) },
  ];

  const statuses: JobStatus[] = ['open', 'draft', 'paused', 'closed', 'removed'];
  return (
    <div>
      <BackButton fallback="/recruiter" className="mb-2" />
      <PageHeader title="Job postings" description="Publish, pause, close and review applicants." actions={<Link to="/recruiter/jobs/new"><Button leftIcon={<PlusCircle className="h-4 w-4" />}>Post a job</Button></Link>} />
      <div className="mb-4"><FilterPills value={status} onChange={(v) => set({ status: v })} options={statuses.map((s) => ({ value: s, label: LABELS.jobStatus[s] }))} /></div>
      <DataTable columns={columns} rows={query.data?.data.jobs} rowKey={(j) => j.id} loading={query.isPending} error={query.isError ? toApiError(query.error).message : null} onRetry={() => void query.refetch()} empty={{ title: status ? `No ${LABELS.jobStatus[status].toLowerCase()} jobs` : 'No job postings yet', description: 'Publish your first role to start receiving applications.', action: <Link to="/recruiter/jobs/new"><Button>Post a job</Button></Link> }} caption="Your job postings" />
      <Pagination meta={query.data?.meta} onPage={setPage} className="mt-4" />
      <ConfirmDialog open={Boolean(confirm)} onClose={() => setConfirm(null)} loading={setStatus.isPending || remove.isPending} tone="danger"
        onConfirm={() => confirm && (confirm.action === 'delete' ? remove.mutate(confirm.job.id) : setStatus.mutate({ id: confirm.job.id, s: 'closed' }))}
        title={confirm?.action === 'delete' ? 'Delete this job?' : 'Close hiring for this job?'}
        description={confirm?.action === 'delete' ? 'This permanently removes the draft. Jobs with applications cannot be deleted — close them instead.' : 'Candidates with active applications are notified. You can reopen later if the deadline is in the future.'}
        confirmLabel={confirm?.action === 'delete' ? 'Delete' : 'Close job'} />
    </div>
  );
}
