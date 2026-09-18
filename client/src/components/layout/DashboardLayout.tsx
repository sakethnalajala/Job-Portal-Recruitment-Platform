import { useEffect, useState, type ComponentType, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Activity, BarChart3, Bell, Bookmark, Briefcase, Building2, CalendarClock, ChevronLeft, ChevronsUpDown, ClipboardList, Flag, FolderKanban, LayoutDashboard, LogOut, Menu, PlusCircle, Search, ScrollText, Settings, ShieldCheck, SlidersHorizontal, User, UserCog, Users, X, type LucideProps,
} from 'lucide-react';
import { useAuth } from '@/features/auth/AuthProvider';
import { authApi } from '@/features/auth/auth.api';
import { get, toApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Alert, Avatar, Button, Logo, ThemeToggle } from '@/components/ui';
import { Breadcrumbs, Dropdown, MenuItem, PageTransition } from '@/components/ui/extras';
import type { Role } from '@/types/api';

interface NavItem { to: string; label: string; icon: ComponentType<LucideProps>; end?: boolean; badge?: 'unread' }

const NAV: Record<Role, { section: string; items: NavItem[] }[]> = {
  candidate: [
    { section: 'Overview', items: [{ to: '/candidate', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
    { section: 'Jobs', items: [{ to: '/candidate/jobs', label: 'Find jobs', icon: Search }, { to: '/candidate/saved', label: 'Saved jobs & alerts', icon: Bookmark }, { to: '/candidate/applications', label: 'Applications', icon: ClipboardList }] },
    { section: 'Account', items: [{ to: '/candidate/notifications', label: 'Notifications', icon: Bell, badge: 'unread' }, { to: '/candidate/profile', label: 'Profile & resume', icon: User }, { to: '/settings', label: 'Settings', icon: Settings }] },
  ],
  recruiter: [
    { section: 'Overview', items: [{ to: '/recruiter', label: 'Dashboard', icon: LayoutDashboard, end: true }, { to: '/recruiter/analytics', label: 'Analytics', icon: BarChart3 }] },
    { section: 'Hiring', items: [{ to: '/recruiter/jobs', label: 'Job postings', icon: Briefcase, end: true }, { to: '/recruiter/jobs/new', label: 'Post a job', icon: PlusCircle }, { to: '/recruiter/applicants', label: 'Applicants', icon: Users }, { to: '/recruiter/interviews', label: 'Interviews', icon: CalendarClock }, { to: '/recruiter/talent-pool', label: 'Talent pool', icon: FolderKanban }] },
    { section: 'Account', items: [{ to: '/recruiter/notifications', label: 'Notifications', icon: Bell, badge: 'unread' }, { to: '/recruiter/profile', label: 'My profile', icon: User }, { to: '/recruiter/company', label: 'Company & team', icon: Building2 }, { to: '/settings', label: 'Settings', icon: Settings }] },
  ],
  admin: [
    { section: 'Overview', items: [{ to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true }, { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 }] },
    { section: 'Management', items: [{ to: '/admin/users', label: 'Users', icon: Users }, { to: '/admin/jobs', label: 'Jobs', icon: Briefcase }, { to: '/admin/reports', label: 'Reports', icon: Flag }, { to: '/admin/notifications', label: 'Notifications', icon: Bell }] },
    { section: 'Platform', items: [{ to: '/admin/settings', label: 'Platform settings', icon: SlidersHorizontal }, { to: '/admin/system', label: 'System health', icon: Activity }, { to: '/admin/security', label: 'Security & access', icon: ShieldCheck }, { to: '/admin/audit-logs', label: 'Audit log', icon: ScrollText }] },
    { section: 'Account', items: [{ to: '/admin/profile', label: 'My profile', icon: UserCog }, { to: '/settings', label: 'Account settings', icon: Settings }] },
  ],
};

const PROFILE_PATH: Record<Role, string> = { candidate: '/candidate/profile', recruiter: '/recruiter/profile', admin: '/admin/profile' };
const ROLE_LABEL: Record<Role, string> = { candidate: 'Candidate', recruiter: 'Recruiter', admin: 'Administrator' };

function useUnreadCount(enabled: boolean) {
  return useQuery({ queryKey: ['notifications', 'unread-count'], queryFn: () => get<{ unreadCount: number }>('/notifications/unread-count'), select: (r) => r.data.unreadCount, enabled, refetchInterval: 60_000 });
}

function SidebarNav({ role, collapsed, onNavigate }: { role: Role; collapsed: boolean; onNavigate?: () => void }) {
  const { data: unread } = useUnreadCount(true);
  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4 scrollbar-thin" aria-label="Dashboard">
      {NAV[role].map((group) => (
        <div key={group.section}>
          <p className={cn('mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-faint transition-opacity', collapsed && 'sr-only')}>{group.section}</p>
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} end={item.end} onClick={onNavigate} title={collapsed ? item.label : undefined}
                  className={({ isActive }) => cn('relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors', isActive ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/60 dark:text-primary-300' : 'text-text-secondary hover:bg-surface-2 hover:text-text', collapsed && 'justify-center px-0')}>
                  {({ isActive }) => (
                    <>
                      {isActive && <motion.span layoutId={`nav-active-${role}`} className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary-600 dark:bg-primary-400" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />}
                      <item.icon className="h-5 w-5 shrink-0" aria-hidden />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                      {item.badge === 'unread' && unread ? <span className={cn('flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-600 px-1.5 text-[10px] font-bold text-white', collapsed ? 'absolute -right-0.5 -top-0.5' : 'ml-auto')} aria-label={`${unread} unread`}>{unread > 99 ? '99+' : unread}</span> : null}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function DashboardLayout() {
  const { user, logout, refreshUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('tb-sidebar') === 'collapsed'; } catch { return false; } });
  const [adminQuery, setAdminQuery] = useState('');
  const { data: unread } = useUnreadCount(Boolean(user));

  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(() => { try { localStorage.setItem('tb-sidebar', collapsed ? 'collapsed' : 'open'); } catch { /* ignore */ } }, [collapsed]);

  const resend = useMutation({ mutationFn: () => authApi.resendVerification(user!.email), onSuccess: () => toast.success('Verification email sent. Check your inbox.'), onError: (e) => toast.error(toApiError(e).message) });

  if (!user) return null;
  const role = user.role;

  const submitAdminSearch = (e: FormEvent) => {
    e.preventDefault();
    navigate(`/admin/users?q=${encodeURIComponent(adminQuery.trim())}`);
  };

  const profileBlock = (
    <Dropdown align="left" className="w-full" trigger={({ toggle, open }) => (
      <button type="button" onClick={toggle} aria-haspopup="menu" aria-expanded={open} className={cn('flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-surface-2', collapsed && 'justify-center')}>
        <Avatar src={user.profile?.photoUrl} name={user.profile?.fullName} size="sm" />
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user.profile?.fullName}</p>
              <p className="truncate text-xs text-muted">{ROLE_LABEL[role]}</p>
            </div>
            <ChevronsUpDown className="h-4 w-4 text-faint" />
          </>
        )}
      </button>
    )}>
      {(close) => (
        <>
          <div className="border-b border-border px-3 py-2 text-xs text-muted">{user.email}</div>
          <MenuItem icon={<User className="h-4 w-4" />} to={PROFILE_PATH[role]} onClick={close}>My profile</MenuItem>
          <MenuItem icon={<Settings className="h-4 w-4" />} to="/settings" onClick={close}>Settings</MenuItem>
          <MenuItem icon={<LogOut className="h-4 w-4" />} tone="danger" onClick={() => { close(); void logout(); }}>Log out</MenuItem>
        </>
      )}
    </Dropdown>
  );

  return (
    <div className={cn('flex min-h-full bg-bg', role === 'admin' && 'admin-theme')}>
      {/* ── Desktop sidebar ── */}
      <motion.aside animate={{ width: collapsed ? 76 : 264 }} transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 32 }} className="sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-border bg-surface lg:flex">
        <div className={cn('flex h-16 items-center border-b border-border px-4', collapsed ? 'justify-center' : 'justify-between')}>
          <Logo compact={collapsed} />
          {!collapsed && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCollapsed(true)} aria-label="Collapse sidebar"><ChevronLeft className="h-4 w-4" /></Button>}
        </div>
        <SidebarNav role={role} collapsed={collapsed} />
        {collapsed && (
          <button onClick={() => setCollapsed(false)} className="border-t border-border py-3 text-muted hover:text-text" aria-label="Expand sidebar"><ChevronLeft className="mx-auto h-4 w-4 rotate-180" /></button>
        )}
        <div className="border-t border-border p-2">{profileBlock}</div>
      </motion.aside>

      {/* ── Mobile drawer ── */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
            <motion.div className="absolute inset-0 bg-slate-950/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileOpen(false)} />
            <motion.aside initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }} transition={{ type: 'spring', stiffness: 320, damping: 32 }} className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface shadow-2xl">
              <div className="flex h-16 items-center justify-between border-b border-border px-4">
                <Logo />
                <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X className="h-5 w-5" /></Button>
              </div>
              <SidebarNav role={role} collapsed={false} onNavigate={() => setMobileOpen(false)} />
              <div className="border-t border-border p-2">{profileBlock}</div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* ── Main ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border px-4 glass sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu className="h-5 w-5" /></Button>
            <Breadcrumbs />
            <p className="text-sm text-muted md:hidden">{ROLE_LABEL[role]}</p>
          </div>

          <div className="flex items-center gap-1">
            {role === 'admin' && (
              <form onSubmit={submitAdminSearch} role="search" className="hidden md:block">
                <label className="flex h-9 w-56 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-500/30">
                  <Search className="h-4 w-4 text-muted" aria-hidden />
                  <input value={adminQuery} onChange={(e) => setAdminQuery(e.target.value)} placeholder="Search users…" aria-label="Search users" className="w-full bg-transparent outline-none placeholder:text-faint" />
                </label>
              </form>
            )}
            {role !== 'admin' && <Link to={role === 'candidate' ? '/candidate/jobs' : '/jobs'} className="hidden rounded-xl px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-2 hover:text-text md:block">Browse jobs</Link>}
            {role !== 'admin' && <ThemeToggle />}
            <Link to={role === 'admin' ? '/admin/notifications' : role === 'recruiter' ? '/recruiter/notifications' : '/candidate/notifications'} className="relative rounded-xl p-2 text-text-secondary hover:bg-surface-2 hover:text-text" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
              <Bell className="h-5 w-5" />
              {unread ? <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-600 px-1 text-[10px] font-bold text-white">{unread > 99 ? '99+' : unread}</span> : null}
            </Link>
            <Dropdown trigger={({ toggle, open }) => (
              <button type="button" onClick={toggle} aria-haspopup="menu" aria-expanded={open} aria-label="Account menu" className="ml-1 rounded-full ring-offset-2 ring-offset-bg transition-shadow hover:ring-2 hover:ring-primary-300">
                <Avatar src={user.profile?.photoUrl} name={user.profile?.fullName} size="sm" />
              </button>
            )}>
              {(close) => (
                <>
                  <div className="border-b border-border px-3 py-2">
                    <p className="truncate text-sm font-medium">{user.profile?.fullName}</p>
                    <p className="truncate text-xs text-muted">{user.email}</p>
                  </div>
                  <MenuItem icon={<User className="h-4 w-4" />} to={PROFILE_PATH[role]} onClick={close}>My profile</MenuItem>
                  <MenuItem icon={<Settings className="h-4 w-4" />} to="/settings" onClick={close}>Settings</MenuItem>
                  <MenuItem icon={<LogOut className="h-4 w-4" />} tone="danger" onClick={() => { close(); void logout(); }}>Log out</MenuItem>
                </>
              )}
            </Dropdown>
          </div>
        </header>

        <main className="relative flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {role === 'admin' && <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-mesh opacity-80" aria-hidden />}
          <div className="mx-auto max-w-7xl space-y-6">
            {!user.isEmailVerified && role !== 'admin' && (
              <Alert tone="warning" title="Verify your email address" action={<div className="flex gap-2"><Button size="sm" variant="outline" loading={resend.isPending} onClick={() => resend.mutate()}>Resend email</Button><Button size="sm" variant="ghost" onClick={() => void refreshUser()}>I've verified</Button></div>}>
                {role === 'candidate' ? 'You need a verified email to apply for jobs.' : 'You need a verified email to publish job postings.'}
              </Alert>
            )}
            {role === 'recruiter' && user.isEmailVerified && !user.profile?.isVerified && (
              <Alert tone="info" title="Company verification pending">
                Verified companies get a <ShieldCheck className="inline h-4 w-4" /> badge on every posting. Complete your <Link to="/recruiter/profile" className="font-medium underline">company profile</Link> to speed up review.
              </Alert>
            )}
            <PageTransition keyId={location.pathname}>
              <Outlet />
            </PageTransition>
          </div>
        </main>
      </div>
    </div>
  );
}
