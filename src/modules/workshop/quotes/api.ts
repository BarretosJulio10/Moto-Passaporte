// Orçamentos da oficina (PRD 2.1 §6, §7 e §13). Contrato em docs/modules/QUOTES.md.
// Orçamento nunca gera registro de manutenção (§17.4).
import { rpc } from '../shared/rpc'
import type { Vehicle } from '../customers/api'

export type QuoteStatus = 'draft' | 'sent' | 'viewed' | 'partially_approved' | 'approved' | 'rejected' | 'expired' | 'canceled'
export type VersionStatus = 'draft' | 'sent' | 'decided' | 'superseded' | 'canceled'
export type ItemKind = 'labor' | 'part' | 'product' | 'material' | 'outsourced' | 'other'
export type DiscountType = 'none' | 'percent' | 'amount'

export const ITEM_KINDS: readonly ItemKind[] = ['labor', 'part', 'product', 'material', 'outsourced', 'other']
export const ITEM_KIND_LABEL: Record<ItemKind, string> = {
  labor: 'Mão de obra', part: 'Peça', product: 'Produto', material: 'Material', outsourced: 'Serviço terceirizado', other: 'Outros',
}

export const STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: 'Rascunho', sent: 'Enviado', viewed: 'Visualizado', partially_approved: 'Aprovado em parte',
  approved: 'Aprovado', rejected: 'Recusado', expired: 'Vencido', canceled: 'Cancelado',
}
export const VERSION_STATUS_LABEL: Record<VersionStatus, string> = {
  draft: 'Rascunho', sent: 'Enviada', decided: 'Respondida', superseded: 'Substituída por nova versão', canceled: 'Cancelada',
}
/** Situações que aguardam o cliente (PRD 2.1 §6.4: "aguardando aprovação"). */
export const AWAITING: QuoteStatus[] = ['sent', 'viewed']

export const STATUS_TONE: Record<QuoteStatus, string> = {
  draft: 'border-rule bg-paper text-muted',
  sent: 'border-ink/30 bg-sheet text-ink',
  viewed: 'border-ink/40 bg-ink/5 text-ink',
  partially_approved: 'border-ok/40 bg-ok/10 text-ok',
  approved: 'border-ok/40 bg-ok/10 text-ok',
  rejected: 'border-danger/40 bg-danger/10 text-danger',
  expired: 'border-brass/50 bg-brass/10 text-graphite',
  canceled: 'border-rule bg-paper text-muted line-through',
}

export const EVENT_LABEL: Record<string, string> = {
  created: 'Orçamento criado', complement_created: 'Orçamento complementar criado', version_created: 'Nova versão criada',
  discount_set: 'Desconto alterado', link_created: 'Link de aprovação criado', link_revoked: 'Link de aprovação desativado',
  whatsapp_prepared: 'Mensagem de WhatsApp preparada', printed: 'Impresso ou salvo em PDF', viewed: 'Cliente abriu o orçamento',
  approved: 'Cliente aprovou tudo', partially_approved: 'Cliente aprovou em parte', rejected: 'Cliente recusou',
  expired: 'Prazo venceu sem resposta', canceled: 'Orçamento cancelado',
}

export type QuoteItem = {
  id?: string
  position?: number
  kind: ItemKind
  description: string
  service_id: string | null
  quantity: number
  unit_price_cents: number
  subtotal_cents?: number
  notes: string | null
}

export type QuoteVersion = {
  id: string
  version_no: number
  status: VersionStatus
  km: number | null
  problem: string | null
  diagnosis: string | null
  notes: string | null
  payment_terms: string | null
  estimated_days: number | null
  valid_until: string
  price_table_id: string | null
  discount_type: DiscountType
  discount_value: number
  subtotal_cents: number
  discount_cents: number
  total_cents: number
  change_reason: string | null
  created_at: string
  sent_at: string | null
  created_by_name: string | null
  discount_set_by_name: string | null
  items: (QuoteItem & { id: string; position: number; subtotal_cents: number })[]
}

export type QuoteApproval = {
  id: string
  version_id: string
  decision: 'approved' | 'partial' | 'rejected'
  approved_positions: number[]
  rejected_positions: number[]
  approved_total_cents: number
  signer_name: string
  reason: string | null
  confirmation_text: string
  terms_version: string
  session_id: string | null
  receipt_code: string
  created_at: string
}

export type QuoteEvent = { id: number; kind: string; version_no: number | null; actor_label: string | null; data: Record<string, unknown>; created_at: string }

export type WorkshopHeader = {
  business_name: string
  legal_name: string | null
  cnpj: string | null
  phone: string | null
  whatsapp: string | null
  email: string | null
  address: string | null
  city: string | null
  state: string | null
  logo_url: string | null
}

export type Quote = {
  id: string
  organization_id: string
  number: number
  status: QuoteStatus
  current_version: number
  customer_id: string
  vehicle_id: string | null
  parent_quote_id: string | null
  complement_reason: string | null
  approved_total_cents: number | null
  decided_at: string | null
  canceled_reason: string | null
  created_at: string
  customer: { id: string; full_name: string; phone: string | null; whatsapp: string | null; email: string | null; address: string | null; has_cpf: boolean }
  vehicle: Vehicle | null
  parent: { id: string; number: number } | null
  complements: { id: string; number: number; status: QuoteStatus }[]
  workshop: WorkshopHeader
  versions: QuoteVersion[]
  approvals: QuoteApproval[]
  events: QuoteEvent[]
  link: {
    created_at: string
    expires_at: string
    revoked_at: string | null
    revoked_reason: string | null
    first_viewed_at: string | null
    last_viewed_at: string | null
    view_count: number
    decided_at: string | null
    active: boolean
  } | null
}

export type QuoteRow = {
  id: string
  number: number
  status: QuoteStatus
  current_version: number
  created_at: string
  decided_at: string | null
  approved_total_cents: number | null
  parent_quote_id: string | null
  total_cents: number
  valid_until: string
  sent_at: string | null
  customer_id: string
  customer_name: string
  brand: string | null
  model: string | null
  plate: string | null
  viewed_at: string | null
}

export type DraftInput = {
  vehicle_id?: string | null
  km?: string
  problem?: string
  diagnosis?: string
  notes?: string
  payment_terms?: string
  estimated_days?: string
  valid_until?: string
  price_table_id?: string | null
  discount_type: DiscountType
  discount_value: number
  items: QuoteItem[]
}

export type Totals = { subtotal_cents: number; discount_cents: number; total_cents: number }
export type LinkResult = { token: string; expires_at: string }

export type Dashboard = {
  today_quotes: number
  drafts: number
  awaiting: number
  awaiting_no_view: number
  expiring_soon: number
  expired_period: number
  approved_period: number
  rejected_period: number
  sent_period: number
  quoted_cents_period: number
  approved_cents_period: number
  awaiting_cents: number
  customers: number
  new_customers_period: number
  vehicles: number
  services: number
}

export const listQuotes = (org: string, status = '', search = '') =>
  rpc<QuoteRow[]>('workshop_list_quotes', { p_org: org, p_status: status || null, p_search: search || null })
export const fetchQuote = (org: string, id: string) => rpc<Quote>('workshop_get_quote', { p_org: org, p_quote: id })
export const createQuote = (org: string, customerId: string, vehicleId: string | null, parentId: string | null = null, reason: string | null = null) =>
  rpc<string>('workshop_create_quote', { p_org: org, p_customer: customerId, p_vehicle: vehicleId, p_parent: parentId, p_reason: reason })
export const saveDraft = (org: string, id: string, data: DraftInput) =>
  rpc<Totals>('workshop_save_quote_draft', { p_org: org, p_quote: id, p_data: data })
export const sendQuote = (org: string, id: string) => rpc<LinkResult>('workshop_send_quote', { p_org: org, p_quote: id })
export const reviseQuote = (org: string, id: string, reason: string) => rpc<number>('workshop_revise_quote', { p_org: org, p_quote: id, p_reason: reason })
export const revokeQuoteLink = (org: string, id: string) => rpc<void>('workshop_revoke_quote_link', { p_org: org, p_quote: id })
export const cancelQuote = (org: string, id: string, reason: string) => rpc<void>('workshop_cancel_quote', { p_org: org, p_quote: id, p_reason: reason })
export const logQuoteEvent = (org: string, id: string, kind: 'whatsapp_prepared' | 'printed') =>
  rpc<void>('workshop_log_quote_event', { p_org: org, p_quote: id, p_kind: kind })
export const fetchDashboard = (org: string, from?: string, to?: string) =>
  rpc<Dashboard>('workshop_dashboard', { p_org: org, p_from: from ?? null, p_to: to ?? null })

/** Mesmo cálculo do servidor (wq_recalc): a tela mostra antes de salvar; o banco recalcula sempre. */
export function computeTotals(items: Pick<QuoteItem, 'quantity' | 'unit_price_cents'>[], type: DiscountType, value: number): Totals {
  const subtotal = items.reduce((sum, i) => sum + Math.round((Number(i.quantity) || 0) * (i.unit_price_cents || 0)), 0)
  const discount =
    type === 'percent' ? Math.round((subtotal * Math.min(Math.max(value, 0), 100)) / 100)
      : type === 'amount' ? Math.min(Math.round(Math.max(value, 0) * 100), subtotal)
        : 0
  return { subtotal_cents: subtotal, discount_cents: discount, total_cents: subtotal - discount }
}

export function approvalLink(token: string, origin = window.location.origin) {
  return `${origin}/orcamento/${token}`
}

/** WhatsApp com DDI do Brasil quando o número tem só DDD + telefone. */
export function waNumber(digits: string | null | undefined): string {
  const d = (digits ?? '').replace(/\D/g, '')
  if (!d) return ''
  return d.length <= 11 ? `55${d}` : d
}

export function quoteWhatsappText(p: {
  customerName: string
  workshopName: string
  number: number
  vehicle: string | null
  totalCents: number
  validUntil: string
  link: string
  complement?: boolean
}) {
  const first = p.customerName.trim().split(/\s+/)[0] ?? ''
  const total = (p.totalCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const valid = new Date(`${p.validUntil}T12:00:00`).toLocaleDateString('pt-BR')
  return [
    `Olá, ${first}! Aqui é da ${p.workshopName}.`,
    `${p.complement ? 'Segue o orçamento complementar' : 'Segue o orçamento'} nº ${p.number}${p.vehicle ? ` da sua ${p.vehicle}` : ''}: total de ${total}.`,
    `Você pode ver os itens e aprovar tudo ou só parte por este link (válido até ${valid}):`,
    p.link,
  ].join('\n')
}

export function whatsappUrl(phoneDigits: string | null | undefined, text: string) {
  const n = waNumber(phoneDigits)
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`
}
