import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CalendarDays, KeyRound, Mail, Save, ShieldCheck, UserCog } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, Badge, Button, Card, Input, PageHeader } from '@/components/ui';
import { Section } from '@/components/ui/extras';
import { useAuth } from '@/features/auth/AuthProvider';
import { authApi } from '@/features/auth/auth.api';
import { toApiError } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { adminApi } from './admin.api';

export function AdminProfilePage() {
  const qc = useQueryClient();
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState(user?.profile?.fullName ?? '');
  useEffect(() => setName(user?.profile?.fullName ?? ''), [user?.profile?.fullName]);
  const detail = useQuery({ queryKey: ['admin', 'user', user?.id], queryFn: () => adminApi.user(user!.id), enabled: Boolean(user), select: (r) => r.data });
  const sessions = useQuery({ queryKey: ['auth', 'sessions'], queryFn: authApi.sessions, select: (r) => r.data.sessions });
  const save = useMutation({ mutationFn: () => authApi.updateDisplayName(name.trim()), onSuccess: async () => { toast.success('Display name updated'); await refreshUser(); void qc.invalidateQueries({ queryKey: ['admin', 'user'] }); }, onError: (e) => toast.error(toApiError(e).message) });
  if (!user) return null;
  const u = detail.data?.user;
  const completion = [Boolean(user.profile?.fullName), user.isEmailVerified, (sessions.data?.length ?? 0) > 0, Boolean(u?.lastLoginAt)].filter(Boolean).length;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Admin profile" description="Your administrator identity and account security." />
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-4">
          <Card className="p-5 text-center">
            <Avatar name={user.profile?.fullName} size="xl" className="mx-auto" />
            <p className="mt-3 font-semibold">{user.profile?.fullName}</p>
            <p className="text-sm text-muted">{user.email}</p>
            <Badge tone="violet" className="mt-3"><ShieldCheck className="h-3 w-3" />Administrator</Badge>
            <div className="mt-5 text-left">
              <div className="mb-1 flex justify-between text-xs"><span className="text-muted">Account setup</span><span className="font-semibold">{completion}/4</span></div>
              <div className="h-2 rounded-full bg-surface-3"><div className="h-full rounded-full bg-gradient-to-r from-primary-600 to-violet-500 transition-[width] duration-500" style={{ width: `${(completion / 4) * 100}%` }} /></div>
            </div>
          </Card>
          <Card className="p-5 text-sm">
            <h3 className="font-semibold">Account</h3>
            <dl className="mt-3 space-y-2">
              <div className="flex items-center gap-2 text-muted"><Mail className="h-4 w-4" /><dt className="sr-only">Email</dt><dd className="truncate text-text">{user.email}</dd></div>
              <div className="flex items-center gap-2 text-muted"><CalendarDays className="h-4 w-4" /><dt className="sr-only">Joined</dt><dd className="text-text">Joined {u ? formatDate(u.createdAt) : '…'}</dd></div>
              <div className="flex items-center gap-2 text-muted"><Bell className="h-4 w-4" /><dt className="sr-only">Last login</dt><dd className="text-text">Last login {u?.lastLoginAt ? formatDate(u.lastLoginAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</dd></div>
            </dl>
          </Card>
        </aside>

        <div className="space-y-6">
          <Section title="Display name" description="Shown in the console header and audit entries. Email and role cannot be changed here.">
            <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} className="sm:w-80" />
              <Button type="submit" leftIcon={<Save className="h-4 w-4" />} loading={save.isPending} disabled={name.trim().length < 2 || name.trim() === user.profile?.fullName}>Save</Button>
            </form>
          </Section>
          <Section title="Role & permissions">
            <div className="flex items-start gap-3 rounded-xl border border-border p-4 text-sm">
              <UserCog className="mt-0.5 h-5 w-5 text-primary-600" />
              <div>
                <p className="font-medium">Administrator — full platform access</p>
                <p className="text-muted">User management, job moderation, reports, platform settings, analytics and audit log. The role is fixed on the server; it cannot be changed from the interface.</p>
                <Link to="/admin/security" className="mt-2 inline-block text-primary-600 hover:underline dark:text-primary-400">View the permission matrix</Link>
              </div>
            </div>
          </Section>
          <Section title="Security">
            <div className="grid gap-3 sm:grid-cols-2">
              <Link to="/settings" className="flex items-center gap-3 rounded-xl border border-border p-4 transition-colors hover:bg-surface-2"><KeyRound className="h-5 w-5 text-primary-600" /><span><span className="block text-sm font-medium">Change password</span><span className="block text-xs text-muted">Signs out other devices</span></span></Link>
              <Link to="/admin/security" className="flex items-center gap-3 rounded-xl border border-border p-4 transition-colors hover:bg-surface-2"><ShieldCheck className="h-5 w-5 text-primary-600" /><span><span className="block text-sm font-medium">Active sessions</span><span className="block text-xs text-muted">{sessions.data ? `${sessions.data.length} device${sessions.data.length === 1 ? '' : 's'} signed in` : '…'}</span></span></Link>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
