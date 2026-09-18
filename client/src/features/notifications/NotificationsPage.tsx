import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, ChevronLeft, ChevronRight, MailOpen, SlidersHorizontal, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui';
import { FilterPills } from '@/components/ui/DataTable';
import { useAuth } from '@/features/auth/AuthProvider';
import { dashboardPathFor } from '@/lib/utils';
import { notificationPrefsApi } from '@/features/recruiter/portals.api';
import { NotificationPreferences } from './NotificationPreferences';
import { BackButton } from '@/components/ui/BackButton';
import { del, get, patch, toApiError } from '@/lib/api';
import { cn, timeAgo } from '@/lib/utils';
import type { NotificationItem } from '@/types/api';

const CATEGORIES = [
  { value: 'application_status', label: 'Application updates', roles: ['candidate', 'recruiter', 'admin'] },
  { value: 'interview_scheduled', label: 'Interviews', roles: ['candidate', 'recruiter', 'admin'] },
  { value: 'new_applicant', label: 'New applicants', roles: ['recruiter', 'admin'] },
  { value: 'application_submitted', label: 'Submitted', roles: ['candidate', 'admin'] },
  { value: 'application_withdrawn', label: 'Withdrawn', roles: ['recruiter', 'admin'] },
  { value: 'job_closed', label: 'Job alerts', roles: ['candidate', 'recruiter', 'admin'] },
  { value: 'recruiter_verified', label: 'Verification', roles: ['recruiter', 'admin'] },
  { value: 'system', label: 'Messages', roles: ['candidate', 'recruiter', 'admin'] },
  { value: 'account', label: 'Account', roles: ['candidate', 'recruiter', 'admin'] },
] as const;
type Category = (typeof CATEGORIES)[number]['value'];
const EMPTY_COPY: Record<string, string> = {
  candidate: 'Job alerts, application updates, interview invites and recruiter messages will show up here.',
  recruiter: 'Application updates, interview invites and new applicants will show up here.',
  admin: 'Reports, verification requests and system events will show up here.',
};

export function NotificationsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? 1);
  const unreadOnly = params.get('unread') === 'true';
  const type = (params.get('type') ?? '') as Category | '';
  const tab = params.get('tab') === 'preferences' ? 'preferences' : 'inbox';
  const setFilters = (patch: { unread?: boolean; type?: string; page?: number }) => {
    const next: Record<string, string> = {};
    const u = patch.unread ?? unreadOnly; const t = patch.type ?? type;
    if (u) next.unread = 'true';
    if (t) next.type = t;
    if (patch.page && patch.page > 1) next.page = String(patch.page);
    setParams(next);
  };

  const query = useQuery({
    queryKey: ['notifications', 'list', { page, unreadOnly, type }],
    queryFn: () => get<{ notifications: NotificationItem[] }>('/notifications', { params: { page, limit: 15, unreadOnly, ...(type ? { type } : {}) } }),
    placeholderData: keepPreviousData,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['notifications'] });
  const markRead = useMutation({ mutationFn: (id: string) => patch(`/notifications/${id}/read`), onSuccess: invalidate });
  const markAll = useMutation({ mutationFn: () => patch<{ updated: number }>('/notifications/read-all'), onSuccess: (r) => { toast.success(`${r.data.updated} marked as read`); invalidate(); } });
  const remove = useMutation({ mutationFn: (id: string) => del(`/notifications/${id}`), onSuccess: invalidate, onError: (e) => toast.error(toApiError(e).message) });
  const markUnread = useMutation({ mutationFn: (id: string) => notificationPrefsApi.markUnread(id), onSuccess: invalidate, onError: (e) => toast.error(toApiError(e).message) });

  const items = query.data?.data.notifications ?? [];
  const meta = query.data?.meta;
  const unread = (meta?.unreadCount as number | undefined) ?? 0;

  return (
    <div className="mx-auto max-w-3xl">
      <BackButton fallback={user ? dashboardPathFor(user.role) : '/'} className="mb-2" />
      <PageHeader
        title="Notifications"
        description={unread ? `${unread} unread` : 'You are all caught up.'}
        actions={tab === 'inbox' ? (
          <>
            <Button variant={unreadOnly ? 'primary' : 'outline'} size="sm" onClick={() => setFilters({ unread: !unreadOnly })} aria-pressed={unreadOnly}>Unread only</Button>
            <Button variant="outline" size="sm" leftIcon={<CheckCheck className="h-4 w-4" />} disabled={!unread} loading={markAll.isPending} onClick={() => markAll.mutate()}>Mark all read</Button>
          </>
        ) : undefined}
      />

      <div className="mb-5 inline-flex rounded-xl border border-border bg-surface-2 p-1 text-sm font-medium" role="tablist">
        <button role="tab" aria-selected={tab === 'inbox'} onClick={() => setParams({})} className={tab === 'inbox' ? 'inline-flex items-center gap-2 rounded-lg bg-surface px-4 py-2 text-text shadow-sm' : 'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-muted hover:text-text'}><Bell className="h-4 w-4" />Inbox</button>
        <button role="tab" aria-selected={tab === 'preferences'} onClick={() => setParams({ tab: 'preferences' })} className={tab === 'preferences' ? 'inline-flex items-center gap-2 rounded-lg bg-surface px-4 py-2 text-text shadow-sm' : 'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-muted hover:text-text'}><SlidersHorizontal className="h-4 w-4" />Preferences</button>
      </div>

      {tab === 'preferences' ? <NotificationPreferences role={user?.role ?? 'candidate'} /> : (<>
      <div className="mb-4"><FilterPills value={type} onChange={(v) => setFilters({ type: v })} options={CATEGORIES.filter((c) => (c.roles as readonly string[]).includes(user?.role ?? 'candidate')).map((c) => ({ value: c.value, label: c.label }))} /></div>

      {query.isPending ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}</div>
      ) : query.isError ? (
        <ErrorState message={toApiError(query.error).message} onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={<Bell className="h-6 w-6" />} title={unreadOnly ? 'No unread notifications' : type ? 'Nothing in this category' : 'No notifications yet'} description={EMPTY_COPY[user?.role ?? 'candidate']} />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {items.map((n) => (
              <li key={n.id} className={cn('flex gap-3 px-4 py-4', !n.isRead && 'bg-primary-50/50 dark:bg-primary-950/30')}>
                <span className={cn('mt-2 h-2 w-2 shrink-0 rounded-full', n.isRead ? 'bg-transparent' : 'bg-primary-600')} aria-label={n.isRead ? undefined : 'Unread'} />
                <div className="min-w-0 flex-1">
                  {n.link ? (
                    <Link to={n.link} onClick={() => !n.isRead && markRead.mutate(n.id)} className="font-medium hover:underline">{n.title}</Link>
                  ) : (
                    <p className="font-medium">{n.title}</p>
                  )}
                  <p className="mt-0.5 text-sm text-text-secondary">{n.message}</p>
                  <p className="mt-1 text-xs text-faint">{timeAgo(n.createdAt)}</p>
                </div>
                <div className="flex shrink-0 items-start gap-1">
                  {n.isRead ? <Button variant="ghost" size="sm" leftIcon={<MailOpen className="h-4 w-4" />} onClick={() => markUnread.mutate(n.id)}>Mark unread</Button> : <Button variant="ghost" size="sm" onClick={() => markRead.mutate(n.id)}>Mark read</Button>}
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Delete notification" onClick={() => remove.mutate(n.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {meta && meta.totalPages > 1 && (
        <nav className="mt-6 flex items-center justify-center gap-2" aria-label="Pagination">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setFilters({ page: page - 1 })} leftIcon={<ChevronLeft className="h-4 w-4" />}>Previous</Button>
          <span className="px-3 text-sm text-muted">Page {meta.page} of {meta.totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setFilters({ page: page + 1 })} rightIcon={<ChevronRight className="h-4 w-4" />}>Next</Button>
        </nav>
      )}
      </>)}
    </div>
  );
}
