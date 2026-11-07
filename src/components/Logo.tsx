import { Link } from 'react-router-dom'

/** Emblema: um selo circular (dourado) com a silhueta de um "A" de estrada. */
export function Emblem({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="6" fill="var(--color-ink)" />
      <circle cx="16" cy="16" r="9" fill="none" stroke="var(--color-brass)" strokeWidth="2" />
      <path
        d="M11 19.5 L16 10.5 L21 19.5"
        fill="none"
        stroke="var(--color-paper)"
        strokeWidth="2.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function Logo({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="inline-flex shrink-0 items-center gap-2 rounded-doc text-ink sm:gap-2.5" aria-label="Moto Passaporte — início">
      <Emblem className="h-7 w-7 sm:h-8 sm:w-8" />
      <span className="heading whitespace-nowrap text-[0.92rem] leading-none sm:text-[1.05rem]">Moto Passaporte</span>
    </Link>
  )
}
