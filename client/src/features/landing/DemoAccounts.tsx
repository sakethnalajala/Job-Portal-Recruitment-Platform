import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, Copy, Eye, EyeOff, LogIn, ShieldAlert, ShieldCheck, UserRound, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/features/auth/AuthProvider';
import { authApi } from '@/features/auth/auth.api';
import { toApiError } from '@/lib/api';
import { cn, dashboardPathFor } from '@/lib/utils';
import { copyText } from '@/components/ui/extras';
import { DEMO_ACCOUNTS, SHOW_DEMO_ACCOUNTS, type DemoAccount } from './demo-accounts.config';

const ICONS = { candidate: UserRound, recruiter: Building2, admin: ShieldCheck } as const;
const ACCENT = {
  candidate: 'from-primary-600 to-sky-500',
  recruiter: 'from-indigo-600 to-violet-600',
  admin: 'from-slate-700 to-slate-900 dark:from-slate-500 dark:to-slate-700',
} as const;

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await copyText(value);
        if (ok) { setDone(true); setTimeout(() => setDone(false), 1500); toast.success(`${label} copied`); }
        else toast.error('Copy failed — select the text manually');
      }}
      aria-label={`Copy ${label.toLowerCase()}`}
      className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-text active:scale-95"
    >
      {done ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

function DemoCard({ account, index, busy, onLogin }: { account: DemoAccount; index: number; busy: boolean; onLogin: () => void }) {
  const [show, setShow] = useState(false);
  const Icon = ICONS[account.role];
  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.35, delay: index * 0.08 }}
      className="glass-card group relative flex flex-col overflow-hidden rounded-2xl p-6 transition-transform duration-200 hover:-translate-y-1"
    >
      <div className={cn('absolute inset-x-0 top-0 h-1 bg-gradient-to-r', ACCENT[account.role])} aria-hidden />
      <div className="flex items-center gap-3">
        <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md', ACCENT[account.role])}><Icon className="h-5 w-5" /></div>
        <div>
          <h3 className="font-semibold">{account.title}</h3>
          <p className="text-xs uppercase tracking-wider text-muted">{account.role} · demo</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted">{account.description}</p>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {account.highlights.map((h) => <li key={h} className="rounded-full border border-border bg-surface/60 px-2 py-0.5 text-[11px] text-text-secondary">{h}</li>)}
      </ul>

      <dl className="mt-5 space-y-2 text-sm">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface/70 px-3 py-2">
          <dt className="w-16 shrink-0 text-xs text-muted">Email</dt>
          <dd className="min-w-0 flex-1 truncate font-mono text-xs sm:text-sm" title={account.email}>{account.email}</dd>
          <CopyButton value={account.email} label="Email" />
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface/70 px-3 py-2">
          <dt className="w-16 shrink-0 text-xs text-muted">Password</dt>
          <dd className="min-w-0 flex-1 font-mono text-xs sm:text-sm" aria-live="polite">{show ? account.password : '•'.repeat(account.password.length)}</dd>
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-text active:scale-95">
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
          <CopyButton value={account.password} label="Password" />
        </div>
      </dl>

      <button
        type="button"
        onClick={onLogin}
        disabled={busy}
        className={cn('btn-gradient mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70')}
      >
        {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden /> : <LogIn className="h-4 w-4" />}
        {busy ? 'Signing in…' : `Login as ${account.role}`}
      </button>
    </motion.article>
  );
}

export function DemoAccounts() {
  const { status, user, setSession, logout } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  if (!SHOW_DEMO_ACCOUNTS) return null;

  const login = async (account: DemoAccount) => {
    setBusy(account.email);
    try {
      if (status === 'authenticated' && user?.email !== account.email) await logout();
      const res = account.role === 'admin' ? await authApi.adminLogin({ email: account.email, password: account.password }) : await authApi.login({ email: account.email, password: account.password });
      setSession(res.data);
      toast.success(`Signed in as ${res.data.user.profile?.fullName ?? account.title}`);
      navigate(dashboardPathFor(res.data.user.role));
    } catch (err) {
      const e = toApiError(err);
      toast.error(e.code === 'INVALID_CREDENTIALS' ? 'Demo account not found — run `npm run seed:demo` on the server.' : e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section id="demo" className="relative mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6" aria-labelledby="demo-heading">
      <div className="mb-8 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning-bg px-3 py-1 text-xs font-medium text-warning"><ShieldAlert className="h-3.5 w-3.5" /> Demo credentials are for testing purposes only.</span>
        <h2 id="demo-heading" className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">Explore every role in one click</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted">Sandbox accounts with realistic data. Copy the credentials or jump straight into a dashboard.</p>
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        {DEMO_ACCOUNTS.map((a, i) => <DemoCard key={a.email} account={a} index={i} busy={busy === a.email} onLogin={() => void login(a)} />)}
      </div>
    </section>
  );
}
