import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { AuthUser } from '@/types/api';

export const BASE = 'http://localhost/api/v1';

export const candidateUser: AuthUser = {
  id: 'u1',
  email: 'asha@example.com',
  role: 'candidate',
  isEmailVerified: true,
  profile: { fullName: 'Asha Verma', photoUrl: null, completion: 40 },
};
export const recruiterUser: AuthUser = {
  id: 'u2',
  email: 'hr@zyntra.example',
  role: 'recruiter',
  isEmailVerified: true,
  profile: { fullName: 'Rohan Mehta', companyName: 'Zyntra Labs', photoUrl: null, isVerified: false },
};

export const ok = <T>(data: T, meta?: object) => HttpResponse.json({ success: true, message: 'OK', data, ...(meta ? { meta } : {}) });
export const fail = (status: number, code: string, message: string, details?: { field: string; message: string }[]) =>
  HttpResponse.json({ success: false, error: { code, message, ...(details ? { details } : {}) } }, { status });

/** Default: no session, empty job board. Tests override per case with server.use(). */
export const handlers = [
  http.post(`${BASE}/auth/refresh`, () => fail(401, 'NO_REFRESH_TOKEN', 'No active session')),
  http.get(`${BASE}/jobs`, () => ok({ jobs: [] }, { page: 1, limit: 12, total: 0, totalPages: 1 })),
  http.get(`${BASE}/notifications/unread-count`, () => ok({ unreadCount: 0 })),
  http.post(`${BASE}/auth/logout`, () => ok(null)),
  http.get(`${BASE}/settings/public`, () => ok({ platformName: 'TalentBridge', supportEmail: null, registration: { candidate: true, recruiter: true }, maintenance: { enabled: false, message: null }, announcement: null })),
];

export const server = setupServer(...handlers);
