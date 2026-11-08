// Link público de aprovação (PRD 2.1 §7 e §20.2). O token vai só para a função; o banco guarda o hash.
import { rpc } from '../shared/rpc'
import type { DiscountType, ItemKind } from '../quotes/api'

export type PublicItem = {
  position: number
  kind: ItemKind
  description: string
  quantity: number
  unit_price_cents: number
  subtotal_cents: number
  notes: string | null
}

export type PublicDecision = {
  decision: 'approved' | 'partial' | 'rejected'
  approved_positions: number[]
  rejected_positions: number[]
  approved_total_cents: number
  signer_name: string
  reason: string | null
  receipt_code: string
  created_at: string
  terms_version: string
}

export type PublicQuote = {
  state: 'open' | 'expired' | 'decided'
  terms_version: string
  number: number
  version_no: number
  status: string
  is_complement: boolean
  complement_reason: string | null
  parent_number: number | null
  issued_at: string | null
  valid_until: string
  km: number | null
  problem: string | null
  diagnosis: string | null
  notes: string | null
  payment_terms: string | null
  estimated_days: number | null
  subtotal_cents: number
  discount_type: DiscountType
  discount_value: number
  discount_cents: number
  total_cents: number
  customer_name: string
  vehicle: { brand: string; model: string; version: string | null; year: number | null; plate: string | null; color: string | null } | null
  workshop: {
    business_name: string
    cnpj: string | null
    phone: string | null
    whatsapp: string | null
    email: string | null
    address: string | null
    city: string | null
    state: string | null
    logo_url: string | null
    public_slug: string | null
  }
  items: PublicItem[]
  decision: PublicDecision | null
}

export type PublicQuoteResult = PublicQuote | { state: 'not_found' } | { state: 'revoked' | 'replaced'; workshop?: string }

export const TERMS_VERSION = 'orcamento-v1'

export const fetchPublicQuote = (token: string) => rpc<PublicQuoteResult>('get_quote_by_token', { p_token: token })

export const decideQuote = (token: string, positions: number[], signer: string, confirmed: boolean, reason: string | null, session: string) =>
  rpc<PublicQuote>('decide_quote_by_token', {
    p_token: token, p_approved_positions: positions, p_signer_name: signer, p_confirmed: confirmed,
    p_reason: reason, p_session: session, p_terms_version: TERMS_VERSION,
  })

/** Mesmo cálculo do servidor: desconto proporcional aos itens aprovados. */
export function approvedTotal(p: Pick<PublicQuote, 'items' | 'discount_type' | 'discount_value' | 'discount_cents' | 'subtotal_cents'>, positions: number[]): number {
  const sub = p.items.filter((i) => positions.includes(i.position)).reduce((s, i) => s + i.subtotal_cents, 0)
  if (p.discount_type === 'percent') return sub - Math.round((sub * p.discount_value) / 100)
  if (p.discount_type === 'amount') return sub - (p.subtotal_cents > 0 ? Math.round((p.discount_cents * sub) / p.subtotal_cents) : 0)
  return sub
}
