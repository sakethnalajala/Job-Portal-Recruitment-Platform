import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bookmark, BriefcaseBusiness, Building2, Clock, IndianRupee, MapPin, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Card, APPLICATION_TONE } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { toApiError } from '@/lib/api';
import { cn, formatSalary, LABELS, timeAgo } from '@/lib/utils';
import type { JobCard as JobCardType } from '@/types/api';
import { jobsApi } from './jobs.api';

function CompanyMark({ job, size = 'md' }: { job: JobCardType; size?: 'sm' | 'md' }) {
  const s = size === 'sm' ? 'h-9 w-9 rounded-lg' : 'h-12 w-12 rounded-xl';
  return job.companyLogoUrl ? (
    <img src={job.companyLogoUrl} alt="" className={cn(s, 'shrink-0 object-cover bg-surface-2')} />
  ) : (
    <div className={cn(s, 'flex shrink-0 items-center justify-center bg-primary-50 text-primary-600 dark:bg-primary-950/60 dark:text-primary-300')} aria-hidden>
      <Building2 className="h-5 w-5" />
    </div>
  );
}

export function SaveButton({ job, className }: { job: JobCardType; className?: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const saved = Boolean(job.isSaved);
  const mutation = useMutation({
    mutationFn: () => (saved ? jobsApi.unsave(job.id) : jobsApi.save(job.id)),
    onSuccess: () => {
      toast.success(saved ? 'Removed from saved jobs' : 'Job saved');
      void qc.invalidateQueries({ queryKey: ['jobs'] });
      void qc.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (e) => toast.error(toApiError(e).message),
  });
  if (!user || user.role !== 'candidate') return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        mutation.mutate();
      }}
      disabled={mutation.isPending}
      aria-pressed={saved}
      aria-label={saved ? 'Unsave job' : 'Save job'}
      className={cn('rounded-lg p-2 transition-colors hover:bg-surface-2', saved ? 'text-primary-600 dark:text-primary-400' : 'text-muted hover:text-text', className)}
    >
      <Bookmark className={cn('h-5 w-5', saved && 'fill-current')} />
    </button>
  );
}

export function JobCard({ job, compact = false }: { job: JobCardType; compact?: boolean }) {
  const { user } = useAuth();
  const href = user?.role === 'candidate' ? `/candidate/jobs/${job.id}` : `/jobs/${job.id}`;
  const loc = [job.location?.city, job.workType === 'remote' ? null : job.location?.country].filter(Boolean).join(', ') || 'India';
  return (
    <Card hover className="group relative">
      <Link to={href} className="block p-5 focus-visible:outline-none" aria-label={`${job.title} at ${job.companyName}`}>
        <div className="flex items-start gap-3.5">
          <CompanyMark job={job} size={compact ? 'sm' : 'md'} />
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-1 font-semibold leading-snug text-text group-hover:text-primary-600 dark:group-hover:text-primary-400">{job.title}</h3>
            <p className="mt-0.5 flex items-center gap-1 text-sm text-muted">
              <span className="truncate">{job.companyName}</span>
              {job.companyVerified && <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary-600 dark:text-primary-400" aria-label="Verified company" />}
            </p>
          </div>
          <div className="absolute right-3 top-3">
            <SaveButton job={job} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-text-secondary">
          <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-muted" />{loc}</span>
          <span className="inline-flex items-center gap-1"><BriefcaseBusiness className="h-3.5 w-3.5 text-muted" />{LABELS.experienceLevel[job.experienceLevel]}</span>
          <span className="inline-flex items-center gap-1"><IndianRupee className="h-3.5 w-3.5 text-muted" />{formatSalary(job.salary)}</span>
        </div>

        {!compact && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {job.requiredSkills.slice(0, 5).map((s) => (
              <Badge key={s} tone={job.matchedSkills?.includes(s) ? 'primary' : 'neutral'} className="capitalize">{s}</Badge>
            ))}
            {job.requiredSkills.length > 5 && <Badge>+{job.requiredSkills.length - 5}</Badge>}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs text-muted">
          <Badge tone={job.workType === 'remote' ? 'success' : 'neutral'}>{LABELS.workType[job.workType]}</Badge>
          <Badge>{LABELS.employmentType[job.employmentType]}</Badge>
          {job.hasApplied && job.applicationStatus && <Badge tone={APPLICATION_TONE[job.applicationStatus] ?? 'info'}>{LABELS.applicationStatus[job.applicationStatus]}</Badge>}
          {job.matchedSkills && job.matchedSkills.length > 0 && (
            <Badge tone="violet"><Sparkles className="h-3 w-3" />{job.matchedSkills.length} skill match</Badge>
          )}
          {job.isExpired && <Badge tone="danger">Expired</Badge>}
          <span className="ml-auto inline-flex items-center gap-1"><Clock className="h-3 w-3" />{timeAgo(job.publishedAt ?? job.createdAt)}</span>
        </div>
      </Link>
    </Card>
  );
}
