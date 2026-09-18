import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation, useRoutes, type RouteObject } from 'react-router-dom';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { queryClient } from '@/lib/query-client';
import type { AuthUser } from '@/types/api';

type InitialEntries = NonNullable<Parameters<typeof MemoryRouter>[0]['initialEntries']>;

function Routes({ routes }: { routes: RouteObject[] }) {
  return useRoutes(routes);
}

/** Renders a test page that prints where it was redirected from. */
export function LocationEcho({ label }: { label: string }) {
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname;
  return (
    <div>
      {label}
      {from && <span data-testid="from">{from}</span>}
    </div>
  );
}

/**
 * Renders routes inside the real providers with a MemoryRouter.
 * `user` = undefined → AuthProvider boots via POST /auth/refresh (like the real app).
 */
export function renderWithRouter(routes: RouteObject[], { initialEntries = ['/'], user }: { initialEntries?: InitialEntries; user?: AuthUser | null } = {}) {
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider initialUser={user}>
        <MemoryRouter initialEntries={initialEntries}>
          <Routes routes={routes} />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

export function Providers({ children, user }: { children: ReactNode; user?: AuthUser | null }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider initialUser={user}>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
