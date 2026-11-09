import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ButtonLink } from '@/components/Button'
import { isStoreApp } from '@/core/pwa/storeApp'

const LINK = 'font-semibold text-ink underline underline-offset-4'

/**
 * Convite para a tela de planos. No app da Google Play não aparece nada (modo loja, ADR-063):
 * lá a compra não pode ser oferecida nem indicada.
 */
export function PremiumLink({ children, className = LINK, button = false }: { children: ReactNode; className?: string; button?: boolean }) {
  if (isStoreApp()) return null
  return button
    ? <ButtonLink className={className} to="/painel/plano">{children}</ButtonLink>
    : <Link to="/painel/plano" className={className}>{children}</Link>
}
