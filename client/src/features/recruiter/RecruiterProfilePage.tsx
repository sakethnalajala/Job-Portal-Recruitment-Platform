import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Camera, CheckCircle2, KeyRound, Laptop, Mail, Phone, Save, ShieldCheck, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, Badge, Button, Card, ErrorState, Input, PageHeader, Skeleton } from '@/components/ui';
import { BackButton } from '@/components/ui/BackButton';
import { Section } from '@/components/ui/extras';
import { useAuth } from '@/features/auth/AuthProvider';
import { authApi } from '@/features/auth/auth.api';
import { useServerError } from '@/features/auth/useAuthForm';
import { toApiError } from '@/lib/api';
import { formatDate, timeAgo } from '@/lib/utils';
import { recruiterProfileApi } from './portals.api';
import { recruiterApi, type RecruiterProfile } from './recruiter.api';

const schema = z.object({
  fullName: z.string().trim().min(2, 'Enter your name').max(120),
  phone: z.string().trim().regex(/^[+\d][\d\s\-()]{6,19}$/, 'Enter a valid phone number').or(z.literal('')).optional(),
});
type Values = z.infer<typeof schema>;

export function RecruiterProfilePage() {
  const qc = useQueryClient();
  const { user, refreshUser } = useAuth();
  const photoInput = useRef<HTMLInputElement>(null);
  const profile = useQuery({ queryKey: ['recruiter', 'profile'], queryFn: recruiterApi.profile, select: (r) => r.data.profile });
  const sessions = useQuery({ queryKey: ['auth', 'sessions'], queryFn: authApi.sessions, select: (r) => r.data.sessions });
  const { formError, handle } = useServerError<Values>();
  const form = useForm<Values>({ resolver: zodResolver(schema) });
  useEffect(() => { if (profile.data) form.reset({ fullName: profile.data.fullName, phone: profile.data.phone ?? '' }); }, [profile.data, form]);

  const invalidate = () => { void qc.invalidateQueries({ queryKey: ['recruiter'] }); void refreshUser(); };
  const save = useMutation({ mutationFn: (v: Values) => recruiterApi.updateProfile({ fullName: v.fullName, phone: v.phone || undefined }), onSuccess: () => { toast.success('Profile saved'); invalidate(); }, onError: (e) => handle(e, form.setError) });
  const upload = useMutation({ mutationFn: (f: File) => recruiterProfileApi.uploadPhoto(f), onSuccess: () => { toast.success('Photo updated'); invalidate(); }, onError: (e) => toast.error(toApiError(e).message) });
  const removePhoto = useMutation({ mutationFn: recruiterProfileApi.deletePhoto, onSuccess: invalidate, onError: (e) => toast.error(toApiError(e).message) });

  if (profile.isPending) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;
  if (profile.isError) return <ErrorState message={toApiError(profile.error).message} onRetry={() => void profile.refetch()} />;
  const p: RecruiterProfile = profile.data;
  const e = form.formState.errors;
  const completion = [Boolean(p.fullName), Boolean(p.phone), Boolean(p.photoUrl), Boolean(user?.isEmailVerified), Boolean(p.companyDescription), Boolean(p.logoUrl)].filter(Boolean).length;

  return (
    <div>
      <BackButton fallback="/recruiter" className="mb-2" />
      <PageHeader title="My profile" description="How you appear to candidates and teammates." />
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5 text-center">
            <div className="relative mx-auto w-24">
              <Avatar src={p.photoUrl} name={p.fullName} size="xl" />
              <button type="button" onClick={() => photoInput.current?.click()} disabled={upload.isPending} className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary-600 text-white shadow-md transition-transform hover:scale-105 active:scale-95" aria-label="Change photo">
                {upload.isPending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Camera className="h-4 w-4" />}
              </button>
              <input ref={photoInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(ev) => { const f = ev.target.files?.[0]; if (f) upload.mutate(f); ev.target.value = ''; }} />
            </div>
            <p className="mt-3 font-semibold">{p.fullName}</p>
            <p className="text-sm text-muted">Recruiter at {p.companyName}</p>
            {p.photoUrl && <button type="button" onClick={() => removePhoto.mutate()} className="mt-1 text-xs text-muted hover:text-danger">Remove photo</button>}
            <div className="mt-4 flex flex-wrap justify-center gap-1.5">
              {user?.isEmailVerified ? <Badge tone="success"><CheckCircle2 className="h-3 w-3" />Email verified</Badge> : <Badge tone="warning">Email unverified</Badge>}
              {p.isVerified ? <Badge tone="primary"><ShieldCheck className="h-3 w-3" />Verified company</Badge> : <Badge>Company unverified</Badge>}
            </div>
            <div className="mt-5 text-left">
              <div className="mb-1 flex justify-between text-xs"><span className="text-muted">Profile completeness</span><span className="font-semibold">{Math.round((completion / 6) * 100)}%</span></div>
              <div className="h-2 rounded-full bg-surface-3"><div className="h-full rounded-full bg-gradient-to-r from-primary-600 to-violet-600 transition-[width] duration-500" style={{ width: `${(completion / 6) * 100}%` }} /></div>
            </div>
          </Card>
          <Card className="p-5 text-sm">
            <h3 className="font-semibold">Account</h3>
            <dl className="mt-3 space-y-2 text-text-secondary">
              <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted" /><dd className="truncate">{p.email}</dd></div>
              <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted" /><dd>{p.phone || 'No phone added'}</dd></div>
              <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-muted" /><dd>{p.companyName}{p.location?.city ? ` · ${p.location.city}` : ''}</dd></div>
              <div className="flex items-center gap-2"><Laptop className="h-4 w-4 text-muted" /><dd>Member since {p.createdAt ? formatDate(p.createdAt, { month: 'short', year: 'numeric' }) : '—'}</dd></div>
            </dl>
          </Card>
        </aside>

        <div className="space-y-6">
          <form onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate>
            <Section title="Personal information" description="Your email is your login and cannot be changed here." actions={<Button type="submit" size="sm" leftIcon={<Save className="h-4 w-4" />} loading={save.isPending} disabled={!form.formState.isDirty}>Save</Button>}>
              {formError && <p role="alert" className="mb-4 rounded-xl border border-danger/30 bg-danger-bg px-4 py-3 text-sm text-danger">{formError}</p>}
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Full name" error={e.fullName?.message} {...form.register('fullName')} />
                <Input label="Phone" placeholder="+91 98765 43210" error={e.phone?.message} {...form.register('phone')} />
                <Input label="Email" value={p.email ?? ''} readOnly disabled hint="Managed in account settings" />
                <Input label="Company" value={p.companyName} readOnly disabled hint="Edit under Company & team" />
              </div>
            </Section>
          </form>

          <Section title="Company information" description="Shared with every posting." actions={<Link to="/recruiter/company"><Button variant="outline" size="sm" leftIcon={<Building2 className="h-4 w-4" />}>Manage company & team</Button></Link>}>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-muted">Company</dt><dd className="font-medium">{p.companyName}</dd></div>
              <div><dt className="text-xs text-muted">Industry</dt><dd className="font-medium">{p.industry ?? '—'}</dd></div>
              <div><dt className="text-xs text-muted">Size</dt><dd className="font-medium">{p.companySize ? `${p.companySize} people` : '—'}</dd></div>
              <div><dt className="text-xs text-muted">Website</dt><dd className="font-medium">{p.website ? <a href={p.website} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">{p.website}</a> : '—'}</dd></div>
              <div><dt className="text-xs text-muted">Open jobs</dt><dd className="font-medium">{p.openJobs ?? 0}</dd></div>
              <div><dt className="text-xs text-muted">Verification</dt><dd className="font-medium">{p.isVerified ? `Verified ${p.verifiedAt ? formatDate(p.verifiedAt) : ''}` : 'Pending review'}</dd></div>
            </dl>
          </Section>

          <Section title="Account security">
            <div className="grid gap-3 sm:grid-cols-2">
              <Link to="/settings" className="flex items-center gap-3 rounded-xl border border-border p-4 transition-colors hover:bg-surface-2"><KeyRound className="h-5 w-5 text-primary-600" /><span><span className="block text-sm font-medium">Change password</span><span className="block text-xs text-muted">Signs out all other devices</span></span></Link>
              <Link to="/recruiter/notifications?tab=preferences" className="flex items-center gap-3 rounded-xl border border-border p-4 transition-colors hover:bg-surface-2"><Users className="h-5 w-5 text-primary-600" /><span><span className="block text-sm font-medium">Notification preferences</span><span className="block text-xs text-muted">Email & in-app alerts</span></span></Link>
            </div>
            <h4 className="mt-5 text-sm font-semibold">Active sessions</h4>
            {sessions.isPending ? <Skeleton className="mt-2 h-12" /> : (
              <ul className="mt-2 divide-y divide-border text-sm">
                {sessions.data?.map((s) => <li key={s.id} className="flex items-center justify-between py-2"><span className="truncate text-text-secondary">{s.userAgent?.slice(0, 60) ?? 'Unknown device'}{s.current && <Badge tone="success" className="ml-2">This device</Badge>}</span><span className="shrink-0 text-xs text-muted">{s.ip ?? ''} · {timeAgo(s.createdAt)}</span></li>)}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
