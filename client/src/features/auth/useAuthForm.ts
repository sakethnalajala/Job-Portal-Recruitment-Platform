import { useState } from 'react';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { toApiError, type ApiError } from '@/lib/api';

/**
 * Maps a backend error onto a react-hook-form instance: field-level details
 * become field errors, everything else becomes a form-level message.
 */
export function useServerError<T extends FieldValues>() {
  const [formError, setFormError] = useState<string | null>(null);

  const handle = (err: unknown, setError: UseFormSetError<T>): ApiError => {
    const apiErr = toApiError(err);
    setFormError(null);
    if (apiErr.details.length) {
      let matched = false;
      for (const d of apiErr.details) {
        const field = d.field.replace(/^body\./, '') as Path<T>;
        if (field) {
          setError(field, { type: 'server', message: d.message });
          matched = true;
        }
      }
      if (!matched) setFormError(apiErr.message);
    } else {
      setFormError(apiErr.message);
    }
    return apiErr;
  };

  return { formError, setFormError, handle };
}
