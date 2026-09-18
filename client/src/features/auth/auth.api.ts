import { del, get, post, patch } from '@/lib/api';
import type { AuthUser, SessionPayload } from '@/types/api';

export interface SessionInfo { id: string; userAgent: string | null; ip: string | null; createdAt: string; expiresAt: string; current: boolean }

export const authApi = {
  registerCandidate: (body: { fullName: string; email: string; password: string }) =>
    post<SessionPayload>('/auth/register/candidate', body),
  registerRecruiter: (body: { fullName: string; email: string; password: string; companyName: string }) =>
    post<SessionPayload>('/auth/register/recruiter', body),
  login: (body: { email: string; password: string }) => post<SessionPayload>('/auth/login', body),
  /** Admin console: backend rejects non-admin accounts with 403 NOT_ADMIN. */
  adminLogin: (body: { email: string; password: string }) => post<SessionPayload>('/auth/admin/login', body),
  sessions: () => get<{ sessions: SessionInfo[] }>('/auth/sessions'),
  revokeSession: (id: string) => del<null>(`/auth/sessions/${id}`),
  logoutAll: () => post<null>('/auth/logout-all'),
  updateDisplayName: (displayName: string) => patch<{ user: AuthUser }>('/auth/display-name', { displayName }),
  logout: () => post<null>('/auth/logout'),
  me: () => get<{ user: AuthUser }>('/auth/me'),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    patch<SessionPayload>('/auth/change-password', body),
  forgotPassword: (email: string) => post<null>('/auth/forgot-password', { email }),
  resetPassword: (body: { token: string; password: string }) => post<null>('/auth/reset-password', body),
  verifyEmail: (token: string) => post<null>('/auth/verify-email', { token }),
  resendVerification: (email: string) => post<null>('/auth/resend-verification', { email }),
};
