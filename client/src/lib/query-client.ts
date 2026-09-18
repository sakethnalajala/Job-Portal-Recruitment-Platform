import { QueryClient } from '@tanstack/react-query';
import { toApiError } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        const { status } = toApiError(error);
        // Never retry client errors; retry network / 5xx (Render cold start) a couple of times.
        if (status !== null && status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: { retry: false },
  },
});
