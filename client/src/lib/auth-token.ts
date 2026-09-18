/**
 * The access token lives only in memory (never localStorage) so XSS cannot
 * exfiltrate a long-lived credential. Session continuity across reloads comes
 * from the httpOnly refresh cookie via POST /auth/refresh.
 */
let accessToken: string | null = null;
const listeners = new Set<(token: string | null) => void>();

export const tokenStore = {
  get: () => accessToken,
  set(token: string | null) {
    accessToken = token;
    listeners.forEach((l) => l(token));
  },
  clear() {
    tokenStore.set(null);
  },
  subscribe(listener: (token: string | null) => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
