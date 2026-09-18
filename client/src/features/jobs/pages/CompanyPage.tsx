import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Building2, Globe, MapPin, ShieldCheck, Users } from 'lucide-react';
import { Badge, Card, CardSkeleton, ErrorState, Skeleton } from '@/components/ui';
import { BackButton } from '@/components/ui/BackButton';
import { get, toApiError } from '@/lib/api';
import type { CompanyCard } from '@/types/api';
import { JobCard } from '../JobCard';
import { jobsApi } from '../jobs.api';

export function CompanyPage() {
  const { id = '' } = useParams();
  const company = useQuery({ queryKey: ['companies', id], queryFn: () => get<{ company: CompanyCard }>(`/recruiters/${id}`), select: (r) => r.data.company, enabled: Boolean(id) });
  const jobs = useQuery({
    queryKey: ['jobs', 'company', company.data?.companyName],
    queryFn: () => jobsApi.search({ company: company.data!.companyName, limit: 12, sort: 'newest' }),
    enabled: Boolean(company.data?.companyName),
  });

  if (company.isPending) {
    return <div className="mx-auto max-w-5xl space-y-4 px-4 py-8 sm:px-6"><Skeleton className="h-28 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }
  if (company.isError) {
    const err = toApiError(company.error);
    return <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6"><ErrorState title={err.status === 404 ? 'Company not found' : undefined} message={err.message} /></div>;
  }
  const c = company.data;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <BackButton fallback="/jobs" className="mb-4" />
      <Card className="p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          {c.logoUrl ? <img src={c.logoUrl} alt="" className="h-20 w-20 rounded-2xl object-cover bg-surface-2" /> : <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-950/60 dark:text-primary-300"><Building2 className="h-8 w-8" /></div>}
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-2xl font-bold">{c.companyName} {c.isVerified && <ShieldCheck className="h-5 w-5 text-primary-600 dark:text-primary-400" aria-label="Verified" />}</h1>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
              {c.industry && <span>{c.industry}</span>}
              {c.location?.city && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{c.location.city}{c.location.country ? `, ${c.location.country}` : ''}</span>}
              {c.companySize && <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{c.companySize} employees</span>}
              {c.website && <a href={c.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary-600 hover:underline dark:text-primary-400"><Globe className="h-3.5 w-3.5" />Website</a>}
            </div>
            {c.companyDescription && <p className="mt-4 whitespace-pre-line text-sm text-text-secondary">{c.companyDescription}</p>}
          </div>
          <Badge tone="success">{c.openJobs ?? 0} open {c.openJobs === 1 ? 'job' : 'jobs'}</Badge>
        </div>
      </Card>

      <h2 className="mb-4 mt-8 text-lg font-semibold">Open positions</h2>
      {jobs.isPending ? (
        <div className="grid gap-4 md:grid-cols-2">{Array.from({ length: 2 }).map((_, i) => <CardSkeleton key={i} />)}</div>
      ) : jobs.isError || jobs.data.data.jobs.length === 0 ? (
        <p className="text-sm text-muted">No open positions right now. <Link to="/jobs" className="text-primary-600 hover:underline">Browse other jobs</Link>.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">{jobs.data.data.jobs.map((j) => <JobCard key={j.id} job={j} />)}</div>
      )}
    </div>
  );
}
