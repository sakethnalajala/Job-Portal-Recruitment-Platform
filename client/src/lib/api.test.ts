import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server, BASE, ok, fail, candidateUser } from '@/test/server';
import { tokenStore } from './auth-token';
import { get, normalizeApiUrl, onSessionExpired, toApiError } from './api';

describe('api client — silent refresh', () => {
  it('attaches the bearer token from the in-memory store', async () => {
    let seen: string | null = null;
    server.use(
      http.get(`${BASE}/auth/me`, ({ request }) => {
        seen = request.headers.get('authorization');
        return ok({ user: candidateUser });
      }),
    );
    tokenStore.set('access-1');
    await get('/auth/me');
    expect(seen).toBe('Bearer access-1');
  });

  it('on 401 TOKEN_EXPIRED: refreshes once, retries with the new token', async () => {
    let calls = 0;
    let refreshes = 0;
    server.use(
      http.get(`${BASE}/auth/me`, ({ request }) => {
        calls++;
        return request.headers.get('authorization') === 'Bearer fresh' ? ok({ user: candidateUser }) : fail(401, 'TOKEN_EXPIRED', 'Access token expired');
      }),
      http.post(`${BASE}/auth/refresh`, () => {
        refreshes++;
        return ok({ user: candidateUser, accessToken: 'fresh' });
      }),
    );
    tokenStore.set('stale');
    const res = await get<{ user: typeof candidateUser }>('/auth/me');
    expect(res.data.user.email).toBe(candidateUser.email);
    expect(calls).toBe(2);
    expect(refreshes).toBe(1);
    expect(tokenStore.get()).toBe('fresh');
  });

  it('concurrent 401s share a single refresh request', async () => {
    let refreshes = 0;
    server.use(
      http.get(`${BASE}/notifications/unread-count`, ({ request }) =>
        request.headers.get('authorization') === 'Bearer fresh' ? ok({ unreadCount: 3 }) : fail(401, 'TOKEN_EXPIRED', 'expired'),
      ),
      http.get(`${BASE}/auth/me`, ({ request }) =>
        request.headers.get('authorization') === 'Bearer fresh' ? ok({ user: candidateUser }) : fail(401, 'TOKEN_EXPIRED', 'expired'),
      ),
      http.post(`${BASE}/auth/refresh`, async () => {
        refreshes++;
        await new Promise((r) => setTimeout(r, 30));
        return ok({ user: candidateUser, accessToken: 'fresh' });
      }),
    );
    tokenStore.set('stale');
    const [a, b, c] = await Promise.all([get('/auth/me'), get('/notifications/unread-count'), get('/auth/me')]);
    expect(a.success && b.success && c.success).toBe(true);
    expect(refreshes).toBe(1);
  });

  it('when refresh fails: clears the token, notifies session listeners, rejects with the original error', async () => {
    const listener = vi.fn();
    const off = onSessionExpired(listener);
    server.use(
      http.get(`${BASE}/auth/me`, () => fail(401, 'TOKEN_EXPIRED', 'expired')),
      http.post(`${BASE}/auth/refresh`, () => fail(401, 'REFRESH_TOKEN_EXPIRED', 'Session expired')),
    );
    tokenStore.set('stale');
    await expect(get('/auth/me')).rejects.toBeDefined();
    expect(tokenStore.get()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });

  it('does not attempt refresh for login failures or non-refreshable 401s', async () => {
    let refreshes = 0;
    server.use(
      http.post(`${BASE}/auth/login`, () => fail(401, 'INVALID_CREDENTIALS', 'Invalid email or password')),
      http.post(`${BASE}/auth/refresh`, () => {
        refreshes++;
        return ok({ user: candidateUser, accessToken: 'x' });
      }),
    );
    const { post } = await import('./api');
    await expect(post('/auth/login', { email: 'a@b.c', password: 'x' })).rejects.toBeDefined();
    expect(refreshes).toBe(0);
  });

  it('toApiError normalises envelope errors and network failures', async () => {
    server.use(http.get(`${BASE}/jobs/abc`, () => fail(404, 'JOB_NOT_FOUND', 'Job not found')));
    const err = await get('/jobs/abc').then(() => null, (e) => toApiError(e));
    expect(err).toMatchObject({ status: 404, code: 'JOB_NOT_FOUND', message: 'Job not found' });

    server.use(http.get(`${BASE}/jobs/net`, () => HttpResponse.error()));
    const net = await get('/jobs/net').then(() => null, (e) => toApiError(e));
    expect(net?.code).toBe('NETWORK_ERROR');
  });
});

describe('normalizeApiUrl', () => {
  it('defaults to the same-origin prefix', () => {
    expect(normalizeApiUrl(undefined)).toBe('/api/v1');
    expect(normalizeApiUrl('')).toBe('/api/v1');
    expect(normalizeApiUrl('/api/v1')).toBe('/api/v1');
    expect(normalizeApiUrl('/api/v1/')).toBe('/api/v1');
  });

  it('appends the prefix to a bare host and never doubles it', () => {
    expect(normalizeApiUrl('https://job-portal-recruitment-platform.onrender.com')).toBe('https://job-portal-recruitment-platform.onrender.com/api/v1');
    expect(normalizeApiUrl('https://api.example.com/')).toBe('https://api.example.com/api/v1');
    expect(normalizeApiUrl('https://api.example.com/api')).toBe('https://api.example.com/api/v1');
    expect(normalizeApiUrl('https://api.example.com/api/v1')).toBe('https://api.example.com/api/v1');
    expect(normalizeApiUrl('https://api.example.com/api/v2/')).toBe('https://api.example.com/api/v2');
  });
});
