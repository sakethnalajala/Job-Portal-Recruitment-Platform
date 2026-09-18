import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, KeyRound, Monitor, Moon, Sun } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, Button, Input, PageHeader } from '@/components/ui';
import { BackButton } from '@/components/ui/BackButton';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Section } from '@/components/ui/extras';
import { useTheme, type Theme } from '@/hooks/useTheme';
import { del, toApiError } from '@/lib/api';
import { cn, dashboardPathFor } from '@/lib/utils';
import { useAuth } from '../AuthProvider';
import { authApi } from '../auth.api';
import { passwordField } from '../auth.schemas';
import { useServerError } from '../useAuthForm';

const pwSchema = z.object({ currentPassword: z.string().min(1, 'Required'), newPassword: passwordField, confirm: z.string() })
  .refine((v) => v.newPassword === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
  .refine((v) => v.newPassword !== v.currentPassword, { path: ['newPassword'], message: 'Choose a different password' });
type PwValues = z.infer<typeof pwSchema>;

export function SettingsPage() {
  const { user, setSession, logout } = useAuth();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { formError, handle } = useServerError<PwValues>();
  const form = useForm<PwValues>({ resolver: zodResolver(pwSchema), defaultValues: { currentPassword: '', newPassword: '', confirm: '' } });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteWord, setDeleteWord] = useState('');

  const changePw = useMutation({
    mutationFn: (v: PwValues) => authApi.changePassword({ currentPassword: v.currentPassword, newPassword: v.newPassword }),
    onSuccess: (r) => { setSession(r.data); form.reset(); toast.success('Password changed. Other devices were signed out.'); },
    onError: (e) => handle(e, form.setError),
  });
  const deleteAccount = useMutation({
    mutationFn: () => del<null>('/users/me', { data: { password: deletePassword, confirmation: deleteWord } }),
    onSuccess: async () => { toast.success('Your account has been deleted'); await logout(); navigate('/', { replace: true }); },
    onError: (e) => toast.error(toApiError(e).message),
  });

  const themes: { value: Theme; label: string; icon: React.ReactNode }[] = [{ value: 'light', label: 'Light', icon: <Sun className="h-4 w-4" /> }, { value: 'dark', label: 'Dark', icon: <Moon className="h-4 w-4" /> }, { value: 'system', label: 'System', icon: <Monitor className="h-4 w-4" /> }];
  const e = form.formState.errors;

  return (
    <div className="mx-auto max-w-3xl">
      <BackButton fallback={user ? dashboardPathFor(user.role) : '/'} className="mb-2" />
      <PageHeader title="Settings" description={user?.email} />
      <div className="space-y-6">
        <Section title="Appearance">
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
            {themes.map((t) => <button key={t.value} type="button" role="radio" aria-checked={theme === t.value} onClick={() => setTheme(t.value)} className={cn('flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium transition-colors', theme === t.value ? 'border-primary-600 bg-primary-50 text-primary-700 dark:bg-primary-950/60 dark:text-primary-300' : 'border-border hover:bg-surface-2')}>{t.icon}{t.label}</button>)}
          </div>
        </Section>

        <Section title="Change password" description="Changing your password signs out every other device.">
          <form onSubmit={form.handleSubmit((v) => changePw.mutate(v))} className="space-y-4" noValidate>
            {formError && <Alert tone="danger">{formError}</Alert>}
            <Input label="Current password" type="password" autoComplete="current-password" error={e.currentPassword?.message} {...form.register('currentPassword')} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="New password" type="password" autoComplete="new-password" hint="8+ characters with a letter and a number" error={e.newPassword?.message} {...form.register('newPassword')} />
              <Input label="Confirm new password" type="password" autoComplete="new-password" error={e.confirm?.message} {...form.register('confirm')} />
            </div>
            <div className="flex justify-end"><Button type="submit" leftIcon={<KeyRound className="h-4 w-4" />} loading={changePw.isPending}>Update password</Button></div>
          </form>
        </Section>

        {user?.role !== 'admin' && (
          <Section title="Danger zone" className="border-danger/30">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="font-medium">Delete account</p><p className="text-sm text-muted">Your profile is deactivated, active applications are withdrawn and open jobs are closed. This cannot be undone.</p></div>
              <Button variant="danger" leftIcon={<AlertTriangle className="h-4 w-4" />} onClick={() => setConfirmDelete(true)}>Delete my account</Button>
            </div>
          </Section>
        )}
      </div>

      <ConfirmDialog open={confirmDelete} onClose={() => { setConfirmDelete(false); setDeletePassword(''); setDeleteWord(''); }} onConfirm={() => deleteAccount.mutate()} loading={deleteAccount.isPending} tone="danger" title="Delete your account?" description="Confirm with your password and type DELETE." confirmLabel="Delete permanently">
        <div className="space-y-3">
          <Input label="Password" type="password" autoComplete="current-password" value={deletePassword} onChange={(ev) => setDeletePassword(ev.target.value)} />
          <Input label='Type "DELETE" to confirm' value={deleteWord} onChange={(ev) => setDeleteWord(ev.target.value)} />
        </div>
      </ConfirmDialog>
    </div>
  );
}
