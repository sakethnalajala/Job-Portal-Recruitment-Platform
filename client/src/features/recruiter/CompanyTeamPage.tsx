import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Building2, CalendarClock, Check, Crown, Mail, MailQuestion, Shield, Trash2, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, Badge, Button, Card, ErrorState, Input, PageHeader, Select, Skeleton } from '@/components/ui';
import { BackButton } from '@/components/ui/BackButton';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { toApiError } from '@/lib/api';
import { cn, timeAgo } from '@/lib/utils';
import { CompanyProfilePage } from './CompanyProfilePage';
import { teamApi, type TeamMember, type TeamRole } from './portals.api';

const ROLE_TONE: Record<TeamRole | 'owner', 'violet' | 'primary' | 'info' | 'neutral'> = { owner: 'violet', admin: 'primary', recruiter: 'info', viewer: 'neutral' };
const ROLE_LABEL: Record<TeamRole | 'owner', string> = { owner: 'Owner', admin: 'Admin', recruiter: 'Recruiter', viewer: 'Viewer' };

function TeamTab() {
  const qc = useQueryClient();
  const team = useQuery({ queryKey: ['team'], queryFn: teamApi.get, select: (r) => r.data });
  const activity = useQuery({ queryKey: ['team', 'activity'], queryFn: teamApi.activity, select: (r) => r.data });
  const [invite, setInvite] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', title: '', role: 'recruiter' as TeamRole });
  const [remove, setRemove] = useState<TeamMember | null>(null);
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['team'] });
  const canManage = team.data?.yourRole === 'owner' || team.data?.yourRole === 'admin';

  const add = useMutation({ mutationFn: () => teamApi.invite({ email: form.email.trim(), name: form.name.trim() || undefined, title: form.title.trim() || undefined, role: form.role }), onSuccess: (r) => { toast.success(r.message); setInvite(false); setForm({ email: '', name: '', title: '', role: 'recruiter' }); invalidate(); }, onError: (e) => toast.error(toApiError(e).message) });
  const setRole = useMutation({ mutationFn: ({ id, role }: { id: string; role: TeamRole }) => teamApi.update(id, { role }), onSuccess: () => { toast.success('Role updated'); invalidate(); }, onError: (e) => toast.error(toApiError(e).message) });
  const del = useMutation({ mutationFn: (id: string) => teamApi.remove(id), onSuccess: () => { toast.success('Removed from team'); setRemove(null); invalidate(); }, onError: (e) => toast.error(toApiError(e).message) });

  const columns: Column<TeamMember>[] = [
    { key: 'member', header: 'Member', cell: (m) => <div className="flex items-center gap-3"><Avatar name={m.name ?? m.email} size="sm" /><div className="min-w-0"><p className="truncate font-medium">{m.name ?? m.email}</p><p className="truncate text-xs text-muted">{m.email}{m.title ? ` · ${m.title}` : ''}</p></div></div> },
    { key: 'role', header: 'Role', cell: (m) => canManage ? <div className="w-36"><Select value={m.role} onChange={(e) => setRole.mutate({ id: m.id, role: e.target.value as TeamRole })} className="h-9" aria-label={`Role for ${m.email}`}><option value="admin">Admin</option><option value="recruiter">Recruiter</option><option value="viewer">Viewer</option></Select></div> : <Badge tone={ROLE_TONE[m.role]}>{ROLE_LABEL[m.role]}</Badge> },
    { key: 'status', header: 'Status', cell: (m) => m.status === 'active' ? <Badge tone="success"><Check className="h-3 w-3" />Active</Badge> : <Badge tone="warning"><MailQuestion className="h-3 w-3" />Invited</Badge> },
    { key: 'since', header: 'Since', hideBelow: 'md', cell: (m) => <span className="text-muted">{m.joinedAt ? `joined ${timeAgo(m.joinedAt)}` : `invited ${timeAgo(m.invitedAt)}`}</span> },
    { key: 'actions', header: <span className="sr-only">Actions</span>, className: 'text-right', cell: (m) => canManage ? <Button variant="ghost" size="icon" className="h-8 w-8 text-muted hover:text-danger" aria-label={`Remove ${m.email}`} onClick={() => setRemove(m)}><Trash2 className="h-4 w-4" /></Button> : null },
  ];

  if (team.isPending) return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>;
  if (team.isError) return <ErrorState message={toApiError(team.error).message} onRetry={() => void team.refetch()} />;
  const t = team.data;

  return (
    <div className="space-y-6">
      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-600 to-violet-600 text-white"><Crown className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{t.owner.companyName ?? 'Your company'} hiring team</p>
          <p className="text-sm text-muted">Owner: {t.owner.name ?? t.owner.email}{t.owner.isYou ? ' (you)' : ''} · {t.members.filter((m) => m.status === 'active').length} active · {t.members.filter((m) => m.status === 'invited').length} invited</p>
        </div>
        <Badge tone={ROLE_TONE[t.yourRole]}>Your role: {ROLE_LABEL[t.yourRole]}</Badge>
        {canManage && <Button leftIcon={<UserPlus className="h-4 w-4" />} onClick={() => setInvite(true)}>Add member</Button>}
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <DataTable columns={columns} rows={t.members} rowKey={(m) => m.id} empty={{ title: 'No team members yet', description: 'Invite colleagues so they can review applicants with you.', action: canManage ? <Button onClick={() => setInvite(true)}>Add your first member</Button> : undefined }} caption="Team members" />

          <Card className="p-5">
            <h3 className="flex items-center gap-2 font-semibold"><Activity className="h-4 w-4 text-primary-600" />Team activity · last 30 days</h3>
            {activity.isPending ? <Skeleton className="mt-3 h-32" /> : activity.isError ? <p className="mt-3 text-sm text-danger">{toApiError(activity.error).message}</p> : (
              <>
                <p className="mt-1 text-sm text-muted">{activity.data.newApplications} new application{activity.data.newApplications === 1 ? '' : 's'} received.</p>
                {activity.data.events.length === 0 ? <p className="mt-3 text-sm text-muted">No hiring activity yet.</p> : (
                  <ol className="mt-3 space-y-3 border-l border-border pl-4">
                    {activity.data.events.map((e, i) => (
                      <li key={i} className="relative text-sm">
                        <span className={cn('absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-surface', e.type === 'interview' ? 'bg-warning' : e.type === 'job' ? 'bg-success' : 'bg-primary-600')} />
                        <Link to={e.link} className="hover:text-primary-600"><span className="font-medium">{e.actor}</span> {e.text}</Link>
                        <p className="text-xs text-muted">{timeAgo(e.at)}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </>
            )}
          </Card>
        </div>

        <aside className="space-y-4">
          <Card className="p-5">
            <h3 className="flex items-center gap-2 font-semibold"><Shield className="h-4 w-4 text-primary-600" />Roles & permissions</h3>
            <p className="text-xs text-muted">Enforced by the API on every request.</p>
            <dl className="mt-3 space-y-3">
              {(Object.entries(t.permissions) as [TeamRole | 'owner', readonly string[]][]).map(([role, perms]) => (
                <div key={role}>
                  <dt><Badge tone={ROLE_TONE[role]}>{ROLE_LABEL[role]}</Badge></dt>
                  <dd className="mt-1 flex flex-wrap gap-1">{perms.map((p) => <span key={p} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] text-text-secondary">{p}</span>)}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs text-muted">Invited members with an existing recruiter account get access instantly; others activate when they sign up with the same email.</p>
          </Card>
        </aside>
      </div>

      <Dialog open={invite} onClose={() => setInvite(false)} title="Add a team member" description="They must use (or create) a recruiter account with this email." size="sm"
        footer={<><Button variant="outline" onClick={() => setInvite(false)}>Cancel</Button><Button loading={add.isPending} disabled={!/^\S+@\S+\.\S+$/.test(form.email)} leftIcon={<Mail className="h-4 w-4" />} onClick={() => add.mutate()}>Add member</Button></>}>
        <div className="space-y-4">
          <Input label="Work email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="colleague@company.com" />
          <div className="grid gap-4 sm:grid-cols-2"><Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /><Input label="Job title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Talent partner" /></div>
          <Select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as TeamRole })}><option value="admin">Admin — manage jobs & team</option><option value="recruiter">Recruiter — review & move applicants</option><option value="viewer">Viewer — read-only</option></Select>
        </div>
      </Dialog>
      <ConfirmDialog open={Boolean(remove)} onClose={() => setRemove(null)} onConfirm={() => remove && del.mutate(remove.id)} loading={del.isPending} tone="danger" title="Remove this team member?" description={`${remove?.name ?? remove?.email} will immediately lose access to your job postings and applicants.`} confirmLabel="Remove" />
    </div>
  );
}

export function CompanyTeamPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'team' ? 'team' : 'company';
  return (
    <div>
      <BackButton fallback="/recruiter" className="mb-2" />
      <PageHeader title="Company & team" description="Your public company presence and the people who hire with you." />
      <div className="mb-6 inline-flex rounded-xl border border-border bg-surface-2 p-1 text-sm font-medium" role="tablist">
        {([['company', 'Company information', Building2], ['team', 'Team members', Users]] as const).map(([k, label, Icon]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setParams(k === 'company' ? {} : { tab: k })} className={cn('inline-flex items-center gap-2 rounded-lg px-4 py-2 transition-colors', tab === k ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text')}><Icon className="h-4 w-4" />{label}</button>
        ))}
      </div>
      {tab === 'team' ? <TeamTab /> : <CompanyProfilePage embedded />}
      {tab === 'company' && <p className="mt-6 flex items-center gap-1.5 text-xs text-muted"><CalendarClock className="h-3.5 w-3.5" />Changes to the company name and logo are reflected on all your postings immediately.</p>}
    </div>
  );
}

