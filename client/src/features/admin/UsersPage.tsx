import { useEffect, useState, type FormEvent } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, CheckCircle2, MoreHorizontal, Search, ShieldCheck, ShieldOff, Trash2, UserRoundCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, Badge, Button, Input, PageHeader, Select, Textarea } from '@/components/ui';
import { DataTable, FilterPills, Pagination, type Column } from '@/components/ui/DataTable';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { Dropdown, MenuItem } from '@/components/ui/extras';
import { toApiError } from '@/lib/api';
import { formatDate, timeAgo } from '@/lib/utils';
import { adminApi, type AdminUser } from './admin.api';
import { useListParams } from './useListParams';

const ROLE_TONE = { candidate: 'primary', recruiter: 'violet', admin: 'neutral' } as const;
const STATUS_TONE = { active: 'success', suspended: 'warning', deleted: 'danger' } as const;

type Action = { type: 'suspend' | 'activate' | 'delete' | 'verify' | 'unverify'; user: AdminUser } | null;

export function UsersPage() {
  const qc = useQueryClient();
  const { get, page, set, setPage } = useListParams();
  const role = get('role');
  const status = get('status');
  const q = get('q');
  const [search, setSearch] = useState(q);
  const [action, setAction] = useState<Action>(null);
  const [reason, setReason] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  useEffect(() => setSearch(q), [q]);

  const query = useQuery({ queryKey: ['admin', 'users', { role, status, q, page }], queryFn: () => adminApi.users({ role, status, q, page, limit: 15 }), placeholderData: keepPreviousData });
  const invalidate = () => { void qc.invalidateQueries({ queryKey: ['admin'] }); };

  const mutation = useMutation({
    mutationFn: async (a: NonNullable<Action>) => {
      if (a.type === 'suspend') return adminApi.setUserStatus(a.user.id, 'suspended', reason || undefined);
      if (a.type === 'activate') return adminApi.setUserStatus(a.user.id, 'active', reason || undefined);
      if (a.type === 'delete') return adminApi.deleteUser(a.user.id, reason || undefined);
      const pid = a.user.profile?.recruiterProfileId;
      if (!pid) throw new Error('Recruiter profile not found');
      return adminApi.verifyRecruiter(pid, a.type === 'verify', reason || undefined);
    },
    onSuccess: (_r, a) => {
      toast.success({ suspend: 'User suspended', activate: 'User reactivated', delete: 'Account deleted', verify: 'Company verified', unverify: 'Verification removed' }[a.type]);
      setAction(null); setReason(''); invalidate();
    },
    onError: (e) => toast.error(toApiError(e).message),
  });

  const columns: Column<AdminUser>[] = [
    { key: 'user', header: 'User', cell: (u) => (
      <div className="flex items-center gap-3">
        <Avatar src={u.profile?.photoUrl} name={u.profile?.fullName ?? u.email} size="sm" />
        <div className="min-w-0">
          <p className="truncate font-medium">{u.profile?.fullName ?? '—'}</p>
          <p className="truncate text-xs text-muted">{u.email}</p>
        </div>
      </div>
    ) },
    { key: 'role', header: 'Role', cell: (u) => (
      <div className="flex flex-wrap items-center gap-1">
        <Badge tone={ROLE_TONE[u.role]} className="capitalize">{u.role}</Badge>
        {u.role === 'recruiter' && (u.profile?.isVerified ? <Badge tone="success"><ShieldCheck className="h-3 w-3" />Verified</Badge> : <Badge>Unverified</Badge>)}
      </div>
    ) },
    { key: 'company', header: 'Company / progress', hideBelow: 'lg', cell: (u) => u.role === 'recruiter' ? <span className="text-text-secondary">{u.profile?.companyName}</span> : u.role === 'candidate' ? <span className="text-text-secondary">Profile {u.profile?.completion ?? 0}%</span> : <span className="text-muted">—</span> },
    { key: 'status', header: 'Status', cell: (u) => <Badge tone={STATUS_TONE[u.status]} className="capitalize">{u.status}</Badge> },
    { key: 'verified', header: 'Email', hideBelow: 'md', cell: (u) => u.isEmailVerified ? <span className="inline-flex items-center gap-1 text-xs text-success"><CheckCircle2 className="h-3.5 w-3.5" />Verified</span> : <span className="text-xs text-muted">Unverified</span> },
    { key: 'joined', header: 'Joined', hideBelow: 'md', cell: (u) => <span className="text-text-secondary">{formatDate(u.createdAt)}</span> },
    { key: 'login', header: 'Last login', hideBelow: 'lg', cell: (u) => <span className="text-muted">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : 'never'}</span> },
    { key: 'actions', header: <span className="sr-only">Actions</span>, className: 'text-right', cell: (u) => u.role === 'admin' || u.status === 'deleted' ? null : (
      <Dropdown trigger={({ toggle }) => <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); toggle(); }} aria-label={`Actions for ${u.email}`}><MoreHorizontal className="h-4 w-4" /></Button>}>
        {(close) => (
          <div onClick={(e) => e.stopPropagation()}>
            <MenuItem icon={<UserRoundCheck className="h-4 w-4" />} onClick={() => { close(); setDetailId(u.id); }}>View details</MenuItem>
            {u.role === 'recruiter' && (u.profile?.isVerified
              ? <MenuItem icon={<ShieldOff className="h-4 w-4" />} onClick={() => { close(); setAction({ type: 'unverify', user: u }); }}>Remove verification</MenuItem>
              : <MenuItem icon={<ShieldCheck className="h-4 w-4" />} onClick={() => { close(); setAction({ type: 'verify', user: u }); }}>Verify company</MenuItem>)}
            {u.status === 'active'
              ? <MenuItem icon={<Ban className="h-4 w-4" />} onClick={() => { close(); setAction({ type: 'suspend', user: u }); }}>Suspend</MenuItem>
              : <MenuItem icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => { close(); setAction({ type: 'activate', user: u }); }}>Reactivate</MenuItem>}
            <MenuItem icon={<Trash2 className="h-4 w-4" />} tone="danger" onClick={() => { close(); setAction({ type: 'delete', user: u }); }}>Delete account</MenuItem>
          </div>
        )}
      </Dropdown>
    ) },
  ];

  const submitSearch = (e: FormEvent) => { e.preventDefault(); set({ q: search.trim() }); };

  return (
    <div>
      <PageHeader title="Users" description="Manage candidates, recruiters and their access." />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterPills value={role} onChange={(v) => set({ role: v })} options={[{ value: 'candidate', label: 'Candidates' }, { value: 'recruiter', label: 'Recruiters' }, { value: 'admin', label: 'Admins' }]} />
        <form onSubmit={submitSearch} className="flex gap-2">
          <Input placeholder="Search name, email, company" leftIcon={<Search className="h-4 w-4" />} value={search} onChange={(e) => setSearch(e.target.value)} className="h-10 w-full lg:w-64" aria-label="Search users" />
          <div className="w-36"><Select value={status} onChange={(e) => set({ status: e.target.value })} className="h-10" aria-label="Status filter"><option value="">Any status</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="deleted">Deleted</option></Select></div>
          <Button type="submit" className="h-10">Search</Button>
        </form>
      </div>

      <DataTable columns={columns} rows={query.data?.data.users} rowKey={(u) => u.id} loading={query.isPending} error={query.isError ? toApiError(query.error).message : null} onRetry={() => void query.refetch()} empty={{ title: 'No users match these filters' }} onRowClick={(u) => setDetailId(u.id)} caption="Platform users" />
      <Pagination meta={query.data?.meta} onPage={setPage} className="mt-4" />

      <ConfirmDialog
        open={Boolean(action)}
        onClose={() => { setAction(null); setReason(''); }}
        onConfirm={() => action && mutation.mutate(action)}
        loading={mutation.isPending}
        tone={action?.type === 'delete' || action?.type === 'suspend' ? 'danger' : 'primary'}
        title={action ? { suspend: 'Suspend this user?', activate: 'Reactivate this user?', delete: 'Delete this account?', verify: 'Verify this company?', unverify: 'Remove verification?' }[action.type] : ''}
        description={action?.type === 'delete' ? 'Soft delete: the account can no longer log in, active applications are withdrawn and open jobs are closed. Data is kept for audit.' : action?.type === 'suspend' ? 'All sessions are revoked immediately and the user is emailed.' : undefined}
        confirmLabel={action ? { suspend: 'Suspend', activate: 'Reactivate', delete: 'Delete account', verify: 'Verify', unverify: 'Remove' }[action.type] : 'Confirm'}
      >
        {action && <p className="mb-3 text-sm"><span className="font-medium">{action.user.profile?.fullName ?? action.user.email}</span> <span className="text-muted">({action.user.email})</span></p>}
        <Textarea label="Reason (recorded in the audit log)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional" rows={3} />
      </ConfirmDialog>

      <UserDetailDialog id={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}

function UserDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const query = useQuery({ queryKey: ['admin', 'user', id], queryFn: () => adminApi.user(id!), enabled: Boolean(id), select: (r) => r.data });
  const u = query.data?.user;
  return (
    <Dialog open={Boolean(id)} onClose={onClose} title={u?.profile?.fullName ?? 'User details'} description={u?.email} size="md">
      {query.isPending ? <div className="h-32 animate-pulse rounded-xl bg-surface-3" /> : query.isError ? <p className="text-sm text-danger">{toApiError(query.error).message}</p> : u && (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Badge tone={ROLE_TONE[u.role]} className="capitalize">{u.role}</Badge>
            <Badge tone={STATUS_TONE[u.status]} className="capitalize">{u.status}</Badge>
            {u.isEmailVerified ? <Badge tone="success">Email verified</Badge> : <Badge>Email unverified</Badge>}
            {u.role === 'recruiter' && (u.profile?.isVerified ? <Badge tone="success"><ShieldCheck className="h-3 w-3" />Verified company</Badge> : <Badge>Company unverified</Badge>)}
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-muted">Joined</dt><dd className="font-medium">{formatDate(u.createdAt)}</dd></div>
            <div><dt className="text-xs text-muted">Last login</dt><dd className="font-medium">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : 'never'}</dd></div>
            {u.role === 'recruiter' && <><div><dt className="text-xs text-muted">Company</dt><dd className="font-medium">{u.profile?.companyName}</dd></div><div><dt className="text-xs text-muted">Job postings</dt><dd className="font-medium">{query.data?.stats.jobs}</dd></div></>}
            {u.role === 'candidate' && <><div><dt className="text-xs text-muted">Profile completion</dt><dd className="font-medium">{u.profile?.completion ?? 0}%</dd></div><div><dt className="text-xs text-muted">Applications</dt><dd className="font-medium">{query.data?.stats.applications}</dd></div></>}
          </dl>
          <div>
            <h4 className="mb-2 text-sm font-semibold">Audit trail</h4>
            {query.data?.auditTrail.length ? (
              <ul className="divide-y divide-border rounded-xl border border-border text-sm">
                {query.data.auditTrail.map((a) => <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2"><span className="font-mono text-xs">{a.action}</span><span className="truncate text-xs text-muted">{a.reason ?? ''}</span><span className="shrink-0 text-xs text-faint">{timeAgo(a.createdAt)}</span></li>)}
              </ul>
            ) : <p className="text-sm text-muted">No administrative actions on this account.</p>}
          </div>
        </div>
      )}
    </Dialog>
  );
}
