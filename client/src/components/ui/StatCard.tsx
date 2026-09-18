import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, Skeleton } from './index';

export function StatCard({ label, value, icon, to, hint, tone = 'primary', loading }: { label: string; value: ReactNode; icon: ReactNode; to?: string; hint?: string; tone?: 'primary' | 'success' | 'warning' | 'violet'; loading?: boolean }) {
  const toneCls = {
    primary: 'bg-primary-50 text-primary-600 dark:bg-primary-950/60 dark:text-primary-300',
    success: 'bg-success-bg text-success',
    warning: 'bg-warning-bg text-warning',
    violet: 'bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300',
  }[tone];
  const body = (
    <Card hover={Boolean(to)} className="flex items-start justify-between gap-3 p-5">
      <div className="min-w-0">
        <p className="text-sm text-muted">{label}</p>
        {loading ? <Skeleton className="mt-2 h-8 w-16" /> : <p className="mt-1 text-3xl font-bold tracking-tight">{value}</p>}
        {hint && <p className="mt-1 text-xs text-faint">{hint}</p>}
      </div>
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', toneCls)}>{icon}</div>
      {to && <ArrowUpRight className="absolute right-3 top-3 hidden h-4 w-4 text-faint" aria-hidden />}
    </Card>
  );
  return to ? <Link to={to} className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">{body}</Link> : body;
}
