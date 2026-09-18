import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { Building2, Mail, User } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, Button, Checkbox, Input } from '@/components/ui';
import { useAuth } from '../AuthProvider';
import { authApi } from '../auth.api';
import { registerCandidateSchema, registerRecruiterSchema, type RegisterCandidateInput, type RegisterRecruiterInput } from '../auth.schemas';
import { AuthLink, FormShell, RoleSwitch } from '../FormShell';
import { useServerError } from '../useAuthForm';
import { usePublicSettings } from '@/features/platform/AnnouncementBanner';

const PASSWORD_HINT = 'At least 8 characters with a letter and a number';

function Terms() {
  return (
    <>
      I agree to the <AuthLink to="/terms">Terms of Service</AuthLink> and <AuthLink to="/privacy">Privacy Policy</AuthLink>.
    </>
  );
}

export function RegisterCandidatePage() {
  const settings = usePublicSettings();
  const closed = settings.data ? !settings.data.registration.candidate : false;
  const { setSession } = useAuth();
  const navigate = useNavigate();
  const { formError, handle } = useServerError<RegisterCandidateInput>();
  const form = useForm<RegisterCandidateInput>({
    resolver: zodResolver(registerCandidateSchema),
    defaultValues: { fullName: '', email: '', password: '', confirmPassword: '' },
  });
  const e = form.formState.errors;

  const onSubmit = form.handleSubmit(async ({ fullName, email, password }) => {
    try {
      const res = await authApi.registerCandidate({ fullName, email, password });
      setSession(res.data);
      toast.success('Account created! Check your inbox to verify your email.');
      navigate('/candidate', { replace: true });
    } catch (err) {
      handle(err, form.setError);
    }
  });

  return (
    <FormShell title="Create your candidate account" subtitle="Build a profile once, apply everywhere with a click." footer={<>Already have an account? <AuthLink to="/login">Log in</AuthLink></>}>
      <RoleSwitch current="candidate" />
      {closed && <Alert tone="warning" title="Candidate registration is currently closed" className="mb-5">Please check back later or contact support.</Alert>}
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Input label="Full name" autoComplete="name" placeholder="Asha Verma" leftIcon={<User className="h-4 w-4" />} error={e.fullName?.message} {...form.register('fullName')} />
        <Input label="Email" type="email" autoComplete="email" placeholder="you@example.com" leftIcon={<Mail className="h-4 w-4" />} error={e.email?.message} {...form.register('email')} />
        <div className="grid gap-5 sm:grid-cols-2">
          <Input label="Password" type="password" autoComplete="new-password" hint={PASSWORD_HINT} error={e.password?.message} {...form.register('password')} />
          <Input label="Confirm password" type="password" autoComplete="new-password" error={e.confirmPassword?.message} {...form.register('confirmPassword')} />
        </div>
        <Checkbox label={<Terms />} error={e.acceptTerms?.message} {...form.register('acceptTerms')} />
        <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting} disabled={closed}>
          Create account
        </Button>
      </form>
    </FormShell>
  );
}

export function RegisterRecruiterPage() {
  const settings = usePublicSettings();
  const closed = settings.data ? !settings.data.registration.recruiter : false;
  const { setSession } = useAuth();
  const navigate = useNavigate();
  const { formError, handle } = useServerError<RegisterRecruiterInput>();
  const form = useForm<RegisterRecruiterInput>({
    resolver: zodResolver(registerRecruiterSchema),
    defaultValues: { fullName: '', companyName: '', email: '', password: '', confirmPassword: '' },
  });
  const e = form.formState.errors;

  const onSubmit = form.handleSubmit(async ({ fullName, companyName, email, password }) => {
    try {
      const res = await authApi.registerRecruiter({ fullName, companyName, email, password });
      setSession(res.data);
      toast.success('Recruiter account created! Verify your email to publish jobs.');
      navigate('/recruiter', { replace: true });
    } catch (err) {
      handle(err, form.setError);
    }
  });

  return (
    <FormShell title="Create your recruiter account" subtitle="Post jobs, review applicants and manage your pipeline." footer={<>Already have an account? <AuthLink to="/login">Log in</AuthLink></>}>
      <RoleSwitch current="recruiter" />
      {closed && <Alert tone="warning" title="Recruiter registration is currently closed" className="mb-5">Please check back later or contact support.</Alert>}
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <div className="grid gap-5 sm:grid-cols-2">
          <Input label="Your name" autoComplete="name" placeholder="Rohan Mehta" leftIcon={<User className="h-4 w-4" />} error={e.fullName?.message} {...form.register('fullName')} />
          <Input label="Company name" autoComplete="organization" placeholder="Zyntra Labs" leftIcon={<Building2 className="h-4 w-4" />} error={e.companyName?.message} {...form.register('companyName')} />
        </div>
        <Input label="Work email" type="email" autoComplete="email" placeholder="you@company.com" leftIcon={<Mail className="h-4 w-4" />} error={e.email?.message} {...form.register('email')} />
        <div className="grid gap-5 sm:grid-cols-2">
          <Input label="Password" type="password" autoComplete="new-password" hint={PASSWORD_HINT} error={e.password?.message} {...form.register('password')} />
          <Input label="Confirm password" type="password" autoComplete="new-password" error={e.confirmPassword?.message} {...form.register('confirmPassword')} />
        </div>
        <Checkbox label={<Terms />} error={e.acceptTerms?.message} {...form.register('acceptTerms')} />
        <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting} disabled={closed}>
          Create recruiter account
        </Button>
      </form>
    </FormShell>
  );
}
