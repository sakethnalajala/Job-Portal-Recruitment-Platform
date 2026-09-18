import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Building2, Mail, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, Button, Input } from '@/components/ui';
import { cn, dashboardPathFor } from '@/lib/utils';
import { useAuth } from '../AuthProvider';
import { authApi } from '../auth.api';
import { loginSchema, type LoginInput } from '../auth.schemas';
import { DemoLoginPanel } from '../DemoLoginPanel';
import { AuthLink, FormShell } from '../FormShell';
import { useServerError } from '../useAuthForm';

type LoginRole = 'candidate' | 'recruiter';

const COPY: Record<LoginRole, { title: string; subtitle: string; register: string; registerLabel: string }> = {
  candidate: { title: 'Candidate login', subtitle: 'Track applications, manage your resume and get matched to roles.', register: '/register/candidate', registerLabel: 'Create a candidate account' },
  recruiter: { title: 'Recruiter login', subtitle: 'Manage postings, review applicants and move your pipeline.', register: '/register/recruiter', registerLabel: 'Create a recruiter account' },
};

/**
 * /login (generic), /login/candidate and /login/recruiter share this page.
 * The role only changes copy and which demo account is offered — the backend
 * decides the role from the account itself.
 */
export function LoginPage() {
  const { role: roleParam } = useParams();
  const role: LoginRole = roleParam === 'recruiter' ? 'recruiter' : 'candidate';
  const generic = !roleParam;
  const { setSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { formError, handle } = useServerError<LoginInput>();
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const res = await authApi.login(values);
      setSession(res.data);
      toast.success(`Welcome back, ${res.data.user.profile?.fullName ?? ''}`.trim());
      const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname;
      navigate(from ?? dashboardPathFor(res.data.user.role), { replace: true });
    } catch (err) {
      const apiErr = handle(err, form.setError);
      if (apiErr.code === 'ACCOUNT_SUSPENDED') form.setValue('password', '');
    }
  });

  const fill = (email: string, password: string) => {
    form.setValue('email', email, { shouldValidate: true });
    form.setValue('password', password, { shouldValidate: true });
    form.setFocus('password');
  };

  const copy = generic ? { title: 'Welcome back', subtitle: 'Log in to track applications or manage your postings.' } : COPY[role];

  return (
    <FormShell
      title={copy.title}
      subtitle={copy.subtitle}
      footer={
        generic ? (
          <>New here? <AuthLink to="/register/candidate">Create a candidate account</AuthLink> · <AuthLink to="/register/recruiter">I'm hiring</AuthLink></>
        ) : (
          <>New here? <AuthLink to={COPY[role].register}>{COPY[role].registerLabel}</AuthLink></>
        )
      }
    >
      {/* Role switch keeps the demo panel relevant */}
      <div className="mb-6 grid grid-cols-2 rounded-xl border border-border bg-surface-2 p-1 text-sm font-medium" role="tablist" aria-label="Login as">
        {(['candidate', 'recruiter'] as const).map((r) => (
          <Link key={r} to={`/login/${r}`} role="tab" aria-selected={!generic && role === r} state={location.state}
            className={cn('inline-flex items-center justify-center gap-1.5 rounded-lg py-2 transition-colors', !generic && role === r ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text')}>
            {r === 'candidate' ? <UserRound className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}{r === 'candidate' ? 'Candidate' : 'Recruiter'}
          </Link>
        ))}
      </div>

      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Input label="Email" type="email" autoComplete="email" placeholder="you@example.com" leftIcon={<Mail className="h-4 w-4" />} error={form.formState.errors.email?.message} {...form.register('email')} />
        <div>
          <Input label="Password" type="password" autoComplete="current-password" placeholder="••••••••" error={form.formState.errors.password?.message} {...form.register('password')} />
          <div className="mt-2 text-right"><AuthLink to="/forgot-password">Forgot password?</AuthLink></div>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>Log in</Button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wider text-faint"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
      <DemoLoginPanel role={role} onFill={fill} />
      {generic && <p className="mt-3 text-center text-xs text-muted">Recruiter? <Link to="/login/recruiter" className="text-primary-600 hover:underline dark:text-primary-400">Switch to the recruiter demo</Link>. Administrator? <Link to="/admin/login" className="text-primary-600 hover:underline dark:text-primary-400">Admin console</Link>.</p>}
    </FormShell>
  );
}
