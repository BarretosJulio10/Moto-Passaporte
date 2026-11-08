// Vínculo do cliente da oficina com a conta Moto Passaporte (PRD 2.1 §4.3, ADR-048). Contrato em docs/modules/WORKSHOP_CUSTOMER_LINK.md.
import { rpc } from '@/modules/workshop/shared/rpc'

export type LinkKind = 'invite' | 'quote' | 'order'
/** Trecho da URL (português) ↔ tipo do link. */
export const KIND_SLUG: Record<LinkKind, string> = { invite: 'convite', quote: 'orcamento', order: 'os' }
export function kindFromSlug(slug: string | undefined): LinkKind | null {
  const hit = (Object.entries(KIND_SLUG) as [LinkKind, string][]).find(([, s]) => s === slug)
  return hit ? hit[0] : null
}
export function claimPath(kind: LinkKind, token: string) {
  return `/painel/vincular/${KIND_SLUG[kind]}/${token}`
}

export type LinkPreview =
  | { state: 'invalid' }
  | { state: 'open' | 'mine' | 'taken'; workshop: string; customer_first_name: string; vehicles: string[]; quotes: number; orders: number }
export const fetchLinkPreview = (kind: LinkKind, token: string) => rpc<LinkPreview>('get_customer_link_preview', { p_kind: kind, p_token: token })
export const claimCustomer = (kind: LinkKind, token: string) => rpc<{ ok: true; already: boolean; workshop?: string }>('claim_workshop_customer', { p_kind: kind, p_token: token })
export const unlinkMine = (customerId: string) => rpc<void>('unlink_my_workshop_customer', { p_customer: customerId })
export const createInvite = (org: string, customer: string) => rpc<{ token: string; expires_at: string }>('workshop_create_customer_invite', { p_org: org, p_customer: customer })
export const unlinkByWorkshop = (org: string, customer: string) => rpc<void>('workshop_unlink_customer', { p_org: org, p_customer: customer })

export function inviteText(p: { customerName: string; workshopName: string; link: string }) {
  const first = p.customerName.trim().split(/\s+/)[0] ?? ''
  return [
    `Olá, ${first}! Aqui é da ${p.workshopName}.`,
    'Pelo Moto Passaporte você acompanha seus orçamentos e serviços com a gente e guarda o histórico da sua moto.',
    `Crie sua conta (é grátis) e confirme por este link: ${p.link}`,
  ].join('\n')
}

export type MyRecords = {
  customer_id: string
  linked_at: string
  workshop: { name: string; slug: string | null; phone: string | null; whatsapp: string | null; city: string | null; state: string | null }
  vehicles: string[]
  quotes: { number: number; status: string; total_cents: number; approved_total_cents: number | null; sent_at: string | null; decided_at: string | null; is_complement: boolean; items: { description: string; quantity: number; subtotal_cents: number }[] }[]
  orders: { number: number; status: string; created_at: string; completed_at: string | null; delivered_at: string | null; final_total_cents: number | null; km_out: number | null; receipt_code: string | null; items: { description: string; status: 'pending' | 'done' | 'not_done'; part_brand: string | null }[] }[]
  appointments: { starts_at: string; status: string; service: string }[]
  reminders: { title: string; due_date: string | null; due_km: number | null }[]
}[]
export const fetchMyRecords = () => rpc<MyRecords>('get_my_workshop_records')
