import type { HTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Inbox, RefreshCw, Sun, Moon, CheckCircle2, ShieldCheck } from 'lucide-react';
import { cn, initials } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import { Button } from './Button';

export { Button } from './Button';
export { Input, Textarea, Select, Checkbox } from './Input';

// ─── Card ──────────────────────────────────────────────────────────────────
export function Card({ className, hover, ...props }: HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-surface shadow-card',
        hover && 'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover hover:border-primary-200 dark:hover:border-primary-900',
        className,
      )}
      {...props}
    />
  );
}

// ─── Badge ─────────────────────────────────────────────────────────────────
type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'violet';
const tones: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-text-secondary border-border',
  primary: 'bg-primary-50 text-primary-700 border-primary-100 dark:bg-primary-950/60 dark:text-primary-300 dark:border-primary-900',
  success: 'bg-success-bg text-success border-transparent',
  warning: 'bg-warning-bg text-warning border-transparent',
  danger: 'bg-danger-bg text-danger border-transparent',
  info: 'bg-info-bg text-info border-transparent',
  violet: 'bg-violet-50 text-violet-700 border-violet-100 dark:bg-violet-950/50 dark:text-violet-300 dark:border-violet-900',
};
export function Badge({ tone = 'neutral', className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', tones[tone], className)} {...props} />;
}

export const APPLICATION_TONE: Record<string, Tone> = {
  applied: 'info',
  under_review: 'primary',
  shortlisted: 'violet',
  interview: 'warning',
  selected: 'success',
  rejected: 'danger',
  withdrawn: 'neutral',
};
export const JOB_TONE: Record<string, Tone> = { draft: 'neutral', open: 'success', paused: 'warning', closed: 'neutral', removed: 'danger' };

// ─── Avatar ────────────────────────────────────────────────────────────────
export function Avatar({ src, name, size = 'md', className }: { src?: string | null; name?: string | null; size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  const s = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-14 w-14 text-lg', xl: 'h-24 w-24 text-2xl' }[size];
  return src ? (
    <img src={src} alt={name ?? ''} className={cn('rounded-full object-cover bg-surface-2', s, className)} />
  ) : (
    <div className={cn('flex items-center justify-center rounded-full bg-primary-100 font-semibold text-primary-700 dark:bg-primary-900/60 dark:text-primary-200', s, className)} aria-hidden>
      {initials(name)}
    </div>
  );
}

// ─── Skeleton ──────────────────────────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-surface-3', className)} aria-hidden />;
}

export function CardSkeleton() {
  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
      <div className="flex gap-2 pt-1">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
    </Card>
  );
}

// ─── States ────────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-strong px-6 py-14 text-center', className)}>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-muted">{icon ?? <Inbox className="h-6 w-6" />}</div>
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', message, onRetry, className }: { title?: string; message?: string; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center rounded-2xl border border-danger/30 bg-danger-bg/50 px-6 py-12 text-center', className)}>
      <AlertCircle className="mb-3 h-8 w-8 text-danger" />
      <h3 className="text-base font-semibold">{title}</h3>
      {message && <p className="mt-1 max-w-md text-sm text-muted">{message}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-5" onClick={onRetry} leftIcon={<RefreshCw className="h-4 w-4" />}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Alert({ tone = 'info', title, children, action, className }: { tone?: 'info' | 'success' | 'warning' | 'danger'; title?: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'warning' || tone === 'danger' ? AlertCircle : ShieldCheck;
  const color = { info: 'border-info/30 bg-info-bg text-info', success: 'border-success/30 bg-success-bg text-success', warning: 'border-warning/30 bg-warning-bg text-warning', danger: 'border-danger/30 bg-danger-bg text-danger' }[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center', color, className)}>
      <Icon className="h-5 w-5 shrink-0" />
      <div className="flex-1 text-sm text-text">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-text-secondary">{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <div className={cn('h-6 w-6 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600', className)} role="status" aria-label="Loading" />;
}

export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted">
      <Spinner className="h-8 w-8" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

// ─── Theme toggle ──────────────────────────────────────────────────────────
export function ThemeToggle({ className }: { className?: string }) {
  const { isDark, toggle } = useTheme();
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'} aria-pressed={isDark} className={className}>
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  );
}

// ─── Logo ──────────────────────────────────────────────────────────────────
export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <Link to="/" className={cn('inline-flex items-center gap-2 font-bold tracking-tight', className)} aria-label="TalentBridge home">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white shadow-sm">
        <svg viewBox="0 0 32 32" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 21V11h4.5a3 3 0 0 1 0 6H11m2 0 4 4M19 11h4M21 11v10" />
        </svg>
      </span>
      {!compact && (
        <span className="text-lg">
          Talent<span className="text-primary-600 dark:text-primary-400">Bridge</span>
        </span>
      )}
    </Link>
  );
}

// ─── Page header ───────────────────────────────────────────────────────────
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  );
}
