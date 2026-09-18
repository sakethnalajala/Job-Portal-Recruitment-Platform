import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Check, Clock, KeyRound, Laptop, LogOut, Minus, ShieldCheck, Smartphone, UserCog } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, Card, PageHeader, Skeleton } from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { useState } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { authApi, type SessionInfo } from '@/features/auth/auth.api';
import { toApiError } from '@/lib/api';
import { formatDate, timeAgo } from '@/lib/utils';
import { adminApi } from './admin.api';

const PERMISSIONS: { capability: string; candidate: boolean; recruiter: boolean; admin: boolean }[] = [
  { capability: 'Browse & search jobs', candidate: true, recruiter: true, admin: true },
  { capability: 'Apply, save jobs, manage resume', candidate: true, recruiter: false, admin: false },
  { capability: 'Post & manage job postings', candidate: false, recruiter: true, admin: false },
  { capability: 'Review applicants & change stages', candidate: false, recruiter: true, admin: false },
  { capability: 'View any candidate profile', candidate: false, recruiter: false, admin: true },
  { capability: 'Suspend / delete users, verify companies', candidate: false, recruiter: false, admin: true },
  { capability: 'Moderate jobs & resolve reports', candidate: false, recruiter: false, admin: true },
  { capability: 'Platform settings & audit log', candidate: false, recruiter: false, admin: true },
  { capability: 'Create administrator accounts', candidate: false, recruiter: false, admin: false },
];

function device(ua: string | null) {
  if (!ua) return { label: 'Unknown client', mobile: false };
  const mobile = /Mobile|Android|iPhone/i.test(ua);
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : /node|undici|curl/i.test(ua) ? 'API client' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : '';
  return { label: [browser, os].filter(Boolean).join(' · '), mobile };
}

export function SecurityPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [confirmAll, setConfirmAll] = useState(false);
  const sessions = useQuery({ queryKey: ['auth', 'sessions'], queryFn: authApi.sessions, select: (r) => r.data.sessions });
  const admins = useQuery({ queryKey: ['admin', 'users', { role: 'admin' }], queryFn: () => adminApi.users({ role: 'admin', limit: 20 }), select: (r) => r.data.users });
  const audit = useQuery({ queryKey: ['admin', 'audit', 'recent'], queryFn: () => adminApi.auditLogs({ limit: 8 }), select: (r) => r.data.logs });
  const revoke = useMutation({ mutationFn: (id: string) => authApi.revokeSession(id), onSuccess: () => { toast.success('Session signed out'); void qc.invalidateQueries({ queryKey: ['auth', 'sessions'] }); }, onError: (e) => toast.error(toApiError(e).message) });
  const { logout } = useAuth();
  const logoutAll = useMutation({ mutationFn: authApi.logoutAll, onSuccess: async () => { toast.success('All sessions signed out'); await logout(); }, onError: (e) => toast.error(toApiError(e).message) });

  return (
    <div>
      <PageHeader title="Security & access" description="Who can do what, where you are signed in, and what changed recently." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div><h2 className="font-semibold">Your sessions</h2><p className="text-xs text-muted">Each row is a refresh token issued at login. Revoking one signs that device out.</p></div>
            <Button variant="outline" size="sm" leftIcon={<LogOut className="h-4 w-4" />} onClick={() => setConfirmAll(true)}>Sign out everywhere</Button>
          </div>
          {sessions.isPending ? <Skeleton className="mt-4 h-24" /> : sessions.isError ? <p className="mt-3 text-sm text-danger">{toApiError(sessions.error).message}</p> : (
            <ul className="mt-4 divide-y divide-border">
              {sessions.data.map((s: SessionInfo) => { const d = device(s.userAgent); return (
                <li key={s.id} className="flex items-center gap-3 py-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-2 text-muted">{d.mobile ? <Smartphone className="h-4 w-4" /> : <Laptop className="h-4 w-4" />}</span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium">{d.label}{s.current && <Badge tone="success">This device</Badge>}</p>
                    <p className="text-xs text-muted">{s.ip ?? 'unknown IP'} · signed in {timeAgo(s.createdAt)} · expires {formatDate(s.expiresAt)}</p>
                  </div>
                  {!s.current && <Button variant="ghost" size="sm" onClick={() => revoke.mutate(s.id)} loading={revoke.isPending && revoke.variables === s.id}>Revoke</Button>}
                </li>
              ); })}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold">Account security</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between border-b border-border py-1.5"><dt className="text-muted">Signed in as</dt><dd className="font-medium">{user?.email}</dd></div>
            <div className="flex justify-between border-b border-border py-1.5"><dt className="text-muted">Role</dt><dd><Badge tone="violet"><ShieldCheck className="h-3 w-3" />Administrator</Badge></dd></div>
            <div className="flex justify-between border-b border-border py-1.5"><dt className="text-muted">Access token</dt><dd className="font-medium">Short-lived JWT, in memory only</dd></div>
            <div className="flex justify-between border-b border-border py-1.5"><dt className="text-muted">Refresh token</dt><dd className="font-medium">httpOnly cookie, rotated on use</dd></div>
            <div className="flex justify-between py-1.5"><dt className="text-muted">Password</dt><dd><Link to="/settings" className="inline-flex items-center gap-1 text-primary-600 hover:underline dark:text-primary-400"><KeyRound className="h-3.5 w-3.5" />Change password</Link></dd></div>
          </dl>
          <h3 className="mt-6 text-sm font-semibold">Administrator accounts</h3>
          <p className="text-xs text-muted">Provisioned server-side only. There is no signup path for this role.</p>
          {admins.isPending ? <Skeleton className="mt-2 h-12" /> : (
            <ul className="mt-2 space-y-1.5 text-sm">
              {admins.data?.map((a) => <li key={a.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2"><span className="inline-flex items-center gap-2"><UserCog className="h-4 w-4 text-muted" />{a.profile?.fullName ?? a.email}<span className="text-xs text-muted">{a.email}</span></span><span className="inline-flex items-center gap-1 text-xs text-muted"><Clock className="h-3 w-3" />{a.lastLoginAt ? timeAgo(a.lastLoginAt) : 'never'}</span></li>)}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-6 overflow-hidden">
        <div className="border-b border-border px-5 py-4"><h2 className="font-semibold">Role & permission matrix</h2><p className="text-xs text-muted">Enforced by backend middleware (authenticate → authorize → ownership checks), not by the UI.</p></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2/70 text-left text-xs font-semibold uppercase tracking-wider text-muted"><tr><th className="px-5 py-3">Capability</th><th className="px-4 py-3 text-center">Candidate</th><th className="px-4 py-3 text-center">Recruiter</th><th className="px-4 py-3 text-center">Admin</th></tr></thead>
            <tbody className="divide-y divide-border">
              {PERMISSIONS.map((p) => (
                <tr key={p.capability} className="row-hover">
                  <td className="px-5 py-2.5">{p.capability}</td>
                  {[p.candidate, p.recruiter, p.admin].map((v, i) => <td key={i} className="px-4 py-2.5 text-center">{v ? <Check className="mx-auto h-4 w-4 text-success" aria-label="Allowed" /> : <Minus className="mx-auto h-4 w-4 text-faint" aria-label="Not allowed" />}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-6 p-5">
        <div className="flex items-center justify-between"><h2 className="font-semibold">Recent privileged actions</h2><Link to="/admin/audit-logs" className="text-sm text-primary-600 hover:underline dark:text-primary-400">Full audit log</Link></div>
        {audit.isPending ? <Skeleton className="mt-3 h-24" /> : audit.data?.length ? (
          <ul className="mt-3 divide-y divide-border text-sm">{audit.data.map((a) => <li key={a.id} className="flex items-center justify-between gap-3 py-2"><span className="font-mono text-xs">{a.action}</span><span className="truncate text-xs text-muted">{a.reason ?? ''}</span><span className="shrink-0 text-xs text-faint">{timeAgo(a.createdAt)}</span></li>)}</ul>
        ) : <p className="mt-3 text-sm text-muted">No privileged actions recorded yet.</p>}
      </Card>

      <ConfirmDialog open={confirmAll} onClose={() => setConfirmAll(false)} onConfirm={() => logoutAll.mutate()} loading={logoutAll.isPending} tone="danger" title="Sign out of all devices?" description="Every session, including this one, is revoked. You will need to log in again." confirmLabel="Sign out everywhere" />
    </div>
  );
}
