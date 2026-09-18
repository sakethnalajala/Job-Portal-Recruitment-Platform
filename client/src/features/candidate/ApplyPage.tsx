import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FileText, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, Badge, Button, Card, ErrorState, Input, PageHeader, Select, Skeleton, Textarea } from '@/components/ui';
import { BackButton } from '@/components/ui/BackButton';
import { useAuth } from '@/features/auth/AuthProvider';
import { jobKeys, jobsApi } from '@/features/jobs/jobs.api';
import { toApiError } from '@/lib/api';
import { formatDate, formatSalary } from '@/lib/utils';
import type { CustomQuestion } from '@/types/api';
import { candidateApi } from './candidate.api';

export function ApplyPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);

  const job = useQuery({ queryKey: jobKeys.detail(id), queryFn: () => jobsApi.detail(id), enabled: Boolean(id), select: (r) => r.data.job });
  const resumes = useQuery({ queryKey: ['candidate', 'resumes'], queryFn: candidateApi.resumes, select: (r) => r.data.resumes });

  const [resumeId, setResumeId] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [coverLetter, setCoverLetter] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const activeId = useMemo(() => resumes.data?.find((r) => r.isActive)?.id ?? resumes.data?.[0]?.id ?? '', [resumes.data]);
  const chosenResume = resumeId || activeId;

  const submit = useMutation({
    mutationFn: (fd: FormData) => candidateApi.apply(id, fd),
    onSuccess: (r) => {
      toast.success('Application submitted!');
      void qc.invalidateQueries({ queryKey: ['jobs'] });
      void qc.invalidateQueries({ queryKey: ['candidate'] });
      void qc.invalidateQueries({ queryKey: ['stats'] });
      navigate(`/candidate/applications/${r.data.application.id}`, { replace: true });
    },
    onError: (e) => {
      const err = toApiError(e);
      const next: Record<string, string> = {};
      for (const d of err.details) next[d.field.replace(/^body\./, '')] = d.message;
      setErrors(next);
      toast.error(err.details.length ? 'Please fix the highlighted answers' : err.message);
    },
  });

  const validate = (questions: CustomQuestion[]) => {
    const next: Record<string, string> = {};
    if (!file && !chosenResume) next.resume = 'Upload a resume or choose one from your profile';
    for (const q of questions) if (q.required && !answers[q.id]?.trim()) next[`answers.${q.id}`] = 'This question is required';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!job.data || !validate(job.data.customQuestions)) return;
    const fd = new FormData();
    if (file) fd.append('resume', file);
    else fd.append('resumeId', chosenResume);
    if (coverLetter.trim()) fd.append('coverLetter', coverLetter.trim());
    fd.append('answers', JSON.stringify(Object.entries(answers).filter(([, v]) => v.trim()).map(([questionId, answer]) => ({ questionId, answer: answer.trim() }))));
    submit.mutate(fd);
  };

  if (job.isPending || resumes.isPending) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;
  if (job.isError) return <ErrorState title="Job not found" message={toApiError(job.error).message} />;
  const j = job.data;
  const blocked = j.hasApplied ? 'You have already applied to this job.' : j.status !== 'open' ? 'This job is no longer accepting applications.' : j.isExpired ? 'The application deadline has passed.' : !user?.isEmailVerified ? 'Verify your email address before applying.' : null;

  return (
    <div className="mx-auto max-w-3xl">
      <BackButton fallback={`/jobs/${id}`} className="mb-2" />
      <PageHeader title={`Apply: ${j.title}`} description={`${j.companyName} · ${formatSalary(j.salary)}${j.deadline ? ` · Apply by ${formatDate(j.deadline)}` : ''}`} />

      {blocked ? (
        <Alert tone="warning" title={blocked} action={<Link to={j.hasApplied ? '/candidate/applications' : `/jobs/${id}`}><Button size="sm" variant="outline">{j.hasApplied ? 'View applications' : 'Back to job'}</Button></Link>} />
      ) : (
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <Card className="p-5">
            <h2 className="font-semibold">Resume</h2>
            <p className="text-sm text-muted">Choose one from your profile or upload a new PDF (max 5 MB).</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <Select label="From your profile" value={file ? '' : chosenResume} onChange={(e) => { setResumeId(e.target.value); setFile(null); }} disabled={Boolean(file)} error={errors.resume}>
                {resumes.data?.length === 0 && <option value="">No resumes on your profile</option>}
                {resumes.data?.map((r) => <option key={r.id} value={r.id}>{r.originalName}{r.isActive ? ' (active)' : ''}</option>)}
              </Select>
              <div>
                <Button type="button" variant={file ? 'primary' : 'outline'} leftIcon={file ? <CheckCircle2 className="h-4 w-4" /> : <Upload className="h-4 w-4" />} onClick={() => fileInput.current?.click()} className="w-full">{file ? 'PDF selected' : 'Upload new PDF'}</Button>
                <input ref={fileInput} type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { if (f.size > 5 * 1024 * 1024) { toast.error('PDF must be 5 MB or smaller'); return; } setFile(f); } e.target.value = ''; }} />
              </div>
            </div>
            {file && <p className="mt-2 flex items-center gap-2 text-sm"><FileText className="h-4 w-4 text-primary-600" />{file.name} <button type="button" className="text-xs text-muted hover:text-danger" onClick={() => setFile(null)}>remove</button></p>}
          </Card>

          <Card className="p-5">
            <Textarea label="Cover letter (optional)" hint={`${coverLetter.length}/5000`} rows={7} maxLength={5000} value={coverLetter} onChange={(e) => setCoverLetter(e.target.value)} placeholder={`Hello ${j.companyName} team,\n\nI'm excited to apply for the ${j.title} role because…`} />
          </Card>

          {j.customQuestions.length > 0 && (
            <Card className="p-5">
              <h2 className="font-semibold">Screening questions</h2>
              <p className="text-sm text-muted">Asked by {j.companyName}.</p>
              <div className="mt-4 space-y-4">
                {j.customQuestions.map((q) => {
                  const err = errors[`answers.${q.id}`];
                  const label = <>{q.question} {q.required ? <span className="text-danger">*</span> : <Badge className="ml-1">optional</Badge>}</>;
                  const common = { value: answers[q.id] ?? '', onChange: (e: { target: { value: string } }) => setAnswers((a) => ({ ...a, [q.id]: e.target.value })), error: err };
                  if (q.type === 'select') return <Select key={q.id} label={label} {...common}><option value="">Select…</option>{q.options.map((o) => <option key={o} value={o}>{o}</option>)}</Select>;
                  if (q.type === 'boolean') return <Select key={q.id} label={label} {...common}><option value="">Select…</option><option value="yes">Yes</option><option value="no">No</option></Select>;
                  if (q.type === 'textarea') return <Textarea key={q.id} label={label} rows={4} maxLength={2000} {...common} />;
                  return <Input key={q.id} label={label} maxLength={2000} {...common} />;
                })}
              </div>
            </Card>
          )}

          <div className="flex items-center justify-between rounded-2xl border border-border bg-surface p-4 shadow-card">
            <p className="text-sm text-muted">Applying as <span className="font-medium text-text">{user?.profile?.fullName}</span> · {user?.email}</p>
            <Button type="submit" size="lg" loading={submit.isPending} className="btn-gradient">Submit application</Button>
          </div>
        </form>
      )}
    </div>
  );
}
