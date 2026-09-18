import { useEffect } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, Button, Checkbox, ErrorState, Input, PageHeader, Select, Skeleton, Textarea } from '@/components/ui';
import { BackButton } from '@/components/ui/BackButton';
import { Section, TagInput } from '@/components/ui/extras';
import { useAuth } from '@/features/auth/AuthProvider';
import { useServerError } from '@/features/auth/useAuthForm';
import { toApiError } from '@/lib/api';
import { LABELS } from '@/lib/utils';
import type { JobDetail } from '@/types/api';
import { recruiterApi } from './recruiter.api';

const num = (min: number, max: number) => z.preprocess((v) => (v === '' || v === null || v === undefined ? undefined : Number(v)), z.number().int().min(min).max(max).optional());
const schema = z.object({
  title: z.string().trim().min(3, 'At least 3 characters').max(150),
  description: z.string().trim().min(50, 'At least 50 characters — describe the role properly').max(10000),
  responsibilities: z.array(z.string()).max(30),
  requiredSkills: z.array(z.string()).min(1, 'Add at least one required skill').max(50),
  preferredSkills: z.array(z.string()).max(50),
  city: z.string().trim().max(100).optional(),
  country: z.string().trim().max(100).optional(),
  workType: z.enum(['remote', 'hybrid', 'onsite']),
  employmentType: z.enum(['full-time', 'part-time', 'internship', 'contract']),
  experienceLevel: z.enum(['entry', 'junior', 'mid', 'senior', 'lead']),
  salaryMin: num(0, 1e9),
  salaryMax: num(0, 1e9),
  salaryPeriod: z.enum(['year', 'month']),
  salaryVisible: z.boolean(),
  yearsMin: num(0, 60),
  yearsMax: num(0, 60),
  educationRequirement: z.string().trim().max(300).optional(),
  benefits: z.array(z.string()).max(20),
  openings: z.coerce.number().int().min(1).max(1000),
  deadline: z.string().optional(),
  customQuestions: z.array(z.object({ question: z.string().trim().min(5, 'At least 5 characters').max(300), type: z.enum(['text', 'textarea', 'boolean', 'select']), options: z.string().optional(), required: z.boolean() }).refine((q) => q.type !== 'select' || (q.options ?? '').split(',').map((s) => s.trim()).filter(Boolean).length >= 2, { path: ['options'], message: 'Give at least 2 comma-separated options' })).max(10),
}).refine((v) => v.salaryMin === undefined || v.salaryMax === undefined || v.salaryMax >= v.salaryMin, { path: ['salaryMax'], message: 'Max must be ≥ min' })
  .refine((v) => v.yearsMin === undefined || v.yearsMax === undefined || v.yearsMax >= v.yearsMin, { path: ['yearsMax'], message: 'Max must be ≥ min' })
  .refine((v) => !v.deadline || new Date(v.deadline).getTime() > Date.now(), { path: ['deadline'], message: 'Deadline must be in the future' });
type FormValues = z.infer<typeof schema>;

const defaults: FormValues = { title: '', description: '', responsibilities: [], requiredSkills: [], preferredSkills: [], city: '', country: 'India', workType: 'hybrid', employmentType: 'full-time', experienceLevel: 'mid', salaryPeriod: 'year', salaryVisible: true, benefits: [], openings: 1, deadline: '', customQuestions: [], educationRequirement: '' };

const fromJob = (j: JobDetail): FormValues => ({
  title: j.title, description: j.description, responsibilities: j.responsibilities, requiredSkills: j.requiredSkills, preferredSkills: j.preferredSkills,
  city: j.location?.city ?? '', country: j.location?.country ?? '', workType: j.workType, employmentType: j.employmentType, experienceLevel: j.experienceLevel,
  salaryMin: j.salary?.min, salaryMax: j.salary?.max, salaryPeriod: j.salary?.period ?? 'year', salaryVisible: j.salary?.isVisible !== false,
  yearsMin: j.experienceYears?.min, yearsMax: j.experienceYears?.max, educationRequirement: j.educationRequirement ?? '', benefits: j.benefits, openings: j.openings,
  deadline: j.deadline ? j.deadline.slice(0, 10) : '',
  customQuestions: j.customQuestions.map((q) => ({ question: q.question, type: q.type, options: q.options.join(', '), required: q.required })),
});

const toPayload = (v: FormValues) => ({
  title: v.title, description: v.description, responsibilities: v.responsibilities, requiredSkills: v.requiredSkills, preferredSkills: v.preferredSkills,
  location: { city: v.city || undefined, country: v.country || undefined }, workType: v.workType, employmentType: v.employmentType, experienceLevel: v.experienceLevel,
  salary: { min: v.salaryMin, max: v.salaryMax, currency: 'INR', period: v.salaryPeriod, isVisible: v.salaryVisible },
  experienceYears: { min: v.yearsMin, max: v.yearsMax }, educationRequirement: v.educationRequirement || undefined, benefits: v.benefits, openings: v.openings,
  deadline: v.deadline ? new Date(`${v.deadline}T23:59:59`).toISOString() : null,
  customQuestions: v.customQuestions.map((q) => ({ question: q.question, type: q.type, required: q.required, options: q.type === 'select' ? (q.options ?? '').split(',').map((s) => s.trim()).filter(Boolean) : [] })),
});

export function JobFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const existing = useQuery({ queryKey: ['recruiter', 'job', id], queryFn: () => recruiterApi.job(id!), enabled: editing, select: (r) => r.data.job });
  const { formError, handle } = useServerError<FormValues>();
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults });
  const questions = useFieldArray({ control: form.control, name: 'customQuestions' });
  useEffect(() => { if (existing.data) form.reset(fromJob(existing.data)); }, [existing.data, form]);

  const save = useMutation({
    mutationFn: ({ values, status }: { values: FormValues; status: 'draft' | 'open' }) => {
      const payload = toPayload(values);
      if (editing) {
        const { deadline, ...rest } = payload;
        return recruiterApi.updateJob(id!, { ...rest, deadline: deadline ?? null });
      }
      return recruiterApi.createJob({ ...payload, deadline: payload.deadline ?? undefined, status });
    },
    onSuccess: (r, v) => {
      toast.success(editing ? 'Job updated' : v.status === 'open' ? 'Job published' : 'Draft saved');
      void qc.invalidateQueries({ queryKey: ['recruiter'] }); void qc.invalidateQueries({ queryKey: ['jobs'] }); void qc.invalidateQueries({ queryKey: ['stats'] });
      navigate(`/recruiter/jobs/${r.data.job.id}/applicants`, { replace: true });
    },
    onError: (e) => { const err = handle(e, form.setError); if (err.code === 'EMAIL_NOT_VERIFIED') toast.error(err.message); },
  });

  if (editing && existing.isPending) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-96 w-full" /></div>;
  if (editing && existing.isError) return <ErrorState message={toApiError(existing.error).message} />;
  const e = form.formState.errors;
  const canPublish = user?.isEmailVerified;

  return (
    <div className="mx-auto max-w-4xl">
      <BackButton fallback="/recruiter/jobs" className="mb-2" />
      <PageHeader title={editing ? 'Edit job posting' : 'Post a new job'} description={editing ? `Editing “${existing.data?.title}”` : 'Publish now or save as a draft and finish later.'} />
      {!canPublish && !editing && <Alert tone="warning" title="Verify your email to publish" className="mb-5">You can save drafts now; publishing is enabled once your email is verified.</Alert>}
      {formError && <Alert tone="danger" className="mb-5">{formError}</Alert>}

      <form className="space-y-6" noValidate onSubmit={(ev) => ev.preventDefault()}>
        <Section title="Role" description="What the job is and where it is based.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Input label="Job title" placeholder="Senior Backend Engineer (Node.js)" error={e.title?.message} {...form.register('title')} /></div>
            <div className="sm:col-span-2"><Textarea label="Description" rows={8} hint="Markdown is not rendered; plain paragraphs work best." error={e.description?.message} {...form.register('description')} /></div>
            <Controller control={form.control} name="responsibilities" render={({ field }) => <div className="sm:col-span-2"><TagInput label="Key responsibilities" value={field.value} onChange={field.onChange} lowercase={false} placeholder="Design REST APIs (Enter to add)" /></div>} />
            <Input label="City" placeholder="Bengaluru" {...form.register('city')} />
            <Input label="Country" {...form.register('country')} />
            <Select label="Work type" {...form.register('workType')}>{(['remote', 'hybrid', 'onsite'] as const).map((w) => <option key={w} value={w}>{LABELS.workType[w]}</option>)}</Select>
            <Select label="Employment type" {...form.register('employmentType')}>{(['full-time', 'part-time', 'internship', 'contract'] as const).map((t) => <option key={t} value={t}>{LABELS.employmentType[t]}</option>)}</Select>
          </div>
        </Section>

        <Section title="Requirements" description="Required skills power search and candidate matching.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Controller control={form.control} name="requiredSkills" render={({ field }) => <div className="sm:col-span-2"><TagInput label="Required skills" value={field.value} onChange={field.onChange} error={e.requiredSkills?.message} placeholder="node.js, typescript…" /></div>} />
            <Controller control={form.control} name="preferredSkills" render={({ field }) => <div className="sm:col-span-2"><TagInput label="Nice-to-have skills" value={field.value} onChange={field.onChange} placeholder="kubernetes, grpc…" /></div>} />
            <Select label="Experience level" {...form.register('experienceLevel')}>{(['entry', 'junior', 'mid', 'senior', 'lead'] as const).map((l) => <option key={l} value={l}>{LABELS.experienceLevel[l]}</option>)}</Select>
            <div className="grid grid-cols-2 gap-3"><Input label="Min years" type="number" min={0} error={e.yearsMin?.message} {...form.register('yearsMin')} /><Input label="Max years" type="number" min={0} error={e.yearsMax?.message} {...form.register('yearsMax')} /></div>
            <div className="sm:col-span-2"><Input label="Education requirement" placeholder="Bachelor's degree in CS/IT or equivalent" {...form.register('educationRequirement')} /></div>
          </div>
        </Section>

        <Section title="Compensation & logistics">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Salary min (INR)" type="number" min={0} error={e.salaryMin?.message} {...form.register('salaryMin')} />
            <Input label="Salary max (INR)" type="number" min={0} error={e.salaryMax?.message} {...form.register('salaryMax')} />
            <Select label="Salary period" {...form.register('salaryPeriod')}><option value="year">Per year</option><option value="month">Per month</option></Select>
            <div className="flex items-end pb-3"><Checkbox label="Show salary on the public listing" {...form.register('salaryVisible')} /></div>
            <Controller control={form.control} name="benefits" render={({ field }) => <div className="sm:col-span-2"><TagInput label="Benefits" value={field.value} onChange={field.onChange} lowercase={false} placeholder="Health insurance, ESOPs…" /></div>} />
            <Input label="Openings" type="number" min={1} error={e.openings?.message} {...form.register('openings')} />
            <Input label="Application deadline" type="date" error={e.deadline?.message} hint="Leave empty for no deadline" {...form.register('deadline')} />
          </div>
        </Section>

        <Section title="Screening questions" description="Up to 10. Candidates answer these when applying." actions={<Button type="button" variant="outline" size="sm" leftIcon={<Plus className="h-4 w-4" />} disabled={questions.fields.length >= 10} onClick={() => questions.append({ question: '', type: 'text', options: '', required: true })}>Add question</Button>}>
          {questions.fields.length === 0 && <p className="text-sm text-muted">No screening questions.</p>}
          <div className="space-y-4">
            {questions.fields.map((f, i) => {
              const type = form.watch(`customQuestions.${i}.type`);
              return (
                <div key={f.id} className="relative rounded-xl border border-border p-4">
                  <button type="button" onClick={() => questions.remove(i)} className="absolute right-3 top-3 rounded-lg p-1.5 text-muted hover:bg-danger-bg hover:text-danger" aria-label="Remove question"><Trash2 className="h-4 w-4" /></button>
                  <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
                    <Input label={`Question ${i + 1}`} error={e.customQuestions?.[i]?.question?.message} {...form.register(`customQuestions.${i}.question`)} />
                    <Select label="Answer type" {...form.register(`customQuestions.${i}.type`)}><option value="text">Short text</option><option value="textarea">Paragraph</option><option value="boolean">Yes / No</option><option value="select">Choice</option></Select>
                    {type === 'select' && <div className="sm:col-span-2"><Input label="Options (comma separated)" placeholder="Immediate, 15 days, 30 days" error={e.customQuestions?.[i]?.options?.message} {...form.register(`customQuestions.${i}.options`)} /></div>}
                    <Checkbox label="Required" {...form.register(`customQuestions.${i}.required`)} />
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        <div className="sticky bottom-4 z-10 flex flex-wrap justify-end gap-2 rounded-2xl border border-border bg-surface/90 p-3 shadow-card backdrop-blur">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
          {editing ? (
            <Button type="button" loading={save.isPending} onClick={form.handleSubmit((values) => save.mutate({ values, status: 'open' }))}>Save changes</Button>
          ) : (
            <>
              <Button type="button" variant="secondary" loading={save.isPending && save.variables?.status === 'draft'} onClick={form.handleSubmit((values) => save.mutate({ values, status: 'draft' }))}>Save draft</Button>
              <Button type="button" className="btn-gradient" loading={save.isPending && save.variables?.status === 'open'} disabled={!canPublish} onClick={form.handleSubmit((values) => save.mutate({ values, status: 'open' }))}>Publish job</Button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
