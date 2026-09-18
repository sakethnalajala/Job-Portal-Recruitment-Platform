import { useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Search, SlidersHorizontal, X } from 'lucide-react';
import { Button, CardSkeleton, EmptyState, ErrorState, Input, Select } from '@/components/ui';
import { toApiError } from '@/lib/api';
import { cn, LABELS } from '@/lib/utils';
import { JobCard } from '../JobCard';
import { jobKeys, jobsApi, type JobSearchParams } from '../jobs.api';

const WORK_TYPES = ['remote', 'hybrid', 'onsite'] as const;
const EMPLOYMENT = ['full-time', 'part-time', 'internship', 'contract'] as const;
const LEVELS = ['entry', 'junior', 'mid', 'senior', 'lead'] as const;

/** URL search params are the single source of truth so searches are shareable. */
function useSearchState() {
  const [params, setParams] = useSearchParams();
  const state: JobSearchParams = useMemo(
    () => ({
      q: params.get('q') ?? undefined,
      location: params.get('location') ?? undefined,
      workType: params.get('workType')?.split(',').filter(Boolean),
      employmentType: params.get('employmentType')?.split(',').filter(Boolean),
      experienceLevel: params.get('experienceLevel')?.split(',').filter(Boolean),
      sort: (params.get('sort') as JobSearchParams['sort']) ?? 'relevance',
      page: Number(params.get('page') ?? 1),
      limit: 12,
    }),
    [params],
  );
  const update = (patch: Partial<Record<keyof JobSearchParams, string | string[] | number | undefined>>, resetPage = true) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      const val = Array.isArray(v) ? v.join(',') : v === undefined ? '' : String(v);
      if (val) next.set(k, val);
      else next.delete(k);
    }
    if (resetPage) next.delete('page');
    setParams(next);
  };
  return { state, update, clear: () => setParams({}) };
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={cn('rounded-full border px-3 py-1.5 text-sm transition-colors', active ? 'border-primary-600 bg-primary-600 text-white' : 'border-border bg-surface text-text-secondary hover:border-border-strong hover:text-text')}>
      {children}
    </button>
  );
}

function toggle(list: string[] | undefined, value: string) {
  const set = new Set(list ?? []);
  set.has(value) ? set.delete(value) : set.add(value);
  return [...set];
}

export function JobsPage({ embedded = false }: { embedded?: boolean }) {
  const { state, update, clear } = useSearchState();
  const [q, setQ] = useState(state.q ?? '');
  const [loc, setLoc] = useState(state.location ?? '');
  const [showFilters, setShowFilters] = useState(false);

  const query = useQuery({
    queryKey: jobKeys.search(state),
    queryFn: () => jobsApi.search(state),
    placeholderData: keepPreviousData,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    update({ q: q.trim(), location: loc.trim() });
  };

  const activeFilters = (state.workType?.length ?? 0) + (state.employmentType?.length ?? 0) + (state.experienceLevel?.length ?? 0);
  const meta = query.data?.meta;

  return (
    <div className={embedded ? 'relative' : 'relative mx-auto max-w-7xl px-4 py-8 sm:px-6'}>
      {!embedded && <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-mesh opacity-60" aria-hidden />}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Find your next role</h1>
        <p className="mt-1 text-sm text-muted">Search open positions across India's top tech teams.</p>
      </div>

      <form onSubmit={submit} className="grid gap-3 rounded-2xl border border-border bg-surface p-3 shadow-card sm:grid-cols-[1fr_1fr_auto]" role="search">
        <Input placeholder="Job title, skill or company" leftIcon={<Search className="h-4 w-4" />} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Keyword" />
        <Input placeholder="City or country" value={loc} onChange={(e) => setLoc(e.target.value)} aria-label="Location" />
        <div className="flex gap-2">
          <Button type="submit" size="lg" className="flex-1 sm:h-11">Search</Button>
          <Button type="button" variant="outline" size="lg" className="sm:h-11" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters} leftIcon={<SlidersHorizontal className="h-4 w-4" />}>
            Filters{activeFilters ? ` (${activeFilters})` : ''}
          </Button>
        </div>
      </form>

      {showFilters && (
        <div className="mt-3 space-y-4 rounded-2xl border border-border bg-surface p-4 animate-fade-in">
          {(
            [
              ['Work type', 'workType', WORK_TYPES, LABELS.workType],
              ['Employment', 'employmentType', EMPLOYMENT, LABELS.employmentType],
              ['Experience', 'experienceLevel', LEVELS, LABELS.experienceLevel],
            ] as const
          ).map(([label, key, values, labels]) => (
            <div key={key}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">{label}</p>
              <div className="flex flex-wrap gap-2">
                {values.map((v) => (
                  <Chip key={v} active={Boolean(state[key]?.includes(v))} onClick={() => update({ [key]: toggle(state[key], v) })}>
                    {(labels as Record<string, string>)[v]}
                  </Chip>
                ))}
              </div>
            </div>
          ))}
          {activeFilters > 0 && (
            <Button variant="link" size="sm" onClick={() => update({ workType: [], employmentType: [], experienceLevel: [] })} leftIcon={<X className="h-4 w-4" />}>
              Clear filters
            </Button>
          )}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted" aria-live="polite">
          {query.isPending ? 'Searching…' : meta ? `${meta.total} ${meta.total === 1 ? 'job' : 'jobs'} found` : ''}
          {state.q && (
            <>
              {' '}for <span className="font-medium text-text">“{state.q}”</span>
            </>
          )}
        </p>
        <div className="w-44">
          <Select aria-label="Sort" value={state.sort} onChange={(e) => update({ sort: e.target.value }, false)}>
            <option value="relevance">Most relevant</option>
            <option value="newest">Newest</option>
            <option value="salary_desc">Highest salary</option>
            <option value="deadline">Closing soon</option>
          </Select>
        </div>
      </div>

      <div className="mt-4">
        {query.isPending ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}</div>
        ) : query.isError ? (
          <ErrorState message={toApiError(query.error).message} onRetry={() => void query.refetch()} />
        ) : query.data.data.jobs.length === 0 ? (
          <EmptyState title="No jobs match your search" description="Try different keywords, remove a filter or widen the location." action={<Button variant="outline" onClick={() => { setQ(''); setLoc(''); clear(); }}>Reset search</Button>} />
        ) : (
          <div className={cn('grid gap-4 md:grid-cols-2 xl:grid-cols-3', query.isFetching && 'opacity-70 transition-opacity')}>
            {query.data.data.jobs.map((job) => <JobCard key={job.id} job={job} />)}
          </div>
        )}
      </div>

      {meta && meta.totalPages > 1 && (
        <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Pagination">
          <Button variant="outline" size="sm" disabled={meta.page <= 1} onClick={() => update({ page: meta.page - 1 }, false)} leftIcon={<ChevronLeft className="h-4 w-4" />}>Previous</Button>
          <span className="px-3 text-sm text-muted">Page {meta.page} of {meta.totalPages}</span>
          <Button variant="outline" size="sm" disabled={meta.page >= meta.totalPages} onClick={() => update({ page: meta.page + 1 }, false)} rightIcon={<ChevronRight className="h-4 w-4" />}>Next</Button>
        </nav>
      )}
    </div>
  );
}
