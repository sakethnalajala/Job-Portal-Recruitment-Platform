import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { queryClient } from '@/lib/query-client';
import type { AuthUser } from '@/types/api';

export function AppProviders({ children, initialUser }: { children: ReactNode; initialUser?: AuthUser | null }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider initialUser={initialUser}>
        {children}
        <Toaster position="top-right" richColors closeButton toastOptions={{ className: 'font-sans' }} />
      </AuthProvider>
    </QueryClientProvider>
  );
}
