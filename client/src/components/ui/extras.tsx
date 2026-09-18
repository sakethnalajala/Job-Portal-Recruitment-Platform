import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── TagInput (skills, benefits, responsibilities) ─────────────────────────
export function TagInput({ label, value, onChange, placeholder = 'Type and press Enter', max = 50, error, hint, lowercase = true }: {
  label?: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string; max?: number; error?: string | undefined; hint?: string; lowercase?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const id = useId();
  const add = (raw: string) => {
    const items = raw.split(',').map((s) => (lowercase ? s.trim().toLowerCase() : s.trim())).filter(Boolean);
    if (!items.length) return;
    const next = [...new Set([...value, ...items])].slice(0, max);
    onChange(next);
    setDraft('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(draft); }
    else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
  };
  return (
    <div className="space-y-1.5">
      {label && <label htmlFor={id} className="block text-sm font-medium text-text-secondary">{label}</label>}
      <div className={cn('flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border bg-surface px-2 py-1.5 focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-500/40', error ? 'border-danger' : 'border-border')}>
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700 dark:bg-primary-950/60 dark:text-primary-300">
            {t}
            <button type="button" onClick={() => onChange(value.filter((v) => v !== t))} aria-label={`Remove ${t}`} className="rounded-full hover:bg-primary-100 dark:hover:bg-primary-900"><X className="h-3 w-3" /></button>
          </span>
        ))}
        <input id={id} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} onBlur={() => draft && add(draft)} placeholder={value.length ? '' : placeholder} className="min-w-[120px] flex-1 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-faint" aria-invalid={error ? true : undefined} />
      </div>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

// ─── Dropdown menu (profile menu, row actions) ─────────────────────────────
export function Dropdown({ trigger, children, align = 'right', className }: { trigger: (props: { open: boolean; toggle: () => void }) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right'; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div ref={ref} className={cn('relative', className)}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={{ duration: 0.14 }}
            className={cn('absolute z-50 mt-2 min-w-[200px] overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-xl', align === 'right' ? 'right-0' : 'left-0')} role="menu">
            {children(() => setOpen(false))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function MenuItem({ icon, children, onClick, to, tone = 'default' }: { icon?: ReactNode; children: ReactNode; onClick?: () => void; to?: string; tone?: 'default' | 'danger' }) {
  const cls = cn('flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors', tone === 'danger' ? 'text-danger hover:bg-danger-bg' : 'text-text-secondary hover:bg-surface-2 hover:text-text');
  return to ? <Link to={to} onClick={onClick} className={cls} role="menuitem">{icon}{children}</Link> : <button type="button" onClick={onClick} className={cls} role="menuitem">{icon}{children}</button>;
}

// ─── Breadcrumbs derived from the current path ─────────────────────────────
const LABELS: Record<string, string> = {
  candidate: 'Candidate', recruiter: 'Recruiter', admin: 'Admin', jobs: 'Jobs', new: 'New', edit: 'Edit', applicants: 'Applicants', applications: 'Applications', saved: 'Saved jobs', profile: 'Profile', users: 'Users', reports: 'Reports', 'audit-logs': 'Audit log', notifications: 'Notifications', settings: 'Settings', apply: 'Apply',
};
export function Breadcrumbs({ className }: { className?: string }) {
  const { pathname } = useLocation();
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length <= 1) return null;
  const crumbs = parts.map((p, i) => ({ path: '/' + parts.slice(0, i + 1).join('/'), label: LABELS[p] ?? (/^[a-f0-9]{24}$/i.test(p) ? 'Details' : p) }));
  return (
    <nav aria-label="Breadcrumb" className={cn('hidden items-center gap-1 text-sm text-muted md:flex', className)}>
      {crumbs.map((c, i) => (
        <span key={c.path} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-faint" />}
          {i === crumbs.length - 1 ? <span className="font-medium text-text" aria-current="page">{c.label}</span> : <Link to={c.path} className="hover:text-text">{c.label}</Link>}
        </span>
      ))}
    </nav>
  );
}

// ─── Page transition wrapper ───────────────────────────────────────────────
export function PageTransition({ children, keyId }: { children: ReactNode; keyId: string }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={keyId} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2, ease: 'easeOut' }}>
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Section card with header ──────────────────────────────────────────────
export function Section({ title, description, actions, children, className }: { title: string; description?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border border-border bg-surface shadow-card', className)}>
      <div className="flex flex-col gap-2 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

// ─── Copy button ───────────────────────────────────────────────────────────
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
