import { Link, isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom';
import { Construction, Lock, SearchX, ServerCrash } from 'lucide-react';
import { Button, Logo, PageHeader } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { dashboardPathFor } from '@/lib/utils';

function Shell({ icon, code, title, description, children }: { icon: React.ReactNode; code: string; title: string; description: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-16 text-center">
      <Logo className="mb-10" />
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-950/60 dark:text-primary-300">{icon}</div>
      <p className="text-sm font-semibold uppercase tracking-widest text-primary-600 dark:text-primary-400">{code}</p>
      <h1 className="mt-2 text-3xl font-bold">{title}</h1>
      <p className="mt-2 max-w-md text-muted">{description}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">{children}</div>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <Shell icon={<SearchX className="h-8 w-8" />} code="404" title="Page not found" description="The page you're looking for doesn't exist or has moved.">
      <Link to="/"><Button>Go home</Button></Link>
      <Link to="/jobs"><Button variant="outline">Browse jobs</Button></Link>
    </Shell>
  );
}

export function ForbiddenPage() {
  const { user } = useAuth();
  return (
    <Shell icon={<Lock className="h-8 w-8" />} code="403" title="Access denied" description="Your account doesn't have permission to view this page.">
      <Link to={user ? dashboardPathFor(user.role) : '/'}><Button>Back to {user ? 'dashboard' : 'home'}</Button></Link>
    </Shell>
  );
}

export function RouteErrorPage() {
  const error = useRouteError();
  const navigate = useNavigate();
  const isResponse = isRouteErrorResponse(error);
  if (isResponse && error.status === 404) return <NotFoundPage />;
  return (
    <Shell icon={<ServerCrash className="h-8 w-8" />} code={isResponse ? String(error.status) : 'Error'} title="Something went wrong" description="An unexpected error occurred while rendering this page. Please try again.">
      <Button onClick={() => navigate(0)}>Reload</Button>
      <Link to="/"><Button variant="outline">Go home</Button></Link>
    </Shell>
  );
}

/** Placeholder for feature pages that arrive in Phase 6. */
export function ComingSoon({ title, description = 'This area is being built in the next phase.' }: { title: string; description?: string }) {
  return (
    <div>
      <PageHeader title={title} />
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-border-strong px-6 py-16 text-center">
        <Construction className="mb-3 h-8 w-8 text-muted" />
        <p className="font-medium">Under construction</p>
        <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>
      </div>
    </div>
  );
}
