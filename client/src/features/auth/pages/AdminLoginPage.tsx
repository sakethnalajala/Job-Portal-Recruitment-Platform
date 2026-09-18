import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Lock, Mail, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, Button, Input, Logo, PageLoader } from '@/components/ui';
import { dashboardPathFor } from '@/lib/utils';
import { useAuth } from '../AuthProvider';
import { authApi } from '../auth.api';
import { loginSchema, type LoginInput } from '../auth.schemas';
import { DemoLoginPanel } from '../DemoLoginPanel';
import { useServerError } from '../useAuthForm';

/**
 * Admin console sign-in. Intentionally has no registration path: administrator
 * accounts are only created server-side (seed scripts), and POST /auth/admin/login
 * rejects any non-admin account with 403.
 */
export function AdminLoginPage() {
  const { status, user, setSession, logout } = useAuth();
  const navigate = useNavigate();
  const { formError, handle } = useServerError<LoginInput>();
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const res = await authApi.adminLogin(values);
      setSession(res.data);
      toast.success('Welcome to the admin console');
      navigate('/admin', { replace: true });
    } catch (err) {
      handle(err, form.setError);
    }
  });

  const fill = (email: string, password: string) => {
    form.setValue('email', email, { shouldValidate: true });
    form.setValue('password', password, { shouldValidate: true });
    form.setFocus('password');
  };

  if (status === 'loading') return <PageLoader />;
  if (status === 'authenticated' && user?.role === 'admin') return <Navigate to="/admin" replace />;

  return (
    <div className="admin-theme relative flex min-h-full flex-col bg-bg text-text">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-mesh" aria-hidden>
        <div className="glow-blob -left-20 top-0 h-[380px] w-[380px] bg-violet-600 animate-float-slow" />
        <div className="glow-blob right-[-100px] bottom-[-120px] h-[420px] w-[420px] bg-primary-600 opacity-40 animate-float" />
      </div>
      <header className="flex items-center justify-between p-4 sm:p-6">
        <Logo />
        <div className="flex items-center gap-2">
          <Link to="/" className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-text"><ArrowLeft className="h-4 w-4" />Back to site</Link>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-12 sm:px-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="glass-card w-full max-w-md rounded-3xl p-6 sm:p-8">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-primary-600 text-white shadow-md"><ShieldCheck className="h-5 w-5" /></span>
            <div>
              <h1 className="text-xl font-bold">Admin console</h1>
              <p className="text-sm text-muted">Restricted to platform administrators.</p>
            </div>
          </div>
          {status === 'authenticated' && user && (
            <Alert tone="warning" title={`Signed in as ${user.profile?.fullName ?? user.email} (${user.role})`} className="mb-5" action={<div className="flex gap-2"><Link to={dashboardPathFor(user.role)}><Button size="sm" variant="outline">My dashboard</Button></Link><Button size="sm" variant="ghost" onClick={() => void logout()}>Sign out</Button></div>}>
              Sign out first to use the admin console.
            </Alert>
          )}
          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            {formError && <Alert tone="danger">{formError}</Alert>}
            <Input label="Admin email" type="email" autoComplete="username" leftIcon={<Mail className="h-4 w-4" />} error={form.formState.errors.email?.message} {...form.register('email')} />
            <Input label="Password" type="password" autoComplete="current-password" error={form.formState.errors.password?.message} {...form.register('password')} />
            <Button type="submit" size="lg" className="btn-gradient w-full" loading={form.formState.isSubmitting} leftIcon={<Lock className="h-4 w-4" />}>Sign in to console</Button>
          </form>
          <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wider text-faint"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
          <DemoLoginPanel role="admin" onFill={fill} />
          <p className="mt-6 text-center text-xs text-muted">Administrator accounts cannot be created here. Access is provisioned by the platform owner only.</p>
        </motion.div>
      </main>
    </div>
  );
}
