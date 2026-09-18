import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FieldProps {
  label?: ReactNode;
  error?: string | undefined;
  hint?: string;
  leftIcon?: ReactNode;
}

const base =
  'w-full rounded-xl border bg-surface text-text placeholder:text-faint transition-colors ' +
  'focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500 ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

function Wrapper({ id, label, error, hint, children }: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-text-secondary">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldProps>(
  ({ className, label, error, hint, leftIcon, id: idProp, type = 'text', ...props }, ref) => {
    const autoId = useId();
    const id = idProp ?? autoId;
    const [show, setShow] = useState(false);
    const isPassword = type === 'password';
    return (
      <Wrapper id={id} label={label} error={error} hint={hint}>
        <div className="relative">
          {leftIcon && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">{leftIcon}</span>}
          <input
            ref={ref}
            id={id}
            type={isPassword && show ? 'text' : type}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
            className={cn(base, 'h-11 px-3.5 text-sm', leftIcon && 'pl-10', isPassword && 'pr-11', error ? 'border-danger focus:ring-danger/30 focus:border-danger' : 'border-border', className)}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? 'Hide password' : 'Show password'}
              className="absolute inset-y-0 right-3 flex items-center text-muted hover:text-text"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
        </div>
      </Wrapper>
    );
  },
);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps>(
  ({ className, label, error, hint, id: idProp, ...props }, ref) => {
    const autoId = useId();
    const id = idProp ?? autoId;
    return (
      <Wrapper id={id} label={label} error={error} hint={hint}>
        <textarea
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          className={cn(base, 'min-h-[110px] px-3.5 py-2.5 text-sm resize-y', error ? 'border-danger' : 'border-border', className)}
          {...props}
        />
      </Wrapper>
    );
  },
);
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & FieldProps>(
  ({ className, label, error, hint, id: idProp, children, ...props }, ref) => {
    const autoId = useId();
    const id = idProp ?? autoId;
    return (
      <Wrapper id={id} label={label} error={error} hint={hint}>
        <select ref={ref} id={id} aria-invalid={error ? true : undefined} className={cn(base, 'h-11 px-3.5 text-sm', error ? 'border-danger' : 'border-border', className)} {...props}>
          {children}
        </select>
      </Wrapper>
    );
  },
);
Select.displayName = 'Select';

export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; error?: string | undefined }>(
  ({ className, label, error, id: idProp, ...props }, ref) => {
    const autoId = useId();
    const id = idProp ?? autoId;
    return (
      <div className="space-y-1">
        <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 text-sm text-text-secondary">
          <input ref={ref} id={id} type="checkbox" className={cn('mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong accent-primary-600', className)} {...props} />
          <span>{label}</span>
        </label>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    );
  },
);
Checkbox.displayName = 'Checkbox';
