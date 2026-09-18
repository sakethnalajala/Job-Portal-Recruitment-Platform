import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Card, Skeleton } from '@/components/ui';
import { toApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Role } from '@/types/api';
import { notificationPrefsApi, type NotificationPreferences as Prefs } from '@/features/recruiter/portals.api';

type EmailKey = keyof Prefs['email'];
type InAppKey = keyof Prefs['inApp'];

const ROWS: { key: EmailKey; label: string; hint: Record<Role, string> }[] = [
  { key: 'applicationUpdates', label: 'Application updates', hint: { candidate: 'Stage changes, confirmations and outcomes', recruiter: 'Withdrawals and application confirmations', admin: 'Application events' } },
  { key: 'newApplicants', label: 'New applicants', hint: { candidate: '—', recruiter: 'Someone applies to one of your jobs', admin: '—' } },
  { key: 'interviews', label: 'Interviews', hint: { candidate: 'Invitations, changes and reminders', recruiter: 'Scheduling confirmations and 24h reminders', admin: '—' } },
  { key: 'jobUpdates', label: 'Job updates', hint: { candidate: 'A job you applied to is closed', recruiter: 'Moderation notices about your postings', admin: '—' } },
  { key: 'marketing', label: 'Product news', hint: { candidate: 'Occasional tips and feature news', recruiter: 'Occasional tips and feature news', admin: '—' } },
];

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-primary-600' : 'bg-surface-3')}>
      <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
    </button>
  );
}

export function NotificationPreferences({ role }: { role: Role }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notifications', 'preferences'], queryFn: notificationPrefsApi.get, select: (r) => r.data.preferences });
  const save = useMutation({
    mutationFn: (body: Parameters<typeof notificationPrefsApi.update>[0]) => notificationPrefsApi.update(body),
    onSuccess: (r) => { qc.setQueryData(['notifications', 'preferences'], r); toast.success('Preference saved'); },
    onError: (e) => toast.error(toApiError(e).message),
  });
  if (q.isPending) return <Skeleton className="h-64 w-full rounded-2xl" />;
  if (q.isError) return <p className="text-sm text-danger">{toApiError(q.error).message}</p>;
  const p = q.data;
  const rows = ROWS.filter((r) => !(role === 'candidate' && r.key === 'newApplicants'));

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-5 py-4"><h2 className="font-semibold">Notification preferences</h2><p className="text-xs text-muted">Security and account emails (password resets, verification) are always sent.</p></div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-2/70 text-left text-xs font-semibold uppercase tracking-wider text-muted"><tr><th className="px-5 py-3">Category</th><th className="w-28 px-4 py-3 text-center"><span className="inline-flex items-center gap-1"><Bell className="h-3.5 w-3.5" />In-app</span></th><th className="w-28 px-4 py-3 text-center"><span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" />Email</span></th></tr></thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.key} className="row-hover">
                <td className="px-5 py-3"><p className="font-medium">{r.label}</p><p className="text-xs text-muted">{r.hint[role]}</p></td>
                <td className="px-4 py-3 text-center">{r.key !== 'marketing' ? <Switch label={`In-app ${r.label}`} checked={p.inApp[r.key as InAppKey]} onChange={(v) => save.mutate({ inApp: { [r.key]: v } })} /> : <span className="text-xs text-faint">—</span>}</td>
                <td className="px-4 py-3 text-center"><Switch label={`Email ${r.label}`} checked={p.email[r.key]} onChange={(v) => save.mutate({ email: { [r.key]: v } })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
