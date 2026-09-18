import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Menu, X, LayoutDashboard, LogOut, Search, UserRound, Building2, ShieldCheck, type LucideProps } from 'lucide-react';
import type { ComponentType } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { Avatar, Button, Logo, ThemeToggle } from '@/components/ui';
import { AnnouncementBanner } from '@/features/platform/AnnouncementBanner';
import { cn, dashboardPathFor } from '@/lib/utils';

const navLinks: { to: string; label: string; icon: ComponentType<LucideProps> }[] = [
  { to: '/jobs', label: 'Find jobs', icon: Search },
  { to: '/for-candidates', label: 'For Candidates', icon: UserRound },
  { to: '/for-recruiters', label: 'For Recruiters', icon: Building2 },
  { to: '/admin/login', label: 'Admin', icon: ShieldCheck },
];

/** Desktop nav: a shared-layout pill glides between the hovered/active item; the active item also gets a gradient underline. */
function DesktopNav() {
  const { pathname } = useLocation();
  const reduce = useReducedMotion();
  const [hovered, setHovered] = useState<string | null>(null);
  const isActive = (to: string) => (to === '/jobs' ? pathname === '/jobs' || pathname.startsWith('/jobs/') : pathname.startsWith(to));
  const highlighted = hovered ?? navLinks.find((l) => isActive(l.to))?.to ?? null;
  return (
    <nav className="hidden items-center gap-0.5 md:flex" aria-label="Main" onMouseLeave={() => setHovered(null)}>
      {navLinks.map((l) => {
        const active = isActive(l.to);
        return (
          <NavLink
            key={l.to}
            to={l.to}
            onMouseEnter={() => setHovered(l.to)}
            onFocus={() => setHovered(l.to)}
            onBlur={() => setHovered(null)}
            className={cn('group relative rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500', active ? 'text-primary-600 dark:text-primary-400' : 'text-text-secondary hover:text-text')}
          >
            {highlighted === l.to && (
              <motion.span
                layoutId="public-nav-pill"
                className="absolute inset-0 -z-10 rounded-lg bg-surface-2 dark:bg-white/[0.06]"
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 450, damping: 34 }}
                aria-hidden
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              <l.icon className={cn('h-4 w-4 transition-all duration-200', active ? 'opacity-100' : 'opacity-60 group-hover:opacity-100 group-hover:-translate-y-px')} aria-hidden />
              {l.label}
            </span>
            {active && (
              <motion.span
                layoutId="public-nav-underline"
                className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-gradient-to-r from-primary-600 to-violet-600"
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 36 }}
                aria-hidden
              />
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}

export function PublicNavbar() {
  const { status, user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border glass">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Logo />
          <DesktopNav />
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle />
          {status === 'authenticated' && user ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => void logout()} leftIcon={<LogOut className="h-4 w-4" />}>
                Log out
              </Button>
              <Link to={dashboardPathFor(user.role)} className="flex items-center gap-2 rounded-xl border border-border py-1.5 pl-1.5 pr-3 text-sm font-medium hover:bg-surface-2">
                <Avatar src={user.profile?.photoUrl} name={user.profile?.fullName} size="sm" />
                Dashboard
              </Link>
            </>
          ) : (
            <>
              <Link to="/login" className="rounded-xl px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-2 hover:text-text">
                Log in
              </Link>
              <Link to="/register/candidate">
                <Button size="sm">Get started</Button>
              </Link>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <Button variant="ghost" size="icon" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      <AnimatePresence initial={false}>
      {open && (
        <motion.div key="mobile-nav" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden border-t border-border bg-surface md:hidden">
          <nav className="flex flex-col gap-1 px-4 py-3" aria-label="Mobile">
            {navLinks.map((l, i) => (
              <motion.div key={l.to} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.04 * i, duration: 0.2 }}>
                <NavLink to={l.to} onClick={() => setOpen(false)} className={({ isActive }) => cn('flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors', isActive ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/60 dark:text-primary-300' : 'hover:bg-surface-2')}>
                  <l.icon className="h-4 w-4" aria-hidden />{l.label}
                </NavLink>
              </motion.div>
            ))}
            <div className="my-2 border-t border-border" />
            {status === 'authenticated' && user ? (
              <>
                <Link to={dashboardPathFor(user.role)} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-surface-2">
                  <LayoutDashboard className="h-4 w-4" /> Dashboard
                </Link>
                <button onClick={() => void logout()} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-danger hover:bg-surface-2">
                  <LogOut className="h-4 w-4" /> Log out
                </button>
              </>
            ) : (
              <div className="flex gap-2 pt-1">
                <Link to="/login" className="flex-1" onClick={() => setOpen(false)}>
                  <Button variant="outline" className="w-full">Log in</Button>
                </Link>
                <Link to="/register/candidate" className="flex-1" onClick={() => setOpen(false)}>
                  <Button className="w-full">Get started</Button>
                </Link>
              </div>
            )}
          </nav>
        </motion.div>
      )}
      </AnimatePresence>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-muted">Connecting India's tech talent with companies that ship. Search, apply and track — all in one place.</p>
        </div>
        <div>
          <h4 className="text-sm font-semibold">Candidates</h4>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li><Link to="/jobs" className="hover:text-text">Browse jobs</Link></li>
            <li><Link to="/for-candidates" className="hover:text-text">Why TalentBridge</Link></li>
            <li><Link to="/register/candidate" className="hover:text-text">Create profile</Link></li>
            <li><Link to="/login" className="hover:text-text">Track applications</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold">Recruiters</h4>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li><Link to="/for-recruiters" className="hover:text-text">Why TalentBridge</Link></li>
            <li><Link to="/register/recruiter" className="hover:text-text">Post a job</Link></li>
            <li><Link to="/login" className="hover:text-text">Recruiter login</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border py-4 text-center text-xs text-faint">© {new Date().getFullYear()} TalentBridge · Built with React, Express & MongoDB Atlas</div>
    </footer>
  );
}

export function PublicLayout() {
  return (
    <div className="flex min-h-full flex-col">
      <PublicNavbar />
      <AnnouncementBanner />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
