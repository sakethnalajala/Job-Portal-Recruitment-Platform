import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PaginationMeta } from '@/types/api';
import { Button } from './Button';
import { EmptyState, ErrorState, Skeleton } from './index';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  /** Hide below this breakpoint to keep tables readable on phones. */
  hideBelow?: 'sm' | 'md' | 'lg';
}

const hide = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' };

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty?: { title: string; description?: string; action?: ReactNode };
  onRowClick?: (row: T) => void;
  skeletonRows?: number;
  caption?: string;
}

export function DataTable<T>({ columns, rows, rowKey, loading, error, onRetry, empty, onRowClick, skeletonRows = 6, caption }: DataTableProps<T>) {
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (!loading && rows && rows.length === 0) return <EmptyState title={empty?.title ?? 'Nothing here yet'} description={empty?.description} action={empty?.action} />;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="bg-surface-2/70 text-left text-xs font-semibold uppercase tracking-wider text-muted">
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cn('px-4 py-3 font-semibold', c.hideBelow && hide[c.hideBelow], c.className)}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading || !rows
              ? Array.from({ length: skeletonRows }).map((_, i) => (
                  <tr key={i}>
                    {columns.map((c) => (
                      <td key={c.key} className={cn('px-4 py-3.5', c.hideBelow && hide[c.hideBelow])}><Skeleton className="h-4 w-full max-w-[160px]" /></td>
                    ))}
                  </tr>
                ))
              : rows.map((row) => (
                  <tr
                    key={rowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn('row-hover', onRowClick && 'cursor-pointer')}
                    tabIndex={onRowClick ? 0 : undefined}
                    onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(row); } : undefined}
                  >
                    {columns.map((c) => (
                      <td key={c.key} className={cn('px-4 py-3 align-middle', c.hideBelow && hide[c.hideBelow], c.className)}>{c.cell(row)}</td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Pagination({ meta, onPage, className }: { meta: PaginationMeta | undefined; onPage: (page: number) => void; className?: string }) {
  if (!meta || meta.totalPages <= 1) return null;
  const start = (meta.page - 1) * meta.limit + 1;
  const end = Math.min(meta.page * meta.limit, meta.total);
  return (
    <nav className={cn('flex flex-col items-center justify-between gap-3 sm:flex-row', className)} aria-label="Pagination">
      <p className="text-sm text-muted">Showing <span className="font-medium text-text">{start}–{end}</span> of {meta.total}</p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)} leftIcon={<ChevronLeft className="h-4 w-4" />}>Previous</Button>
        <span className="px-2 text-sm text-muted">{meta.page} / {meta.totalPages}</span>
        <Button variant="outline" size="sm" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)} rightIcon={<ChevronRight className="h-4 w-4" />}>Next</Button>
      </div>
    </nav>
  );
}

/** Horizontal filter pills (status tabs etc.). */
export function FilterPills<V extends string>({ value, options, onChange, counts, allLabel = 'All' }: { value: V | ''; options: { value: V; label: string }[]; onChange: (v: V | '') => void; counts?: Partial<Record<V | 'all', number>>; allLabel?: string }) {
  const pill = (active: boolean) =>
    cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap', active ? 'border-primary-600 bg-primary-600 text-white shadow-sm' : 'border-border bg-surface text-text-secondary hover:border-border-strong hover:text-text');
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin" role="tablist">
      <button role="tab" aria-selected={value === ''} className={pill(value === '')} onClick={() => onChange('')}>
        {allLabel}{counts?.all !== undefined && <span className="rounded-full bg-black/10 px-1.5 text-xs dark:bg-white/10">{counts.all}</span>}
      </button>
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={pill(value === o.value)} onClick={() => onChange(o.value)}>
          {o.label}{counts?.[o.value] !== undefined && <span className="rounded-full bg-black/10 px-1.5 text-xs dark:bg-white/10">{counts[o.value]}</span>}
        </button>
      ))}
    </div>
  );
}
