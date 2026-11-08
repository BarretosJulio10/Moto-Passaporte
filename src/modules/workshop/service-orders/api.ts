// Ordens de serviço (PRD 2.1 §8 e §9). Contrato em docs/modules/SERVICE_ORDERS.md.
// OS concluída ainda não gera registro no histórico da moto (Fase 3).
import { getSupabase } from '@/lib/supabase'
import { buildStoragePath } from '@/modules/attachments/files'
import { AttachmentError, prepareFile } from '@/modules/attachments/api'
import { rpc } from '../shared/rpc'
import type { ItemKind, QuoteStatus } from '../quotes/api'
import type { Vehicle } from '../customers/api'

export type OrderStatus =
  | 'open' | 'awaiting_diagnosis' | 'awaiting_approval' | 'awaiting_parts' | 'awaiting_execution' | 'in_progress'
  | 'paused' | 'awaiting_complement' | 'completed' | 'awaiting_pickup' | 'delivered' | 'canceled'

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  open: 'Aberta', awaiting_diagnosis: 'Aguardando diagnóstico', awaiting_approval: 'Aguardando aprovação',
  awaiting_parts: 'Aguardando peças', awaiting_execution: 'Aguardando execução', in_progress: 'Em execução', paused: 'Pausada',
  awaiting_complement: 'Aguardando serviço complementar', completed: 'Concluída', awaiting_pickup: 'Aguardando retirada',
  delivered: 'Entregue', canceled: 'Cancelada',
}
/** Situações que a equipe escolhe à mão; conclusão, retirada, entrega e cancelamento têm botões próprios. */
export const MANUAL_STATUSES: OrderStatus[] = [
  'open', 'awaiting_diagnosis', 'awaiting_approval', 'awaiting_parts', 'awaiting_execution', 'in_progress', 'paused', 'awaiting_complement',
]
export const CLOSED: OrderStatus[] = ['completed', 'awaiting_pickup', 'delivered', 'canceled']

export const ORDER_STATUS_TONE: Record<OrderStatus, string> = {
  open: 'border-ink/30 bg-sheet text-ink', awaiting_diagnosis: 'border-brass/50 bg-brass/10 text-graphite',
  awaiting_approval: 'border-brass/50 bg-brass/10 text-graphite', awaiting_parts: 'border-brass/50 bg-brass/10 text-graphite',
  awaiting_execution: 'border-ink/30 bg-sheet text-ink', in_progress: 'border-ink bg-ink text-sheet',
  paused: 'border-rule bg-paper text-muted', awaiting_complement: 'border-stamp/40 bg-stamp/10 text-stamp',
  completed: 'border-ok/40 bg-ok/10 text-ok', awaiting_pickup: 'border-ok/40 bg-ok/10 text-ok',
  delivered: 'border-ok bg-ok text-sheet', canceled: 'border-rule bg-paper text-muted line-through',
}

export type AuthMethod = 'presencial' | 'telefone' | 'whatsapp' | 'outro'
export const AUTH_METHODS: AuthMethod[] = ['presencial', 'telefone', 'whatsapp', 'outro']
export const AUTH_LABEL: Record<AuthMethod, string> = { presencial: 'Pessoalmente', telefone: 'Por telefone', whatsapp: 'Pelo WhatsApp', outro: 'Outro' }

export type ItemStatus = 'pending' | 'done' | 'not_done'
export const ITEM_STATUS_LABEL: Record<ItemStatus, string> = { pending: 'Pendente', done: 'Executado', not_done: 'Não executado' }

export type InspectionState = 'ok' | 'atencao' | 'avaria' | 'na'
export const STATE_LABEL: Record<InspectionState, string> = { ok: 'OK', atencao: 'Atenção', avaria: 'Avaria', na: 'Não se aplica' }
export const FUEL_LEVELS = ['reserva', '1/4', '1/2', '3/4', 'cheio'] as const

/** Itens padrão do checklist (PRD 2.1 §9.1 e §9.3). A oficina pode acrescentar itens livres. */
export const ENTRY_ITEMS: { key: string; label: string }[] = [
  { key: 'carenagem', label: 'Carenagem' }, { key: 'arranhoes', label: 'Arranhões' }, { key: 'amassados', label: 'Amassados' },
  { key: 'retrovisores', label: 'Retrovisores' }, { key: 'manetes', label: 'Manetes' }, { key: 'pneus', label: 'Pneus' },
  { key: 'rodas', label: 'Rodas' }, { key: 'farois', label: 'Faróis' }, { key: 'lanternas', label: 'Lanternas' },
  { key: 'painel', label: 'Painel' }, { key: 'acessorios', label: 'Acessórios' },
]
export const EXIT_ITEMS: { key: string; label: string }[] = [
  { key: 'servicos_conferidos', label: 'Serviços conferidos' }, { key: 'pecas_substituidas', label: 'Peças substituídas guardadas/mostradas' },
  { key: 'teste_rodagem', label: 'Teste de rodagem' }, { key: 'freios', label: 'Freios' }, { key: 'iluminacao', label: 'Iluminação' },
  { key: 'estado_visual', label: 'Estado visual na entrega' }, { key: 'limpeza', label: 'Limpeza' },
]
export const PHOTO_PHASE_LABEL = { entry: 'Entrada', work: 'Serviço', exit: 'Saída' } as const
export type PhotoPhase = keyof typeof PHOTO_PHASE_LABEL

export type InspectionItems = Record<string, { state: InspectionState; note?: string }>
export type Inspection = {
  id: string
  phase: 'entry' | 'exit'
  items: InspectionItems
  fuel_level: string | null
  keys_count: number | null
  km: number | null
  notes: string | null
  recorded_at: string
  recorded_by_name: string | null
  customer_ack_at: string | null
  customer_ack_name: string | null
}

export type OrderItem = {
  id: string
  position: number
  kind: ItemKind
  description: string
  quantity: number
  unit_price_cents: number
  subtotal_cents: number
  discount_cents: number
  source: 'quote' | 'complement' | 'manual'
  quote_id: string | null
  quote_number: number | null
  quote_position: number | null
  auth_method: AuthMethod | null
  auth_by_name: string | null
  auth_note: string | null
  status: ItemStatus
  part_brand: string | null
  part_code: string | null
  notes: string | null
  executed_at: string | null
  executed_by_name: string | null
}

export type OrderEvent = { id: number; kind: string; from_status: OrderStatus | null; to_status: OrderStatus | null; actor_label: string | null; data: Record<string, unknown>; created_at: string }

export type Order = {
  id: string
  organization_id: string
  number: number
  status: OrderStatus
  customer_id: string
  vehicle_id: string | null
  quote_id: string | null
  mechanic_user_id: string | null
  mechanic_name: string | null
  due_date: string | null
  km_in: number | null
  km_out: number | null
  notes: string | null
  technical_notes: string | null
  auth_method: AuthMethod | null
  auth_by_name: string | null
  auth_note: string | null
  adjustment_cents: number
  adjustment_reason: string | null
  final_total_cents: number | null
  completion_notes: string | null
  completed_at: string | null
  completed_by_name: string | null
  receipt_code: string | null
  delivered_at: string | null
  delivered_to_name: string | null
  delivered_by_name: string | null
  canceled_reason: string | null
  created_at: string
  created_by_name: string | null
  customer: { id: string; full_name: string; phone: string | null; whatsapp: string | null }
  vehicle: Vehicle | null
  quote: { id: string; number: number; status: QuoteStatus } | null
  complements: { id: string; number: number; status: QuoteStatus; included: boolean }[]
  workshop: { business_name: string; cnpj: string | null; phone: string | null; whatsapp: string | null; email: string | null; address: string | null; city: string | null; state: string | null; logo_url: string | null }
  items: OrderItem[]
  inspections: Partial<Record<'entry' | 'exit', Inspection>>
  photos: { id: string; phase: PhotoPhase; storage_path: string; caption: string | null; created_at: string; created_by_name: string | null }[]
  events: OrderEvent[]
  links: { purpose: 'entry_ack' | 'receipt'; created_at: string; expires_at: string; first_viewed_at: string | null; view_count: number; active: boolean }[]
  team: { user_id: string; name: string }[]
}

export type OrderRow = {
  id: string
  number: number
  status: OrderStatus
  created_at: string
  due_date: string | null
  completed_at: string | null
  final_total_cents: number | null
  quote_number: number | null
  customer_id: string
  customer_name: string
  brand: string | null
  model: string | null
  plate: string | null
  mechanic_name: string | null
  items: number
  items_done: number
  authorized_cents: number
}

export type OrdersSummary = {
  active: number
  in_progress: number
  awaiting_diagnosis: number
  awaiting_parts: number
  ready_pickup: number
  late: number
  completed_period: number
  completed_cents_period: number
  in_execution_cents: number
  mine: number
}

export type ManualItem = { kind: ItemKind; description: string; quantity: number; unit_price_cents: number; notes?: string | null }

export const listOrders = (org: string, status = '', search = '', mine = false) =>
  rpc<OrderRow[]>('workshop_list_orders', { p_org: org, p_status: status || null, p_search: search || null, p_mine: mine })
export const fetchOrder = (org: string, id: string) => rpc<Order>('workshop_get_order', { p_org: org, p_order: id })
export const createOrderFromQuote = (org: string, quoteId: string) => rpc<string>('workshop_create_order_from_quote', { p_org: org, p_quote: quoteId })
export const createOrderManual = (org: string, p: { customerId: string; vehicleId: string | null; method: AuthMethod; by: string; note: string; items: ManualItem[]; km: number | null }) =>
  rpc<string>('workshop_create_order_manual', {
    p_org: org, p_customer: p.customerId, p_vehicle: p.vehicleId, p_auth_method: p.method, p_auth_by: p.by, p_auth_note: p.note,
    p_items: p.items, p_km: p.km,
  })
export const addOrderItem = (org: string, id: string, item: ManualItem, method: AuthMethod, by: string, note: string) =>
  rpc<void>('workshop_add_order_item', { p_org: org, p_order: id, p_item: item, p_auth_method: method, p_auth_by: by, p_auth_note: note })
export const addComplement = (org: string, id: string, quoteId: string) =>
  rpc<number>('workshop_add_complement_to_order', { p_org: org, p_order: id, p_quote: quoteId })
export const setOrderStatus = (org: string, id: string, status: OrderStatus, note = '') =>
  rpc<void>('workshop_set_order_status', { p_org: org, p_order: id, p_status: status, p_note: note })
export const updateOrder = (org: string, id: string, data: { mechanic_user_id?: string | null; due_date?: string | null; km_in?: string; notes?: string }) =>
  rpc<void>('workshop_update_order', { p_org: org, p_order: id, p_data: data })
export const updateOrderItem = (org: string, id: string, itemId: string, data: { status?: ItemStatus; part_brand?: string; part_code?: string; notes?: string }) =>
  rpc<void>('workshop_update_order_item', { p_org: org, p_order: id, p_item: itemId, p_data: data })
export const setTechnicalNotes = (org: string, id: string, notes: string) =>
  rpc<void>('workshop_set_technical_notes', { p_org: org, p_order: id, p_notes: notes })
export const saveInspection = (org: string, id: string, phase: 'entry' | 'exit', data: { items: InspectionItems; fuel_level?: string; keys_count?: string; km?: string; notes?: string }) =>
  rpc<void>('workshop_save_inspection', { p_org: org, p_order: id, p_phase: phase, p_data: data })
export const removePhoto = (org: string, id: string, photoId: string) =>
  rpc<void>('workshop_remove_os_photo', { p_org: org, p_order: id, p_photo: photoId })
export const completeOrder = (org: string, id: string, kmOut: number, notes: string, adjustmentCents: number, adjustmentReason: string) =>
  rpc<{ final_total_cents: number; receipt_code: string }>('workshop_complete_order', {
    p_org: org, p_order: id, p_km_out: kmOut, p_notes: notes, p_adjustment_cents: adjustmentCents, p_adjustment_reason: adjustmentReason,
  })
export const notifyPickup = (org: string, id: string) => rpc<void>('workshop_notify_pickup', { p_org: org, p_order: id })
export const deliverOrder = (org: string, id: string, to: string, notes = '') =>
  rpc<void>('workshop_deliver_order', { p_org: org, p_order: id, p_delivered_to: to, p_notes: notes })
export const cancelOrder = (org: string, id: string, reason: string) => rpc<void>('workshop_cancel_order', { p_org: org, p_order: id, p_reason: reason })
export const createOrderLink = (org: string, id: string, purpose: 'entry_ack' | 'receipt') =>
  rpc<{ token: string; expires_at: string }>('workshop_create_order_link', { p_org: org, p_order: id, p_purpose: purpose })
export const fetchOrdersSummary = (org: string, from?: string, to?: string) =>
  rpc<OrdersSummary>('workshop_orders_summary', { p_org: org, p_from: from ?? null, p_to: to ?? null })
export const fetchCustomerOrders = (org: string, customerId: string) =>
  rpc<{ id: string; number: number; status: OrderStatus; created_at: string; final_total_cents: number | null; vehicle_id: string | null }[]>(
    'workshop_customer_orders', { p_org: org, p_customer: customerId })

export function orderLink(token: string, origin = window.location.origin) {
  return `${origin}/os/${token}`
}

/** Valor dos itens (com o desconto do orçamento distribuído). */
export function itemNet(i: Pick<OrderItem, 'subtotal_cents' | 'discount_cents'>) {
  return i.subtotal_cents - i.discount_cents
}

/** Fotos: bucket privado da oficina, conferência do conteúdo no servidor (ADR-033) e registro na OS. */
export const WORKSHOP_BUCKET = 'workshop-files'

export async function uploadOrderPhoto(org: string, orderId: string, file: File, phase: PhotoPhase, caption = ''): Promise<string> {
  const prepared = await prepareFile(file)
  if (prepared.mime === 'application/pdf') throw new AttachmentError('Envie uma foto (JPG, PNG ou WebP).')
  const supabase = getSupabase()
  const path = buildStoragePath(org, prepared.mime)
  const up = await supabase.storage.from(WORKSHOP_BUCKET).upload(path, prepared.blob, { contentType: prepared.mime, upsert: false, cacheControl: '3600' })
  if (up.error) {
    const msg = up.error.message ?? ''
    if (/exceed|too large|maximum allowed size/i.test(msg)) throw new AttachmentError('Foto grande demais (máximo 10 MB).')
    throw new AttachmentError('Não foi possível enviar a foto. Tente de novo.')
  }
  const { error } = await supabase.functions.invoke('attachment-check', { body: { path, bucket: WORKSHOP_BUCKET } })
  if (error) throw new AttachmentError('A foto não passou na conferência. Envie outra imagem.')
  return rpc<string>('workshop_register_os_photo', { p_org: org, p_order: orderId, p_path: path, p_phase: phase, p_caption: caption })
}

export async function photoUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {}
  const { data, error } = await getSupabase().storage.from(WORKSHOP_BUCKET).createSignedUrls(paths, 600)
  if (error) throw error
  const out: Record<string, string> = {}
  for (const item of data ?? []) if (item.path && item.signedUrl) out[item.path] = item.signedUrl
  return out
}
