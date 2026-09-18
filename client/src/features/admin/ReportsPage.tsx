import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, Gavel, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, PageHeader, Textarea } from '@/components/ui';
import { DataTable, FilterPills, Pagination, type Column } from '@/components/ui/DataTable';
import { Dialog } from '@/components/ui/Dialog';
import { toApiError } from '@/lib/api';
import { timeAgo } from '@/lib/utils';
import { adminApi, type AdminReport } from './admin.api';
import { useListParams } from './useListParams';

const STATUS_TONE = { pending: 'warning', reviewed: 'info', action_taken: 'success', dismissed: 'neutral' } as const;
const STATUS_LABEL = { pending: 'Pending', reviewed: 'Reviewed', action_taken: 'Action taken', dismissed: 'Dismissed' } as const;
const REASON_LABEL: Record<string, string> = { spam: 'Spam', scam: 'Scam / fraud', misleading: 'Misleading', discriminatory: 'Discriminatory', other: 'Other' };

export function ReportsPage() {
  const qc = useQueryClient();
  const { get, page, set, setPage } = useListParams({ status: 'pending' });
  const status = get('status');
  const [active, setActive] = useState<AdminReport | null>(null);
  const [note, setNote] = useState('');

  const query = useQuery({ queryKey: ['admin', 'reports', { status, page }], queryFn: () => adminApi.reports({ status, page, limit: 15 }), placeholderData: keepPreviousData });

  const resolve = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'reviewed' | 'action_taken' | 'dismissed' }) => adminApi.resolveReport(id, status, note || undefined),
    onSuccess: () => { toast.success('Report updated'); setActive(null); setNote(''); void qc.invalidateQueries({ queryKey: ['admin'] }); },
    onError: (e) => toast.error(toApiError(e).message),
  });
  const removeJob = useMutation({
    mutationFn: (r: AdminReport) => adminApi.moderateJob(r.targetId, 'remove', note || `Report: ${REASON_LABEL[r.reason] ?? r.reason}`),
    onSuccess: () => { toast.success('Job removed — related reports marked as actioned'); setActive(null); setNote(''); void qc.invalidateQueries({ queryKey: ['admin'] }); },
    onError: (e) => toast.error(toApiError(e).message),
  });

  const columns: Column<AdminReport>[] = [
    { key: 'target', header: 'Reported job', cell: (r) => r.target ? <div className="min-w-0"><p className="truncate font-medium">{r.target.title}</p><p className="truncate text-xs text-muted">{r.target.companyName} · {r.target.status}</p></div> : <span className="text-muted">Job no longer exists</span> },
    { key: 'reason', header: 'Reason', cell: (r) => <div><Badge tone="danger">{REASON_LABEL[r.reason] ?? r.reason}</Badge>{r.details && <p className="mt-1 line-clamp-2 max-w-xs text-xs text-muted">{r.details}</p>}</div> },
    { key: 'reporter', header: 'Reported by', hideBelow: 'md', cell: (r) => <span className="text-xs text-text-secondary">{r.reporter.email ?? r.reporter.id}</span> },
    { key: 'status', header: 'Status', cell: (r) => <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge> },
    { key: 'when', header: 'Filed', hideBelow: 'md', cell: (r) => <span className="text-muted">{timeAgo(r.createdAt)}</span> },
    { key: 'actions', header: <span className="sr-only">Actions</span>, className: 'text-right', cell: (r) => r.status === 'pending' ? <Button size="sm" variant="outline" leftIcon={<Gavel className="h-4 w-4" />} onClick={(e) => { e.stopPropagation(); setActive(r); }}>Review</Button> : <span className="text-xs text-muted">{r.resolutionNote ?? ''}</span> },
  ];

  return (
    <div>
      <PageHeader title="Reports" description="Content flagged by candidates. Review, dismiss, or take action." />
      <div className="mb-4"><FilterPills value={status as keyof typeof STATUS_LABEL | ''} onChange={(v) => set({ status: v })} options={(Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]).map((s) => ({ value: s, label: STATUS_LABEL[s] }))} /></div>
      <DataTable columns={columns} rows={query.data?.data.reports} rowKey={(r) => r.id} loading={query.isPending} error={query.isError ? toApiError(query.error).message : null} onRetry={() => void query.refetch()} empty={{ title: status === 'pending' ? 'Queue is clear' : 'No reports here', description: status === 'pending' ? 'Nothing is waiting for review.' : undefined }} onRowClick={(r) => r.status === 'pending' && setActive(r)} caption="Reports" />
      <Pagination meta={query.data?.meta} onPage={setPage} className="mt-4" />

      <Dialog open={Boolean(active)} onClose={() => { setActive(null); setNote(''); }} title="Review report" description={active?.target ? `${active.target.title} · ${active.target.companyName}` : undefined} size="md"
        footer={active && (
          <>
            <Button variant="outline" leftIcon={<XCircle className="h-4 w-4" />} disabled={resolve.isPending || removeJob.isPending} onClick={() => resolve.mutate({ id: active.id, status: 'dismissed' })}>Dismiss</Button>
            <Button variant="secondary" leftIcon={<CheckCircle2 className="h-4 w-4" />} disabled={resolve.isPending || removeJob.isPending} onClick={() => resolve.mutate({ id: active.id, status: 'reviewed' })}>Mark reviewed</Button>
            {active.target && active.target.status !== 'removed' && <Button variant="danger" leftIcon={<Gavel className="h-4 w-4" />} loading={removeJob.isPending} onClick={() => removeJob.mutate(active)}>Remove job</Button>}
          </>
        )}>
        {active && (
          <div className="space-y-4 text-sm">
            <div className="rounded-xl border border-border bg-surface-2/60 p-3">
              <p className="flex items-center gap-2"><Badge tone="danger">{REASON_LABEL[active.reason] ?? active.reason}</Badge><span className="text-xs text-muted">by {active.reporter.email} · {timeAgo(active.createdAt)}</span></p>
              {active.details && <p className="mt-2 text-text-secondary">{active.details}</p>}
            </div>
            {active.target && <Link to={`/jobs/${active.targetId}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary-600 hover:underline dark:text-primary-400"><ExternalLink className="h-4 w-4" />Open the job posting in a new tab</Link>}
            <Textarea label="Resolution note (audit log)" value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="What did you find?" />
          </div>
        )}
      </Dialog>
    </div>
  );
}
