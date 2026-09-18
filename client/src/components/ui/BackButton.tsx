import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Goes back in history when there is an in-app page to return to; otherwise
 * navigates to `fallback`. React Router stores an `idx` in history.state, so
 * idx === 0 means this is the first entry of the session (deep link / refresh).
 */
export function useSmartBack(fallback: string) {
  const navigate = useNavigate();
  return () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  };
}

export function BackButton({ fallback = '/', label = 'Back', className }: { fallback?: string; label?: string; className?: string }) {
  const back = useSmartBack(fallback);
  return (
    <button
      type="button"
      onClick={back}
      className={cn(
        'group inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-muted transition-colors',
        'hover:bg-surface-2 hover:text-text active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
        className,
      )}
    >
      <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" aria-hidden />
      {label}
    </button>
  );
}
