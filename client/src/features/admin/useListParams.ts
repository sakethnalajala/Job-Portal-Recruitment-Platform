import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/** URL-backed list state (filters + page) so admin views are linkable and back-button friendly. */
export function useListParams(defaults: Record<string, string> = {}) {
  const [params, setParams] = useSearchParams();
  const getParam = (k: string) => params.get(k) ?? defaults[k] ?? '';
  const page = Number(params.get('page') ?? 1);

  const set = useCallback(
    (patch: Record<string, string | number | undefined>, resetPage = true) => {
      const next = new URLSearchParams(params);
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === '') next.delete(k);
        else next.set(k, String(v));
      }
      if (resetPage) next.delete('page');
      setParams(next);
    },
    [params, setParams],
  );

  return { get: getParam, page, set, setPage: (p: number) => set({ page: p }, false) };
}
