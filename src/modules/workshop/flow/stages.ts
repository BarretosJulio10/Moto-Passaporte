// Esteira da oficina (Fase A do plano de fluxo): agrupa as OS e os orçamentos que já existem nas
// 7 etapas do trabalho, com o próximo passo de cada moto. Só leitura; nada muda no banco.
import type { OrderRow, OrderStatus } from '../service-orders/api'
import type { QuoteRow } from '../quotes/api'
import type { Receivable } from '../management/api'

export type StageKey = 'entrada' | 'diagnostico' | 'orcamento' | 'aprovado' | 'pista' | 'caixa' | 'entregue'

export const STAGES: { key: StageKey; label: string; hint: string }[] = [
  { key: 'entrada', label: 'Entrada', hint: 'Moto chegou' },
  { key: 'diagnostico', label: 'Diagnóstico', hint: 'Mecânico olhando' },
  { key: 'orcamento', label: 'Orçamento', hint: 'Montar, enviar, cobrar resposta' },
  { key: 'aprovado', label: 'Aprovado', hint: 'Liberar para a pista' },
  { key: 'pista', label: 'Na pista', hint: 'Em execução' },
  { key: 'caixa', label: 'Caixa', hint: 'Conferir, cobrar, entregar' },
  { key: 'entregue', label: 'Entregue hoje', hint: 'Foi para o histórico' },
]

export type FlowCard = {
  id: string
  kind: 'order' | 'quote'
  stage: StageKey
  number: number
  plate: string | null
  vehicle: string
  customer: string
  mechanic: string | null
  since: string
  due: string | null
  badges: { label: string; tone: 'warn' | 'danger' | 'ok' | 'info' }[]
  customerId: string
  whatsapp: string | null
  action: string
  href: string
  pendingCents: number | null
}

const ORDER_STAGE: Record<OrderStatus, StageKey | null> = {
  open: 'entrada',
  awaiting_diagnosis: 'diagnostico',
  awaiting_approval: 'orcamento',
  awaiting_parts: 'aprovado',
  awaiting_execution: 'aprovado',
  awaiting_complement: 'orcamento',
  in_progress: 'pista',
  paused: 'pista',
  ready: 'caixa',
  completed: 'caixa',
  awaiting_pickup: 'caixa',
  delivered: 'entregue',
  canceled: null,
}

const ORDER_ACTION: Record<OrderStatus, string> = {
  open: 'Mandar para diagnóstico',
  awaiting_diagnosis: 'Ver diagnóstico',
  awaiting_approval: 'Cobrar aprovação',
  awaiting_complement: 'Enviar complementar',
  awaiting_parts: 'Conferir peças',
  awaiting_execution: 'Liberar para a pista',
  in_progress: 'Acompanhar',
  paused: 'Retomar',
  ready: 'Conferir e cobrar',
  completed: 'Cobrar e entregar',
  awaiting_pickup: 'Entregar',
  delivered: 'Ver',
  canceled: 'Ver',
}

export type OrderRowFlow = OrderRow & {
  delivered_at?: string | null
  opened_at_entry?: boolean
  diagnosed_at?: string | null
  entry_quote?: { id: string; number: number; status: string } | null
  status_changed_at?: string | null
  customer_whatsapp?: string | null
}

const vehicleOf = (r: { brand: string | null; model: string | null }) => [r.brand, r.model].filter(Boolean).join(' ') || 'Moto sem modelo'
const isToday = (iso: string | null | undefined, now: Date) => {
  if (!iso) return false
  const d = new Date(iso)
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

export function buildFlow(
  orgId: string,
  orders: OrderRowFlow[],
  quotes: QuoteRow[],
  receivables: Receivable[] | null,
  now = new Date(),
): FlowCard[] {
  const base = `/oficina/${orgId}`
  const pending = new Map((receivables ?? []).map((r) => [r.order_id, r.pending_cents]))
  const quotesWithOrder = new Set(orders.filter((o) => o.status !== 'canceled' && o.quote_number !== null).map((o) => o.quote_number))
  const cards: FlowCard[] = []

  const entryQuotes = new Set(orders.map((o) => o.entry_quote?.id).filter(Boolean) as string[])

  for (const o of orders) {
    let stage = ORDER_STAGE[o.status]
    if (!stage) continue
    let action = ORDER_ACTION[o.status]
    let href = `${base}/os/${o.id}`
    const entryBadges: FlowCard['badges'] = []
    // Entrada antes do orçamento (Fase B): enquanto não há item autorizado, a etapa vem do diagnóstico e do orçamento.
    if (o.opened_at_entry && o.items === 0 && stage !== 'entregue') {
      const q = o.entry_quote && !['canceled', 'rejected', 'expired'].includes(o.entry_quote.status) ? o.entry_quote : null
      if (o.status === 'open') { stage = 'entrada'; action = 'Mandar para diagnóstico' }
      else if (!o.diagnosed_at && !q) { stage = 'diagnostico'; action = 'Ver a moto' }
      else if (!q) {
        stage = 'orcamento'; action = 'Montar orçamento'
        entryBadges.push({ label: 'Diagnóstico pronto', tone: 'ok' })
        if (o.entry_quote) entryBadges.push({ label: 'Orçamento anterior recusado', tone: 'warn' })
      } else if (q.status === 'draft') { stage = 'orcamento'; action = 'Terminar e enviar'; href = `${base}/orcamentos/${q.id}`; entryBadges.push({ label: 'Rascunho', tone: 'info' }) }
      else if (q.status === 'sent' || q.status === 'viewed') {
        stage = 'orcamento'; action = 'Cobrar resposta'; href = `${base}/orcamentos/${q.id}`
        entryBadges.push(q.status === 'viewed' ? { label: 'Cliente abriu', tone: 'ok' } : { label: 'Cliente não abriu', tone: 'warn' })
      } else { stage = 'aprovado'; action = 'Passar itens para a OS'; entryBadges.push({ label: 'Aprovado', tone: 'ok' }) }
    } else if (o.status === 'open' && o.items > 0) {
      stage = 'aprovado'; action = 'Liberar para a pista'
    }
    if (stage === 'entregue' && !isToday(o.delivered_at ?? o.completed_at, now)) continue
    const badges: FlowCard['badges'] = [...entryBadges]
    const late = o.due_date && stage !== 'caixa' && stage !== 'entregue' && o.due_date < now.toISOString().slice(0, 10)
    if (late) badges.push({ label: 'Atrasada', tone: 'danger' })
    if (o.status === 'awaiting_parts') badges.push({ label: 'Aguardando peça', tone: 'warn' })
    if (o.status === 'paused') badges.push({ label: 'Pausada', tone: 'warn' })
    if (o.status === 'ready') badges.push({ label: 'Mecânico marcou pronto', tone: 'ok' })
    if (o.status === 'awaiting_pickup') badges.push({ label: 'Aguardando retirada', tone: 'info' })
    if (o.items > 0 && stage === 'pista') badges.push({ label: `${o.items_done}/${o.items} itens`, tone: 'info' })
    const due = pending.get(o.id)
    if (receivables && stage === 'caixa' && o.status !== 'ready') {
      badges.push(due && due > 0 ? { label: 'Saldo a receber', tone: 'warn' } : { label: 'Pago', tone: 'ok' })
    }
    cards.push({
      id: o.id, kind: 'order', stage, number: o.number, plate: o.plate, vehicle: vehicleOf(o), customer: o.customer_name,
      mechanic: o.mechanic_name, since: o.status_changed_at ?? o.created_at, due: o.due_date, badges,
      customerId: o.customer_id, whatsapp: o.customer_whatsapp ?? null,
      action, href, pendingCents: receivables ? (due ?? null) : null,
    })
  }

  for (const q of quotes) {
    if (entryQuotes.has(q.id)) continue
    let action: string
    const badges: FlowCard['badges'] = []
    let stage: StageKey = 'orcamento'
    if (q.status === 'draft') {
      action = 'Terminar e enviar'
      badges.push({ label: 'Rascunho', tone: 'info' })
    } else if (q.status === 'sent' || q.status === 'viewed') {
      action = 'Cobrar resposta'
      badges.push(q.viewed_at ? { label: 'Cliente abriu', tone: 'ok' } : { label: 'Cliente não abriu', tone: 'warn' })
      if (q.valid_until && q.valid_until <= now.toISOString().slice(0, 10)) badges.push({ label: 'Vence hoje', tone: 'danger' })
    } else if ((q.status === 'approved' || q.status === 'partially_approved') && !quotesWithOrder.has(q.number)) {
      stage = 'aprovado'
      action = 'Abrir OS'
      badges.push({ label: q.status === 'approved' ? 'Aprovado' : 'Aprovado em parte', tone: 'ok' })
    } else {
      continue
    }
    cards.push({
      id: q.id, kind: 'quote', stage, number: q.number, plate: q.plate, vehicle: vehicleOf(q), customer: q.customer_name,
      mechanic: null, since: q.sent_at ?? q.created_at, due: null, badges, action, href: `${base}/orcamentos/${q.id}`, pendingCents: null,
      customerId: q.customer_id, whatsapp: null,
    })
  }

  // Mais antigos primeiro dentro de cada etapa (quem espera há mais tempo aparece em cima).
  return cards.sort((a, b) => a.since.localeCompare(b.since))
}

/** "agora", "há 25 min", "há 3 h", "há 2 dias". */
export function waitLabel(since: string, now = new Date()): string {
  const min = Math.max(0, Math.floor((now.getTime() - new Date(since).getTime()) / 60000))
  if (min < 2) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.floor(h / 24)
  return `há ${d} dia${d === 1 ? '' : 's'}`
}

/** Cartão parado há muito tempo na etapa (entregue e caixa não contam como atraso de fluxo). */
export function isStale(card: FlowCard, now = new Date()): boolean {
  const hours = (now.getTime() - new Date(card.since).getTime()) / 3_600_000
  const limit: Partial<Record<StageKey, number>> = { entrada: 2, diagnostico: 24, orcamento: 48, aprovado: 48 }
  const l = limit[card.stage]
  return l !== undefined && hours > l
}

export function matches(card: FlowCard, term: string): boolean {
  const t = term.trim().toLowerCase().replace(/[\s-]/g, '')
  if (!t) return true
  return [card.plate ?? '', card.customer, card.vehicle, String(card.number)].some((v) => v.toLowerCase().replace(/[\s-]/g, '').includes(t))
}
