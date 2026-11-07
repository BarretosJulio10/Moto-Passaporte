import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'

type Variant = 'primary' | 'secondary' | 'quiet' | 'inverse'
type Size = 'md' | 'sm'

// Tamanho e variante ficam em mapas separados para que classes não se anulem.
const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-doc font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60'

const sizes: Record<Size, string> = {
  md: 'px-5 py-3 text-[0.95rem]',
  sm: 'px-3 py-2 text-sm sm:px-4 sm:py-2.5 sm:text-[0.95rem]',
}

const variants: Record<Variant, string> = {
  primary: 'bg-ink text-sheet hover:bg-ink-soft',
  secondary: 'border border-ink/30 bg-transparent text-ink hover:border-ink hover:bg-sheet',
  quiet: 'text-ink underline-offset-4 hover:underline',
  inverse: 'bg-sheet text-ink hover:bg-paper',
}

function classes(variant: Variant, size: Size, extra: string) {
  const sizing = variant === 'quiet' ? 'px-2 py-2 text-sm sm:text-[0.95rem]' : sizes[size]
  return `${base} ${sizing} ${variants[variant]} ${extra}`
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  loading = false,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean; children: ReactNode }) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      aria-busy={loading || undefined}
      className={classes(variant, size, className)}
    >
      {children}
    </button>
  )
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: LinkProps & { variant?: Variant; size?: Size }) {
  return <Link {...props} className={classes(variant, size, className)} />
}
