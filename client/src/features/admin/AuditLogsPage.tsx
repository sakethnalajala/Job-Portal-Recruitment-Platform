import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Ban, CheckCircle2, Gavel, RotateCcw, ShieldCheck, ShieldOff, Trash2, ScrollText } from 'lucide-react';
import { Badge, PageHeader, Select } from '@/components/ui';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { toApiError } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { adminApi, type AuditEntry } from './admin.api';
import { useListParams } from './useListParams';

const ACTIONS: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral'; icon: React.ReactNode }> = {
  'user.suspend': { label: 'User suspended', tone: 'warning', icon: <Ban className="h-3.5 w-3.5" /> },
  'user.activate': { label: 'User reactivated', tone: 'success', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  'user.delete': { label: 'Account deleted', tone: 'danger', icon: <Trash2 className="h-3.5 w-3.5" /> },
  'recruiter.verify': { label: 'Company verified', tone: 'success', icon: <ShieldCheck className="h-3.5 w-3.5" /> },
  'recruiter.unverify': { label: 'Verification removed', tone: 'neutral', icon: <ShieldOff className="h-3.5 w-3.5" /> },
  'job.remove': { label: 'Job removed', tone: 'danger', icon: <Gavel className="h-3.5 w-3.5" /> },
  'job.restore': { label: 'Job restored', tone: 'info', icon: <RotateCcw className="h-3.5 w-3.5" /> },
  'report.resolve': { label: 'Report resolved', tone: 'info', icon: <ScrollText className="h-3.5 w-3.5" /> },
};

export function AuditLogsPage() {
  const { get, page, set, setPage } = useListParams();
  const action = get('action');
  const query = useQuery({ queryKey: ['admin', 'audit', { action, page }], queryFn: () => adminApi.auditLogs({ action, page, limit: 20 }), placeholderData: keepPreviousData });

  const columns: Column<AuditEntry>[] = [
    { key: 'when', header: 'When', cell: (a) => <span className="whitespace-nowrap text-text-secondary">{formatDate(a.createdAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span> },
    { key: 'action', header: 'Action', cell: (a) => { const m = ACTIONS[a.action]; return <Badge tone={m?.tone ?? 'neutral'}>{m?.icon}{m?.label ?? a.action}</Badge>; } },
    { key: 'target', header: 'Target', hideBelow: 'md', cell: (a) => <span className="font-mono text-xs text-muted">{a.targetType} · {a.targetId.slice(-8)}</span> },
    { key: 'reason', header: 'Reason / details', cell: (a) => <span className="text-text-secondary">{a.reason ?? (a.metadata ? JSON.stringify(a.metadata) : '—')}</span> },
    { key: 'actor', header: 'Admin', hideBelow: 'lg', cell: (a) => <span className="font-mono text-xs text-muted">{a.actor.slice(-8)}</span> },
    { key: 'ip', header: 'IP', hideBelow: 'lg', cell: (a) => <span className="font-mono text-xs text-muted">{a.ip ?? '—'}</span> },
  ];

  return (
    <div>
      <PageHeader title="Audit log" description="Immutable record of every privileged action." actions={
        <div className="w-56"><Select value={action} onChange={(e) => set({ action: e.target.value })} aria-label="Filter by action" className="h-10"><option value="">All actions</option>{Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></div>
      } />
      <DataTable columns={columns} rows={query.data?.data.logs} rowKey={(a) => a.id} loading={query.isPending} error={query.isError ? toApiError(query.error).message : null} onRetry={() => void query.refetch()} empty={{ title: 'No audit entries yet', description: 'Moderation actions will appear here.' }} caption="Audit log" />
      <Pagination meta={query.data?.meta} onPage={setPage} className="mt-4" />
    </div>
  );
}
