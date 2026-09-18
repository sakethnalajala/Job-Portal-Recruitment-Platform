import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, KeyRound, LogIn, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui';
import { DEMO_ACCOUNTS, SHOW_DEMO_ACCOUNTS } from '@/features/landing/demo-accounts.config';
import { toApiError } from '@/lib/api';
import { cn, dashboardPathFor } from '@/lib/utils';
import type { Role } from '@/types/api';
import { useAuth } from './AuthProvider';
import { authApi } from './auth.api';

/**
 * Shown on the login pages. Two actions: fill the form with the demo
 * credentials, or log in immediately through the real /auth endpoints.
 */
export function DemoLoginPanel({ role, onFill, className }: { role: Role; onFill: (email: string, password: string) => void; className?: string }) {
  const account = DEMO_ACCOUNTS.find((a) => a.role === role);
  const { setSession } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  if (!SHOW_DEMO_ACCOUNTS || !account) return null;

  const login = async () => {
    setBusy(true);
    try {
      const res = role === 'admin' ? await authApi.adminLogin({ email: account.email, password: account.password }) : await authApi.login({ email: account.email, password: account.password });
      setSession(res.data);
      toast.success(`Signed in as ${res.data.user.profile?.fullName ?? account.title}`);
      navigate(dashboardPathFor(res.data.user.role), { replace: true });
    } catch (err) {
      const e = toApiError(err);
      toast.error(e.code === 'INVALID_CREDENTIALS' ? 'Demo account not found — run `npm run seed:demo` on the server.' : e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby={`demo-${role}`} className={cn('rounded-2xl border border-dashed border-primary-300/70 bg-primary-50/50 p-4 dark:border-primary-800 dark:bg-primary-950/30', className)}>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-600 to-violet-600 text-white shadow-md"><Sparkles className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <h2 id={`demo-${role}`} className="text-sm font-semibold">{account.title}</h2>
          <p className="text-xs text-muted">Try the platform instantly — no signup needed. For testing only.</p>
          <dl className="mt-3 space-y-1 font-mono text-xs">
            <div className="flex items-center gap-2"><dt className="w-16 shrink-0 font-sans text-muted">Email</dt><dd className="truncate">{account.email}</dd></div>
            <div className="flex items-center gap-2">
              <dt className="w-16 shrink-0 font-sans text-muted">Password</dt>
              <dd>{show ? account.password : '•'.repeat(account.password.length)}</dd>
              <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} className="rounded p-1 text-muted hover:text-text">{show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</button>
            </div>
          </dl>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Button type="button" variant="outline" size="sm" leftIcon={<KeyRound className="h-4 w-4" />} onClick={() => onFill(account.email, account.password)}>Fill credentials</Button>
        <Button type="button" size="sm" className="btn-gradient" loading={busy} leftIcon={<LogIn className="h-4 w-4" />} onClick={() => void login()}>Use demo account</Button>
      </div>
    </section>
  );
}
