import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import { tokenStore } from './auth-token';
import type { ApiErrorBody, ApiSuccess, SessionPayload } from '@/types/api';

/**
 * Every request path in the app is relative to the API prefix (`/jobs`, `/auth/login`, …),
 * so the base URL must end in `/api/v1`. Accepts the recommended relative form (`/api/v1`,
 * same-origin via the Vite proxy / Vercel rewrite) as well as an absolute host with or
 * without the prefix, so a bare `https://api.example.com` cannot produce `/jobs` (404) and
 * `https://api.example.com/api/v1/` cannot produce `/api/v1//jobs`.
 */
export function normalizeApiUrl(raw: string | undefined): string {
  const value = (raw ?? '').trim().replace(/\/+$/, '');
  if (!value) return '/api/v1';
  if (/\/api\/v\d+$/.test(value)) return value;
  if (/\/api$/.test(value)) return `${value}/v1`;
  return `${value}/api/v1`;
}

export const API_URL = normalizeApiUrl(import.meta.env.VITE_API_URL);

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // refresh cookie
  timeout: 30_000,
  headers: { Accept: 'application/json' },
});

// ─── request: attach bearer ────────────────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token && !config.headers.Authorization) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ─── response: silent refresh on 401 (single-flight) ───────────────────────
type RetryConfig = InternalAxiosRequestConfig & { _retried?: boolean };

let refreshPromise: Promise<string | null> | null = null;
const sessionListeners = new Set<() => void>();

/** Called when a refresh definitively fails: the app should drop to anonymous. */
export function onSessionExpired(listener: () => void): () => void {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

/**
 * Exchanges the refresh cookie for a new access token. Concurrent callers
 * share one in-flight request. Resolves null when there is no valid session.
 */
export function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = axios
      .post<ApiSuccess<SessionPayload>>(`${API_URL}/auth/refresh`, null, { withCredentials: true })
      .then((res) => {
        const token = res.data.data.accessToken;
        tokenStore.set(token);
        return token;
      })
      .catch(() => {
        tokenStore.clear();
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

const REFRESHABLE = new Set(['TOKEN_EXPIRED', 'NO_TOKEN', 'INVALID_TOKEN']);

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError<ApiErrorBody>) => {
    const config = error.config as RetryConfig | undefined;
    const status = error.response?.status;
    const code = error.response?.data?.error?.code;
    const isAuthRoute = config?.url?.includes('/auth/login') || config?.url?.includes('/auth/refresh');

    if (status === 401 && config && !config._retried && !isAuthRoute && (!code || REFRESHABLE.has(code))) {
      config._retried = true;
      const token = await refreshAccessToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
        return api(config);
      }
      sessionListeners.forEach((l) => l());
    }
    return Promise.reject(error);
  },
);

// ─── helpers ───────────────────────────────────────────────────────────────

export interface ApiError {
  status: number | null;
  code: string;
  message: string;
  details: { field: string; message: string }[];
}

export function toApiError(err: unknown): ApiError {
  if (axios.isAxiosError<ApiErrorBody>(err)) {
    const body = err.response?.data;
    if (body && body.success === false) {
      return { status: err.response?.status ?? null, code: body.error.code, message: body.error.message, details: body.error.details ?? [] };
    }
    if (err.code === 'ECONNABORTED' || err.message === 'Network Error') {
      return { status: null, code: 'NETWORK_ERROR', message: 'Cannot reach the server. It may be waking up — please try again in a moment.', details: [] };
    }
    return { status: err.response?.status ?? null, code: 'HTTP_ERROR', message: err.message, details: [] };
  }
  return { status: null, code: 'UNKNOWN', message: err instanceof Error ? err.message : 'Something went wrong', details: [] };
}

/** Typed request helpers that unwrap the response envelope. */
export async function get<T>(url: string, config?: AxiosRequestConfig) {
  const res = await api.get<ApiSuccess<T>>(url, config);
  return res.data;
}
export async function post<T>(url: string, body?: unknown, config?: AxiosRequestConfig) {
  const res = await api.post<ApiSuccess<T>>(url, body, config);
  return res.data;
}
export async function patch<T>(url: string, body?: unknown, config?: AxiosRequestConfig) {
  const res = await api.patch<ApiSuccess<T>>(url, body, config);
  return res.data;
}
export async function del<T>(url: string, config?: AxiosRequestConfig) {
  const res = await api.delete<ApiSuccess<T>>(url, config);
  return res.data;
}
