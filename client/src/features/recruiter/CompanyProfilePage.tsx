import { useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Camera, ExternalLink, Github, Globe, Linkedin, Mail, MapPin, Phone, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, Badge, Button, Card, ErrorState, Input, PageHeader, Select, Skeleton, Textarea } from '@/components/ui';
import { BackButton } from '@/components/ui/BackButton';
import { Section } from '@/components/ui/extras';
import { useAuth } from '@/features/auth/AuthProvider';
import { useServerError } from '@/features/auth/useAuthForm';
import { get, toApiError } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import type { CandidateProfile } from '@/features/candidate/candidate.api';
import { recruiterApi, type RecruiterProfile } from './recruiter.api';

const SIZES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'] as const;
const url = z.string().trim().url('Enter a valid URL').or(z.literal('')).optional();
const schema = z.object({
  fullName: z.string().trim().min(2).max(120),
  companyName: z.string().trim().min(2, 'At least 2 characters').max(150),
  companyDescription: z.string().trim().max(3000).optional(),
  industry: z.string().trim().max(100).optional(),
  website: url,
  companySize: z.enum(SIZES).or(z.literal('')).optional(),
  city: z.string().trim().max(100).optional(),
  country: z.string().trim().max(100).optional(),
  phone: z.string().trim().regex(/^[+\d][\d\s\-()]{6,19}$/, 'Enter a valid phone number').or(z.literal('')).optional(),
});
type FormValues = z.infer<typeof schema>;

const toForm = (p: RecruiterProfile): FormValues => ({ fullName: p.fullName, companyName: p.companyName, companyDescription: p.companyDescription ?? '', industry: p.industry ?? '', website: p.website ?? '', companySize: (p.companySize as FormValues['companySize']) ?? '', city: p.location?.city ?? '', country: p.location?.country ?? '', phone: p.phone ?? '' });

export function CompanyProfilePage({ embedded = false }: { embedded?: boolean }) {
  const qc = useQueryClient();
  const { refreshUser } = useAuth();
  const logoInput = useRef<HTMLInputElement>(null);
  const profile = useQuery({ queryKey: ['recruiter', 'profile'], queryFn: recruiterApi.profile, select: (r) => r.data.profile });
  const { formError, handle } = useServerError<FormValues>();
  const form = useForm<FormValues>({ resolver: zodResolver(schema) });
  useEffect(() => { if (profile.data) form.reset(toForm(profile.data)); }, [profile.data, form]);

  const invalidate = () => { void qc.invalidateQueries({ queryKey: ['recruiter'] }); void qc.invalidateQueries({ queryKey: ['jobs'] }); void refreshUser(); };
  const save = useMutation({
    mutationFn: (v: FormValues) => recruiterApi.updateProfile({ fullName: v.fullName, companyName: v.companyName, companyDescription: v.companyDescription || undefined, industry: v.industry || undefined, website: v.website || undefined, companySize: v.companySize || undefined, location: { city: v.city || undefined, country: v.country || undefined }, phone: v.phone || undefined }),
    onSuccess: () => { toast.success('Company profile saved'); invalidate(); },
    onError: (e) => handle(e, form.setError),
  });
  const upload = useMutation({ mutationFn: (f: File) => recruiterApi.uploadLogo(f), onSuccess: () => { toast.success('Logo updated on all your postings'); invalidate(); }, onError: (e) => toast.error(toApiError(e).message) });
  const removeLogo = useMutation({ mutationFn: recruiterApi.deleteLogo, onSuccess: invalidate, onError: (e) => toast.error(toApiError(e).message) });

  if (profile.isPending) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;
  if (profile.isError) return <ErrorState message={toApiError(profile.error).message} onRetry={() => void profile.refetch()} />;
  const p = profile.data;
  const e = form.formState.errors;

  return (
    <div>
      {!embedded && <BackButton fallback="/recruiter" className="mb-2" />}
      {!embedded && <PageHeader title="Company profile" description="Shown on every job posting and your public company page." actions={<Link to={`/companies/${p.id}`} target="_blank" rel="noreferrer"><Button variant="outline" leftIcon={<ExternalLink className="h-4 w-4" />}>View public page</Button></Link>} />}
      {embedded && <div className="mb-4 flex justify-end"><Link to={`/companies/${p.id}`} target="_blank" rel="noreferrer"><Button variant="outline" size="sm" leftIcon={<ExternalLink className="h-4 w-4" />}>View public page</Button></Link></div>}

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            <div className="flex items-center gap-4">
              <div className="relative">
                {p.logoUrl ? <img src={p.logoUrl} alt="" className="h-24 w-24 rounded-2xl object-cover bg-surface-2" /> : <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-950/60 dark:text-primary-300"><Building2 className="h-9 w-9" /></div>}
                <button type="button" onClick={() => logoInput.current?.click()} disabled={upload.isPending} className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary-600 text-white shadow-md hover:scale-105 active:scale-95" aria-label="Change logo">
                  {upload.isPending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Camera className="h-4 w-4" />}
                </button>
                <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(ev) => { const f = ev.target.files?.[0]; if (f) upload.mutate(f); ev.target.value = ''; }} />
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold">{p.companyName}</p>
                <p className="text-sm text-muted">{p.industry ?? 'Industry not set'}</p>
                {p.logoUrl && <button type="button" onClick={() => removeLogo.mutate()} className="mt-1 text-xs text-muted hover:text-danger">Remove logo</button>}
              </div>
            </div>
            <div className="mt-5 space-y-2 text-sm">
              {p.isVerified ? <Badge tone="success"><ShieldCheck className="h-3 w-3" />Verified company{p.verifiedAt ? ` · ${formatDate(p.verifiedAt)}` : ''}</Badge> : <Badge tone="warning">Verification pending</Badge>}
              <p className="text-muted">{p.openJobs ?? 0} open job{p.openJobs === 1 ? '' : 's'}</p>
              <p className="text-xs text-muted">Recruiter: {p.fullName} · {p.email}</p>
            </div>
          </Card>
        </aside>

        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-6" noValidate>
          {formError && <p role="alert" className="rounded-xl border border-danger/30 bg-danger-bg px-4 py-3 text-sm text-danger">{formError}</p>}
          <Section title="Company">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Company name" error={e.companyName?.message} {...form.register('companyName')} />
              <Input label="Industry" placeholder="SaaS, Fintech, Healthcare…" error={e.industry?.message} {...form.register('industry')} />
              <div className="sm:col-span-2"><Textarea label="About the company" rows={5} maxLength={3000} error={e.companyDescription?.message} {...form.register('companyDescription')} /></div>
              <Input label="Website" placeholder="https://" error={e.website?.message} {...form.register('website')} />
              <Select label="Company size" error={e.companySize?.message} {...form.register('companySize')}><option value="">Select…</option>{SIZES.map((s) => <option key={s} value={s}>{s} people</option>)}</Select>
              <Input label="City" error={e.city?.message} {...form.register('city')} />
              <Input label="Country" error={e.country?.message} {...form.register('country')} />
            </div>
          </Section>
          <Section title="Recruiter contact" description="Not shown publicly.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Your name" error={e.fullName?.message} {...form.register('fullName')} />
              <Input label="Phone" error={e.phone?.message} {...form.register('phone')} />
            </div>
          </Section>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => form.reset(toForm(p))} disabled={!form.formState.isDirty}>Discard</Button>
            <Button type="submit" loading={save.isPending} disabled={!form.formState.isDirty}>Save changes</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Read-only candidate profile for recruiters (only for candidates who applied to their jobs) and admins. */
export function CandidateProfileView() {
  const { id = '' } = useParams();
  const query = useQuery({ queryKey: ['candidates', id], queryFn: () => get<{ profile: CandidateProfile }>(`/candidates/${id}`), select: (r) => r.data.profile, enabled: Boolean(id) });
  if (query.isPending) return <div className="space-y-4"><Skeleton className="h-8 w-40" /><Skeleton className="h-64 w-full" /></div>;
  if (query.isError) { const err = toApiError(query.error); return <ErrorState title={err.status === 403 ? 'Not available' : undefined} message={err.status === 403 ? 'You can only view candidates who applied to one of your jobs.' : err.message} />; }
  const p = query.data;
  return (
    <div className="mx-auto max-w-4xl">
      <BackButton fallback="/recruiter/applicants" className="mb-2" />
      <Card className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <Avatar src={p.photoUrl} name={p.fullName} size="xl" />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold">{p.fullName}</h1>
            <p className="text-muted">{p.headline}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-secondary">
              {p.email && <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{p.email}</span>}
              {p.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{p.phone}</span>}
              {p.location?.city && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{p.location.city}{p.location.country ? `, ${p.location.country}` : ''}</span>}
            </div>
            <div className="mt-2 flex gap-2">
              {p.linkedinUrl && <a href={p.linkedinUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-border p-1.5 text-muted hover:text-primary-600" aria-label="LinkedIn"><Linkedin className="h-4 w-4" /></a>}
              {p.githubUrl && <a href={p.githubUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-border p-1.5 text-muted hover:text-primary-600" aria-label="GitHub"><Github className="h-4 w-4" /></a>}
              {p.portfolioUrl && <a href={p.portfolioUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-border p-1.5 text-muted hover:text-primary-600" aria-label="Portfolio"><Globe className="h-4 w-4" /></a>}
            </div>
          </div>
        </div>
        {p.bio && <p className="mt-5 whitespace-pre-line text-sm text-text-secondary">{p.bio}</p>}
        <div className="mt-5 flex flex-wrap gap-1.5">{p.skills.map((s) => <Badge key={s} tone="primary" className="capitalize">{s}</Badge>)}</div>
      </Card>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-semibold">Experience {p.totalExperienceYears !== undefined && <span className="text-sm font-normal text-muted">· {p.totalExperienceYears} yrs</span>}</h2>
          <ul className="mt-3 space-y-3 text-sm">{p.experience.length === 0 && <li className="text-muted">None listed.</li>}{p.experience.map((x, i) => <li key={i}><p className="font-medium">{x.title}</p><p className="text-text-secondary">{x.company} · {formatDate(x.startDate, { month: 'short', year: 'numeric' })} – {x.current ? 'Present' : formatDate(x.endDate, { month: 'short', year: 'numeric' })}</p>{x.description && <p className="mt-1 text-muted">{x.description}</p>}</li>)}</ul>
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">Education & certifications</h2>
          <ul className="mt-3 space-y-3 text-sm">{p.education.map((x, i) => <li key={i}><p className="font-medium">{x.degree}{x.field ? ` · ${x.field}` : ''}</p><p className="text-text-secondary">{x.institution} · {formatDate(x.startDate, { year: 'numeric' })} – {x.current ? 'Present' : formatDate(x.endDate, { year: 'numeric' })}{x.grade ? ` · ${x.grade}` : ''}</p></li>)}{p.certifications.map((c, i) => <li key={`c${i}`}><p className="font-medium">{c.name}</p><p className="text-text-secondary">{c.issuer}{c.issueDate ? ` · ${formatDate(c.issueDate, { month: 'short', year: 'numeric' })}` : ''}</p></li>)}{p.education.length + p.certifications.length === 0 && <li className="text-muted">None listed.</li>}</ul>
        </Card>
      </div>
    </div>
  );
}
