import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { onSessionExpired, refreshAccessToken } from '@/lib/api';
import { tokenStore } from '@/lib/auth-token';
import type { AuthUser, SessionPayload } from '@/types/api';
import { authApi } from './auth.api';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  /** Store a session returned by login/register/change-password. */
  setSession: (payload: SessionPayload) => void;
  /** Re-fetch /auth/me (e.g. after profile or verification changes). */
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children, initialUser }: { children: ReactNode; initialUser?: AuthUser | null }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>(initialUser === undefined ? 'loading' : initialUser ? 'authenticated' : 'anonymous');
  const [user, setUser] = useState<AuthUser | null>(initialUser ?? null);
  const booted = useRef(initialUser !== undefined);

  const clearSession = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    setStatus('anonymous');
    queryClient.clear();
  }, [queryClient]);

  const setSession = useCallback((payload: SessionPayload) => {
    tokenStore.set(payload.accessToken);
    setUser(payload.user);
    setStatus('authenticated');
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await authApi.me();
      setUser(res.data.user);
      setStatus('authenticated');
    } catch {
      clearSession();
    }
  }, [clearSession]);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Cookie may already be gone; local state is cleared regardless.
    }
    clearSession();
  }, [clearSession]);

  // Boot: exchange the refresh cookie for an access token, then load the user.
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    (async () => {
      const token = await refreshAccessToken();
      if (!token) {
        setStatus('anonymous');
        return;
      }
      await refreshUser();
    })();
  }, [refreshUser]);

  // A refresh failed mid-session (revoked / expired) → drop to anonymous.
  useEffect(() => {
    const unsubscribe = onSessionExpired(clearSession);
    return () => {
      unsubscribe();
    };
  }, [clearSession]);

  const value = useMemo(() => ({ status, user, setSession, refreshUser, logout }), [status, user, setSession, refreshUser, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
