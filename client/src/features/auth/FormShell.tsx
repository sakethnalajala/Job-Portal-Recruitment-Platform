import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function FormShell({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
      <div className="mt-8">{children}</div>
      {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
    </div>
  );
}

export function AuthLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="font-medium text-primary-600 hover:underline dark:text-primary-400">
      {children}
    </Link>
  );
}

export function RoleSwitch({ current }: { current: 'candidate' | 'recruiter' }) {
  return (
    <div className="mb-6 grid grid-cols-2 rounded-xl border border-border bg-surface-2 p-1 text-sm font-medium" role="tablist" aria-label="Account type">
      {(['candidate', 'recruiter'] as const).map((r) => (
        <Link
          key={r}
          to={`/register/${r}`}
          role="tab"
          aria-selected={current === r}
          className={current === r ? 'rounded-lg bg-surface py-2 text-center text-text shadow-sm' : 'rounded-lg py-2 text-center text-muted hover:text-text'}
        >
          {r === 'candidate' ? "I'm looking for a job" : "I'm hiring"}
        </Link>
      ))}
    </div>
  );
}
