import { useEffect, useRef, useState } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, CheckCircle2, Circle, Download, FileText, Plus, Star, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, Badge, Button, Checkbox, ErrorState, Input, PageHeader, Skeleton, Textarea } from '@/components/ui';
import { BackButton } from '@/components/ui/BackButton';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Section, TagInput } from '@/components/ui/extras';
import { useAuth } from '@/features/auth/AuthProvider';
import { useServerError } from '@/features/auth/useAuthForm';
import { toApiError } from '@/lib/api';
import { formatDate, LABELS } from '@/lib/utils';
import { candidateApi, type CandidateProfile } from './candidate.api';

// ─── schema (mirrors server validation) ────────────────────────────────────
const url = z.string().trim().url('Enter a valid URL').or(z.literal('')).optional();
const dateStr = z.string().min(1, 'Required');
const optDate = z.string().optional();
const dateRange = <T extends { startDate: string; endDate?: string | undefined; current?: boolean | undefined }>(v: T) => v.current || !v.endDate || v.endDate >= v.startDate;

const schema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name').max(120),
  phone: z.string().trim().regex(/^[+\d][\d\s\-()]{6,19}$/, 'Enter a valid phone number').or(z.literal('')).optional(),
  headline: z.string().trim().max(150).optional(),
  bio: z.string().trim().max(2000).optional(),
  city: z.string().trim().max(100).optional(),
  country: z.string().trim().max(100).optional(),
  skills: z.array(z.string()).max(50),
  totalExperienceYears: z.coerce.number().min(0).max(60),
  preferredWorkTypes: z.array(z.enum(['remote', 'hybrid', 'onsite'])),
  portfolioUrl: url,
  linkedinUrl: url,
  githubUrl: url,
  education: z.array(z.object({ institution: z.string().trim().min(2, 'Required'), degree: z.string().trim().min(1, 'Required'), field: z.string().optional(), startDate: dateStr, endDate: optDate, current: z.boolean().optional(), grade: z.string().optional() }).refine(dateRange, { path: ['endDate'], message: 'End date must be after start' })).max(20),
  experience: z.array(z.object({ company: z.string().trim().min(1, 'Required'), title: z.string().trim().min(1, 'Required'), startDate: dateStr, endDate: optDate, current: z.boolean().optional(), description: z.string().max(2000).optional() }).refine(dateRange, { path: ['endDate'], message: 'End date must be after start' })).max(20),
  certifications: z.array(z.object({ name: z.string().trim().min(1, 'Required'), issuer: z.string().optional(), issueDate: optDate, credentialUrl: url })).max(20),
});
type FormValues = z.infer<typeof schema>;

const toDateInput = (iso?: string) => (iso ? iso.slice(0, 10) : '');
const toForm = (p: CandidateProfile): FormValues => ({
  fullName: p.fullName, phone: p.phone ?? '', headline: p.headline ?? '', bio: p.bio ?? '', city: p.location?.city ?? '', country: p.location?.country ?? '',
  skills: p.skills, totalExperienceYears: p.totalExperienceYears ?? 0, preferredWorkTypes: p.preferredWorkTypes ?? [],
  portfolioUrl: p.portfolioUrl ?? '', linkedinUrl: p.linkedinUrl ?? '', githubUrl: p.githubUrl ?? '',
  education: p.education.map((e) => ({ institution: e.institution, degree: e.degree, field: e.field ?? '', startDate: toDateInput(e.startDate), endDate: toDateInput(e.endDate), current: e.current ?? false, grade: e.grade ?? '' })),
  experience: p.experience.map((e) => ({ company: e.company, title: e.title, startDate: toDateInput(e.startDate), endDate: toDateInput(e.endDate), current: e.current ?? false, description: e.description ?? '' })),
  certifications: p.certifications.map((c) => ({ name: c.name, issuer: c.issuer ?? '', issueDate: toDateInput(c.issueDate), credentialUrl: c.credentialUrl ?? '' })),
});
const toPayload = (v: FormValues) => ({
  fullName: v.fullName, phone: v.phone || undefined, headline: v.headline || undefined, bio: v.bio || undefined,
  location: { city: v.city || undefined, country: v.country || undefined },
  skills: v.skills, totalExperienceYears: v.totalExperienceYears, preferredWorkTypes: v.preferredWorkTypes,
  portfolioUrl: v.portfolioUrl || undefined, linkedinUrl: v.linkedinUrl || undefined, githubUrl: v.githubUrl || undefined,
  education: v.education.map((e) => ({ ...e, field: e.field || undefined, grade: e.grade || undefined, endDate: e.current ? undefined : e.endDate || undefined })),
  experience: v.experience.map((e) => ({ ...e, description: e.description || undefined, endDate: e.current ? undefined : e.endDate || undefined })),
  certifications: v.certifications.map((c) => ({ ...c, issuer: c.issuer || undefined, issueDate: c.issueDate || undefined, credentialUrl: c.credentialUrl || undefined })),
});

export function ProfilePage() {
  const qc = useQueryClient();
  const { refreshUser } = useAuth();
  const profile = useQuery({ queryKey: ['candidate', 'profile'], queryFn: candidateApi.me, select: (r) => r.data.profile });
  const { formError, handle } = useServerError<FormValues>();
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { skills: [], education: [], experience: [], certifications: [], preferredWorkTypes: [], totalExperienceYears: 0 } });
  const edu = useFieldArray({ control: form.control, name: 'education' });
  const exp = useFieldArray({ control: form.control, name: 'experience' });
  const cert = useFieldArray({ control: form.control, name: 'certifications' });

  useEffect(() => { if (profile.data) form.reset(toForm(profile.data)); }, [profile.data, form]);

  const save = useMutation({
    mutationFn: (v: FormValues) => candidateApi.update(toPayload(v)),
    onSuccess: (r) => { toast.success(`Profile saved · ${r.data.profile.completion}% complete`); qc.setQueryData(['candidate', 'profile'], r); void qc.invalidateQueries({ queryKey: ['stats'] }); void refreshUser(); },
    onError: (e) => handle(e, form.setError),
  });

  if (profile.isPending) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-40 w-full" /><Skeleton className="h-64 w-full" /></div>;
  if (profile.isError) return <ErrorState message={toApiError(profile.error).message} onRetry={() => void profile.refetch()} />;
  const p = profile.data;
  const e = form.formState.errors;

  return (
    <div>
      <BackButton fallback="/candidate" className="mb-2" />
      <PageHeader title="Profile & resume" description="Recruiters see this when you apply. A complete profile ranks higher in recommendations." />

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <PhotoCard profile={p} />
          <ResumeCard />
        </aside>

        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-6" noValidate>
          {formError && <p role="alert" className="rounded-xl border border-danger/30 bg-danger-bg px-4 py-3 text-sm text-danger">{formError}</p>}

          <Section title="Basics" description="Name, headline and how recruiters can reach you.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Full name" error={e.fullName?.message} {...form.register('fullName')} />
              <Input label="Phone" placeholder="+91 98765 43210" error={e.phone?.message} {...form.register('phone')} />
              <div className="sm:col-span-2"><Input label="Headline" placeholder="Backend Engineer · Node.js & TypeScript" error={e.headline?.message} {...form.register('headline')} /></div>
              <div className="sm:col-span-2"><Textarea label="About you" hint="50+ characters counts towards profile completion" rows={4} error={e.bio?.message} {...form.register('bio')} /></div>
              <Input label="City" placeholder="Bengaluru" error={e.city?.message} {...form.register('city')} />
              <Input label="Country" placeholder="India" error={e.country?.message} {...form.register('country')} />
            </div>
          </Section>

          <Section title="Skills & preferences" description="Skills drive your job recommendations.">
            <div className="space-y-4">
              <Controller control={form.control} name="skills" render={({ field }) => <TagInput label="Skills" value={field.value} onChange={field.onChange} placeholder="react, node.js, mongodb…" error={e.skills?.message} hint="Press Enter or comma to add. At least 3 recommended." />} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Total experience (years)" type="number" min={0} max={60} step={0.5} error={e.totalExperienceYears?.message} {...form.register('totalExperienceYears')} />
                <div>
                  <p className="mb-1.5 block text-sm font-medium text-text-secondary">Preferred work type</p>
                  <div className="flex flex-wrap gap-4">{(['remote', 'hybrid', 'onsite'] as const).map((w) => <Checkbox key={w} label={LABELS.workType[w]} value={w} {...form.register('preferredWorkTypes')} />)}</div>
                </div>
              </div>
            </div>
          </Section>

          <Section title="Links">
            <div className="grid gap-4 sm:grid-cols-3">
              <Input label="LinkedIn" placeholder="https://linkedin.com/in/…" error={e.linkedinUrl?.message} {...form.register('linkedinUrl')} />
              <Input label="GitHub" placeholder="https://github.com/…" error={e.githubUrl?.message} {...form.register('githubUrl')} />
              <Input label="Portfolio" placeholder="https://…" error={e.portfolioUrl?.message} {...form.register('portfolioUrl')} />
            </div>
          </Section>

          <Section title="Experience" actions={<Button type="button" variant="outline" size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => exp.append({ company: '', title: '', startDate: '', endDate: '', current: false, description: '' })}>Add role</Button>}>
            {exp.fields.length === 0 && <p className="text-sm text-muted">No experience added yet.</p>}
            <div className="space-y-4">
              {exp.fields.map((f, i) => (
                <div key={f.id} className="relative rounded-xl border border-border p-4">
                  <button type="button" onClick={() => exp.remove(i)} className="absolute right-3 top-3 rounded-lg p-1.5 text-muted hover:bg-danger-bg hover:text-danger" aria-label="Remove role"><Trash2 className="h-4 w-4" /></button>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input label="Job title" error={e.experience?.[i]?.title?.message} {...form.register(`experience.${i}.title`)} />
                    <Input label="Company" error={e.experience?.[i]?.company?.message} {...form.register(`experience.${i}.company`)} />
                    <Input label="Start date" type="date" error={e.experience?.[i]?.startDate?.message} {...form.register(`experience.${i}.startDate`)} />
                    <div className="space-y-2">
                      <Input label="End date" type="date" disabled={form.watch(`experience.${i}.current`)} error={e.experience?.[i]?.endDate?.message} {...form.register(`experience.${i}.endDate`)} />
                      <Checkbox label="I currently work here" {...form.register(`experience.${i}.current`)} />
                    </div>
                    <div className="sm:col-span-2"><Textarea label="What did you do?" rows={3} {...form.register(`experience.${i}.description`)} /></div>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Education" actions={<Button type="button" variant="outline" size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => edu.append({ institution: '', degree: '', field: '', startDate: '', endDate: '', current: false, grade: '' })}>Add education</Button>}>
            {edu.fields.length === 0 && <p className="text-sm text-muted">No education added yet.</p>}
            <div className="space-y-4">
              {edu.fields.map((f, i) => (
                <div key={f.id} className="relative rounded-xl border border-border p-4">
                  <button type="button" onClick={() => edu.remove(i)} className="absolute right-3 top-3 rounded-lg p-1.5 text-muted hover:bg-danger-bg hover:text-danger" aria-label="Remove education"><Trash2 className="h-4 w-4" /></button>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input label="Institution" error={e.education?.[i]?.institution?.message} {...form.register(`education.${i}.institution`)} />
                    <Input label="Degree" placeholder="B.Tech" error={e.education?.[i]?.degree?.message} {...form.register(`education.${i}.degree`)} />
                    <Input label="Field of study" placeholder="Computer Science" {...form.register(`education.${i}.field`)} />
                    <Input label="Grade" placeholder="8.7 CGPA" {...form.register(`education.${i}.grade`)} />
                    <Input label="Start date" type="date" error={e.education?.[i]?.startDate?.message} {...form.register(`education.${i}.startDate`)} />
                    <div className="space-y-2">
                      <Input label="End date" type="date" disabled={form.watch(`education.${i}.current`)} error={e.education?.[i]?.endDate?.message} {...form.register(`education.${i}.endDate`)} />
                      <Checkbox label="Currently studying" {...form.register(`education.${i}.current`)} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Certifications" actions={<Button type="button" variant="outline" size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => cert.append({ name: '', issuer: '', issueDate: '', credentialUrl: '' })}>Add certification</Button>}>
            {cert.fields.length === 0 && <p className="text-sm text-muted">No certifications yet.</p>}
            <div className="space-y-4">
              {cert.fields.map((f, i) => (
                <div key={f.id} className="relative rounded-xl border border-border p-4">
                  <button type="button" onClick={() => cert.remove(i)} className="absolute right-3 top-3 rounded-lg p-1.5 text-muted hover:bg-danger-bg hover:text-danger" aria-label="Remove certification"><Trash2 className="h-4 w-4" /></button>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input label="Name" error={e.certifications?.[i]?.name?.message} {...form.register(`certifications.${i}.name`)} />
                    <Input label="Issuer" {...form.register(`certifications.${i}.issuer`)} />
                    <Input label="Issue date" type="date" {...form.register(`certifications.${i}.issueDate`)} />
                    <Input label="Credential URL" error={e.certifications?.[i]?.credentialUrl?.message} {...form.register(`certifications.${i}.credentialUrl`)} />
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <div className="sticky bottom-4 z-10 flex justify-end gap-2 rounded-2xl border border-border bg-surface/90 p-3 shadow-card backdrop-blur">
            <Button type="button" variant="outline" onClick={() => form.reset(toForm(p))} disabled={!form.formState.isDirty}>Discard changes</Button>
            <Button type="submit" loading={save.isPending} disabled={!form.formState.isDirty}>Save profile</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PhotoCard({ profile }: { profile: CandidateProfile }) {
  const qc = useQueryClient();
  const { refreshUser } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const upload = useMutation({ mutationFn: (f: File) => candidateApi.uploadPhoto(f), onSuccess: () => { toast.success('Photo updated'); void qc.invalidateQueries({ queryKey: ['candidate', 'profile'] }); void refreshUser(); }, onError: (e) => toast.error(toApiError(e).message) });
  const remove = useMutation({ mutationFn: candidateApi.deletePhoto, onSuccess: () => { void qc.invalidateQueries({ queryKey: ['candidate', 'profile'] }); void refreshUser(); }, onError: (e) => toast.error(toApiError(e).message) });
  const pct = profile.completion;
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <div className="flex items-center gap-4">
        <div className="relative">
          <Avatar src={profile.photoUrl} name={profile.fullName} size="xl" />
          <button type="button" onClick={() => input.current?.click()} disabled={upload.isPending} className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary-600 text-white shadow-md transition-transform hover:scale-105 active:scale-95" aria-label="Change photo">
            {upload.isPending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Camera className="h-4 w-4" />}
          </button>
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ''; }} />
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold">{profile.fullName}</p>
          <p className="truncate text-sm text-muted">{profile.headline || 'Add a headline'}</p>
          {profile.photoUrl && <button type="button" onClick={() => remove.mutate()} className="mt-1 text-xs text-muted hover:text-danger">Remove photo</button>}
        </div>
      </div>
      <div className="mt-5">
        <div className="mb-1 flex items-center justify-between text-xs"><span className="text-muted">Profile strength</span><span className="font-semibold">{pct}%</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-gradient-to-r from-primary-600 to-violet-600 transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted">{pct >= 90 ? 'Excellent — recruiters see a complete profile.' : pct >= 60 ? 'Good. Add a resume, links and 3+ skills to reach 100%.' : 'Fill in your basics, skills, experience and upload a resume.'}</p>
      </div>
      <CompletionChecklist profile={profile} />
    </div>
  );
}

/** Mirrors the server's completion checks so the candidate sees exactly what is missing. */
function CompletionChecklist({ profile: p }: { profile: CandidateProfile }) {
  const items: { label: string; done: boolean }[] = [
    { label: 'Full name', done: Boolean(p.fullName) },
    { label: 'Phone number', done: Boolean(p.phone) },
    { label: 'Headline', done: Boolean(p.headline) },
    { label: 'About you (50+ characters)', done: Boolean(p.bio && p.bio.length >= 50) },
    { label: 'City', done: Boolean(p.location?.city) },
    { label: 'Profile photo', done: Boolean(p.photoUrl) },
    { label: 'At least 3 skills', done: p.skills.length >= 3 },
    { label: 'Education', done: p.education.length > 0 },
    { label: 'Work experience', done: p.experience.length > 0 },
    { label: 'Active resume', done: Boolean(p.activeResume) },
    { label: 'LinkedIn, GitHub or portfolio link', done: Boolean(p.linkedinUrl || p.githubUrl || p.portfolioUrl) },
  ];
  const missing = items.filter((i) => !i.done);
  if (missing.length === 0) return null;
  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-faint">To complete ({missing.length} left)</p>
      <ul className="mt-2 space-y-1.5 text-sm">
        {items.map((i) => (
          <li key={i.label} className={`flex items-center gap-2 ${i.done ? 'text-muted line-through decoration-border-strong' : 'text-text-secondary'}`}>
            {i.done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> : <Circle className="h-4 w-4 shrink-0 text-faint" />}{i.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ResumeCard({ compact = false }: { compact?: boolean }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const resumes = useQuery({ queryKey: ['candidate', 'resumes'], queryFn: candidateApi.resumes, select: (r) => r.data.resumes });
  const invalidate = () => { void qc.invalidateQueries({ queryKey: ['candidate'] }); void qc.invalidateQueries({ queryKey: ['stats'] }); };
  const upload = useMutation({ mutationFn: (f: File) => candidateApi.uploadResume(f, true), onSuccess: () => { toast.success('Resume uploaded and set as active'); invalidate(); }, onError: (e) => toast.error(toApiError(e).message) });
  const activate = useMutation({ mutationFn: candidateApi.activateResume, onSuccess: () => { toast.success('Active resume updated'); invalidate(); }, onError: (e) => toast.error(toApiError(e).message) });
  const remove = useMutation({ mutationFn: candidateApi.deleteResume, onSuccess: () => { toast.success('Resume deleted'); setConfirm(null); invalidate(); }, onError: (e) => toast.error(toApiError(e).message) });
  const download = async (id: string) => {
    try {
      const r = await candidateApi.resumeDownload(id);
      if (r.data.resume.downloadUrl) window.open(r.data.resume.downloadUrl, '_blank', 'noopener');
      else toast.info('File storage is not configured on this server, so the download link is unavailable.');
    } catch (e) { toast.error(toApiError(e).message); }
  };
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">Resumes</h3>
        <Button size="sm" variant="outline" leftIcon={<Upload className="h-4 w-4" />} loading={upload.isPending} onClick={() => input.current?.click()}>Upload PDF</Button>
        <input ref={input} type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ''; }} />
      </div>
      {resumes.isPending ? <Skeleton className="h-16 w-full" /> : resumes.isError ? <p className="text-sm text-danger">{toApiError(resumes.error).message}</p> : resumes.data.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong p-4 text-center text-sm text-muted"><FileText className="mx-auto mb-1 h-6 w-6" />No resume yet. PDF up to 5 MB.</div>
      ) : (
        <ul className="space-y-2">
          {resumes.data.map((r) => (
            <li key={r.id} className={`flex items-center gap-3 rounded-xl border p-3 text-sm ${r.isActive ? 'border-primary-300 bg-primary-50/50 dark:border-primary-800 dark:bg-primary-950/30' : 'border-border'}`}>
              <FileText className="h-5 w-5 shrink-0 text-primary-600" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{r.originalName}</p>
                <p className="text-xs text-muted">{(r.size / 1024).toFixed(0)} KB · {formatDate(r.uploadedAt)} {r.isActive && <Badge tone="primary" className="ml-1"><Star className="h-3 w-3" />Active</Badge>}</p>
              </div>
              {!compact && (
                <div className="flex shrink-0 gap-0.5">
                  {!r.isActive && <Button variant="ghost" size="sm" onClick={() => activate.mutate(r.id)}>Set active</Button>}
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Download" onClick={() => void download(r.id)}><Download className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted hover:text-danger" aria-label="Delete resume" onClick={() => setConfirm(r.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog open={Boolean(confirm)} onClose={() => setConfirm(null)} onConfirm={() => confirm && remove.mutate(confirm)} loading={remove.isPending} tone="danger" title="Delete this resume?" description="If it was used in an application, recruiters keep access to that copy." confirmLabel="Delete" />
    </div>
  );
}
