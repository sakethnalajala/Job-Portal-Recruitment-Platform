import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Mail, MailCheck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, Button, Input, Spinner } from '@/components/ui';
import { toApiError } from '@/lib/api';
import { useAuth } from '../AuthProvider';
import { authApi } from '../auth.api';
import { forgotPasswordSchema, resetPasswordSchema, type ForgotPasswordInput, type ResetPasswordInput } from '../auth.schemas';
import { AuthLink, FormShell } from '../FormShell';
import { useServerError } from '../useAuthForm';

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const { formError, handle } = useServerError<ForgotPasswordInput>();
  const form = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: '' } });

  const onSubmit = form.handleSubmit(async ({ email }) => {
    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch (err) {
      handle(err, form.setError);
    }
  });

  if (sent) {
    return (
      <FormShell title="Check your inbox" subtitle="If an account exists for that email, we've sent a link to reset your password. It expires in 30 minutes.">
        <MailCheck className="h-12 w-12 text-success" />
        <Link to="/login" className="mt-8 block">
          <Button variant="outline" className="w-full">Back to login</Button>
        </Link>
      </FormShell>
    );
  }

  return (
    <FormShell title="Forgot your password?" subtitle="Enter your email and we'll send you a reset link." footer={<>Remembered it? <AuthLink to="/login">Log in</AuthLink></>}>
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Input label="Email" type="email" autoComplete="email" leftIcon={<Mail className="h-4 w-4" />} error={form.formState.errors.email?.message} {...form.register('email')} />
        <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
          Send reset link
        </Button>
      </form>
    </FormShell>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const { formError, handle } = useServerError<ResetPasswordInput>();
  const form = useForm<ResetPasswordInput>({ resolver: zodResolver(resetPasswordSchema), defaultValues: { password: '', confirmPassword: '' } });

  const onSubmit = form.handleSubmit(async ({ password }) => {
    try {
      await authApi.resetPassword({ token, password });
      toast.success('Password reset. Please log in with your new password.');
      navigate('/login', { replace: true });
    } catch (err) {
      handle(err, form.setError);
    }
  });

  if (!token) {
    return (
      <FormShell title="Invalid link" subtitle="This password reset link is missing its token.">
        <Link to="/forgot-password"><Button className="w-full">Request a new link</Button></Link>
      </FormShell>
    );
  }

  return (
    <FormShell title="Choose a new password" subtitle="This will sign you out of all other devices.">
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Input label="New password" type="password" autoComplete="new-password" hint="At least 8 characters with a letter and a number" error={form.formState.errors.password?.message} {...form.register('password')} />
        <Input label="Confirm new password" type="password" autoComplete="new-password" error={form.formState.errors.confirmPassword?.message} {...form.register('confirmPassword')} />
        <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
          Reset password
        </Button>
      </form>
    </FormShell>
  );
}

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { status, user, refreshUser } = useAuth();
  const verify = useMutation({
    mutationFn: () => authApi.verifyEmail(token),
    onSuccess: () => {
      if (status === 'authenticated') void refreshUser();
    },
  });

  useEffect(() => {
    if (token) verify.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!token) {
    return (
      <FormShell title="Invalid link" subtitle="This verification link is missing its token.">
        <Link to="/login"><Button className="w-full">Go to login</Button></Link>
      </FormShell>
    );
  }
  if (verify.isPending || verify.isIdle) {
    return (
      <FormShell title="Verifying your email…">
        <Spinner className="h-8 w-8" />
      </FormShell>
    );
  }
  if (verify.isError) {
    return (
      <FormShell title="Link expired or invalid" subtitle={toApiError(verify.error).message}>
        <XCircle className="h-12 w-12 text-danger" />
        <div className="mt-8 space-y-3">
          {user ? (
            <ResendButton email={user.email} />
          ) : (
            <Link to="/login"><Button className="w-full">Log in to request a new link</Button></Link>
          )}
        </div>
      </FormShell>
    );
  }
  return (
    <FormShell title="Email verified" subtitle="You can now apply for jobs and publish postings.">
      <CheckCircle2 className="h-12 w-12 text-success" />
      <Link to={user ? (user.role === 'recruiter' ? '/recruiter' : user.role === 'admin' ? '/admin' : '/candidate') : '/login'} className="mt-8 block">
        <Button className="w-full">{user ? 'Go to dashboard' : 'Log in'}</Button>
      </Link>
    </FormShell>
  );
}

function ResendButton({ email }: { email: string }) {
  const resend = useMutation({
    mutationFn: () => authApi.resendVerification(email),
    onSuccess: () => toast.success('A new verification email is on its way.'),
    onError: (e) => toast.error(toApiError(e).message),
  });
  return (
    <Button className="w-full" loading={resend.isPending} onClick={() => resend.mutate()}>
      Send a new verification email
    </Button>
  );
}
