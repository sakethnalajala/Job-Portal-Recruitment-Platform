import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Save, ShieldAlert, UserPlus, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, Button, ErrorState, Input, PageHeader, Select, Skeleton, Textarea } from '@/components/ui';
import { Section } from '@/components/ui/extras';
import { toApiError } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import { adminPlatformApi, type PlatformSettingsView } from './admin.api';

const schema = z.object({
  platformName: z.string().trim().min(2).max(60),
  supportEmail: z.string().trim().email('Enter a valid email').or(z.literal('')),
  registrationCandidate: z.boolean(),
  registrationRecruiter: z.boolean(),
  maintenanceEnabled: z.boolean(),
  maintenanceMessage: z.string().trim().min(5, 'At least 5 characters').max(300),
  announcementEnabled: z.boolean(),
  announcementMessage: z.string().trim().max(300),
  announcementTone: z.enum(['info', 'success', 'warning']),
  requireVerifiedCompany: z.boolean(),
  defaultDeadlineDays: z.coerce.number().int().min(1).max(365),
}).refine((v) => !v.announcementEnabled || v.announcementMessage.length > 0, { path: ['announcementMessage'], message: 'Enter the announcement text' });
type Values = z.infer<typeof schema>;

const fromApi = (s: PlatformSettingsView): Values => ({
  platformName: s.platformName, supportEmail: s.supportEmail, registrationCandidate: s.registration.candidate, registrationRecruiter: s.registration.recruiter,
  maintenanceEnabled: s.maintenance.enabled, maintenanceMessage: s.maintenance.message || 'We are performing scheduled maintenance. Please check back shortly.',
  announcementEnabled: s.announcement.enabled, announcementMessage: s.announcement.message, announcementTone: s.announcement.tone,
  requireVerifiedCompany: s.jobs.requireVerifiedCompanyToPublish, defaultDeadlineDays: s.jobs.defaultDeadlineDays,
});

function Toggle({ label, description, checked, onChange, danger }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void; danger?: boolean }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-border p-4 transition-colors hover:bg-surface-2">
      <span><span className="block text-sm font-medium">{label}</span>{description && <span className="block text-xs text-muted">{description}</span>}</span>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={cn('relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors', checked ? (danger ? 'bg-danger' : 'bg-primary-600') : 'bg-surface-3')}>
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
      </button>
    </label>
  );
}

export function PlatformSettingsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'settings'], queryFn: adminPlatformApi.settings, select: (r) => r.data.settings });
  const form = useForm<Values>({ resolver: zodResolver(schema) });
  useEffect(() => { if (q.data) form.reset(fromApi(q.data)); }, [q.data, form]);

  const save = useMutation({
    mutationFn: (v: Values) => adminPlatformApi.updateSettings({
      platformName: v.platformName, supportEmail: v.supportEmail,
      registration: { candidate: v.registrationCandidate, recruiter: v.registrationRecruiter },
      maintenance: { enabled: v.maintenanceEnabled, message: v.maintenanceMessage },
      announcement: { enabled: v.announcementEnabled, message: v.announcementMessage, tone: v.announcementTone },
      jobs: { requireVerifiedCompanyToPublish: v.requireVerifiedCompany, defaultDeadlineDays: v.defaultDeadlineDays },
    }),
    onSuccess: (r) => { toast.success('Platform settings saved'); qc.setQueryData(['admin', 'settings'], r); void qc.invalidateQueries({ queryKey: ['settings'] }); void qc.invalidateQueries({ queryKey: ['admin', 'audit'] }); },
    onError: (e) => toast.error(toApiError(e).message),
  });

  if (q.isPending) return <div className="space-y-4"><Skeleton className="h-8 w-56" /><Skeleton className="h-72 w-full" /></div>;
  if (q.isError) return <ErrorState message={toApiError(q.error).message} onRetry={() => void q.refetch()} />;
  const w = form.watch();
  const e = form.formState.errors;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Platform settings" description={`Every change is recorded in the audit log. Last updated ${q.data.updatedAt ? formatDate(q.data.updatedAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never'}.`} />
      {w.maintenanceEnabled && <Alert tone="warning" title="Maintenance mode is ON" className="mb-5">Candidates and recruiters cannot log in or register until you switch it off. Administrators are unaffected.</Alert>}

      <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-6" noValidate>
        <Section title="Identity">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Platform name" error={e.platformName?.message} {...form.register('platformName')} />
            <Input label="Support email" type="email" placeholder="support@example.com" error={e.supportEmail?.message} {...form.register('supportEmail')} />
          </div>
        </Section>

        <Section title="Registration" description="Open or close public signups per role. Existing accounts keep working.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Toggle label="Candidate signups" description="Allow new candidate accounts" checked={w.registrationCandidate ?? true} onChange={(v) => form.setValue('registrationCandidate', v, { shouldDirty: true })} />
            <Toggle label="Recruiter signups" description="Allow new recruiter accounts" checked={w.registrationRecruiter ?? true} onChange={(v) => form.setValue('registrationRecruiter', v, { shouldDirty: true })} />
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted"><UserPlus className="h-3.5 w-3.5" />Administrator accounts are never created through registration — only via the server seed script.</p>
        </Section>

        <Section title="Announcement banner" description="Shown at the top of every public page.">
          <div className="space-y-4">
            <Toggle label="Show announcement" checked={w.announcementEnabled ?? false} onChange={(v) => form.setValue('announcementEnabled', v, { shouldDirty: true })} />
            <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
              <Textarea label="Message" rows={2} maxLength={300} error={e.announcementMessage?.message} {...form.register('announcementMessage')} />
              <Select label="Tone" {...form.register('announcementTone')}><option value="info">Info</option><option value="success">Success</option><option value="warning">Warning</option></Select>
            </div>
            {w.announcementEnabled && w.announcementMessage && <p className="flex items-center gap-2 rounded-xl border border-info/30 bg-info-bg px-3 py-2 text-sm"><Megaphone className="h-4 w-4 text-info" />{w.announcementMessage}</p>}
          </div>
        </Section>

        <Section title="Jobs">
          <div className="grid gap-4 sm:grid-cols-2">
            <Toggle label="Require verified company to publish" description="Unverified recruiters can still save drafts" checked={w.requireVerifiedCompany ?? false} onChange={(v) => form.setValue('requireVerifiedCompany', v, { shouldDirty: true })} />
            <Input label="Suggested deadline (days)" type="number" min={1} max={365} hint="Used as the default hint for new postings" error={e.defaultDeadlineDays?.message} {...form.register('defaultDeadlineDays')} />
          </div>
        </Section>

        <Section title="Maintenance mode" description="Blocks candidate and recruiter logins and registrations. Admins stay in." className="border-warning/40">
          <div className="space-y-4">
            <Toggle label="Enable maintenance mode" checked={w.maintenanceEnabled ?? false} onChange={(v) => form.setValue('maintenanceEnabled', v, { shouldDirty: true })} danger />
            <Textarea label="Message shown to users" rows={2} maxLength={300} error={e.maintenanceMessage?.message} {...form.register('maintenanceMessage')} />
            <p className="flex items-center gap-1.5 text-xs text-muted"><ShieldAlert className="h-3.5 w-3.5" />Secrets, connection strings and API keys are never editable from here — they live in environment variables only.</p>
          </div>
        </Section>

        <div className="sticky bottom-4 z-10 flex justify-end gap-2 rounded-2xl border border-border bg-surface/90 p-3 shadow-card backdrop-blur">
          <Button type="button" variant="outline" onClick={() => form.reset(fromApi(q.data))} disabled={!form.formState.isDirty}>Discard</Button>
          <Button type="submit" loading={save.isPending} disabled={!form.formState.isDirty} leftIcon={<Save className="h-4 w-4" />}>Save settings</Button>
        </div>
      </form>
      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted"><Wrench className="h-3.5 w-3.5" />Changes take effect immediately for new requests.</p>
    </div>
  );
}
