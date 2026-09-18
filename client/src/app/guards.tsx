import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { PageLoader } from '@/components/ui';
import { dashboardPathFor } from '@/lib/utils';
import type { Role } from '@/types/api';

/** Blocks anonymous users (→ /login, remembering where they were) and wrong roles (→ /403). */
export function RequireAuth({ roles }: { roles?: Role[] }) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <PageLoader label="Restoring your session…" />;
  if (status === 'anonymous' || !user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/403" replace />;
  return <Outlet />;
}

/** Login/register pages: authenticated users go straight to their dashboard. */
export function GuestOnly() {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <PageLoader />;
  if (status === 'authenticated' && user) {
    const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname;
    return <Navigate to={from ?? dashboardPathFor(user.role)} replace />;
  }
  return <Outlet />;
}
