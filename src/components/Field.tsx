import { useId, type InputHTMLAttributes, type ReactNode } from 'react'

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  error?: string
  hint?: string
}

export function TextField({ label, error, hint, className = '', ...props }: TextFieldProps) {
  const id = useId()
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ')
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-sm font-semibold text-graphite">
        {label}
      </label>
      <input
        id={id}
        {...props}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={`w-full rounded-doc border bg-sheet px-3.5 py-2.5 text-base text-graphite placeholder:text-muted/70 focus:border-ink focus:outline-none ${
          error ? 'border-danger' : 'border-rule'
        }`}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

export function CheckboxField({
  label,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; error?: string }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          {...props}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="mt-1 h-4 w-4 shrink-0 accent-ink"
        />
        <label htmlFor={id} className="text-sm text-graphite">
          {label}
        </label>
      </div>
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
