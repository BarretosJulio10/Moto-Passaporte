// Gestão da oficina (PRD 2.1 Fase 4): peças, financeiro, agenda, lembretes, recuperação e relatórios.
// Contrato em docs/modules/WORKSHOP_MANAGEMENT.md. Tudo passa por funções que conferem a oficina e a permissão.
import { rpc } from '../shared/rpc'

// ---------- Peças ----------
export const PART_UNITS = ['un', 'par', 'jogo', 'kit', 'l', 'ml', 'm', 'kg', 'g'] as const
export type PartUnit = (typeof PART_UNITS)[number]
export type Part = {
  id: string
  name: string
  internal_code: string | null
  category: string | null
  manufacturer: string | null
  compatible_brand: string | null
  compatible_models: string | null
  cost_cents?: number | null
  sale_cents: number | null
  unit: PartUnit
  notes: string | null
  active: boolean
}
export type PartInput = Omit<Part, 'id'>

export const listParts = (org: string, search = '', includeInactive = false) =>
  rpc<Part[]>('workshop_list_parts', { p_org: org, p_search: search || null, p_include_inactive: includeInactive })
export const savePart = (org: string, id: string | null, data: Partial<PartInput>) =>
  rpc<string>('workshop_save_part', { p_org: org, p_id: id, p_data: data })

/** Margem sobre a venda, em %; null se faltar custo ou venda. */
export function partMargin(cost: number | null | undefined, sale: number | null | undefined): number | null {
  if (cost == null || sale == null || sale <= 0) return null
  return Math.round(((sale - cost) / sale) * 1000) / 10
}

// ---------- Financeiro ----------
export const PAY_METHODS = ['dinheiro', 'pix', 'debito', 'credito', 'transferencia', 'outro'] as const
export type PayMethod = (typeof PAY_METHODS)[number]
export const PAY_LABEL: Record<PayMethod, string> = {
  dinheiro: 'Dinheiro', pix: 'Pix', debito: 'Débito', credito: 'Crédito', transferencia: 'Transferência', outro: 'Outro',
}
export type Payment = {
  id: string
  order_id: string
  amount_cents: number
  method: PayMethod
  paid_at: string
  notes: string | null
  voided_at: string | null
  void_reason: string | null
  created_by_name?: string | null
  order_number?: number
  customer_name?: string
}
export type OrderPayments = { due_cents: number; paid_cents: number; pending_cents: number; final: boolean; payments: Payment[] }
export type Receivable = {
  order_id: string
  order_number: number
  customer_id: string
  customer_name: string
  whatsapp: string | null
  status: string
  completed_at: string
  due_cents: number
  paid_cents: number
  pending_cents: number
}
export type Finance = {
  received_cents: number
  by_method: Partial<Record<PayMethod, number>>
  by_day: { day: string; cents: number }[]
  completed_cents: number
  discounts_cents: number
  payments: Payment[]
  receivables: Receivable[]
  pending_total_cents: number
}

export const fetchOrderPayments = (org: string, order: string) => rpc<OrderPayments>('workshop_order_payments', { p_org: org, p_order: order })
export const recordPayment = (org: string, order: string, cents: number, method: PayMethod, paidAt: string | null, notes: string) =>
  rpc<string>('workshop_record_payment', { p_org: org, p_order: order, p_amount_cents: cents, p_method: method, p_paid_at: paidAt || null, p_notes: notes || null })
export const voidPayment = (org: string, payment: string, reason: string) =>
  rpc<void>('workshop_void_payment', { p_org: org, p_payment: payment, p_reason: reason })
export const fetchFinance = (org: string, from: string, to: string) => rpc<Finance>('workshop_finance', { p_org: org, p_from: from, p_to: to })

// ---------- Agenda ----------
export const APPT_STATUSES = ['requested', 'confirmed', 'awaiting_arrival', 'in_service', 'done', 'canceled', 'no_show'] as const
export type ApptStatus = (typeof APPT_STATUSES)[number]
export const APPT_LABEL: Record<ApptStatus, string> = {
  requested: 'Solicitado', confirmed: 'Confirmado', awaiting_arrival: 'Aguardando chegada', in_service: 'Em atendimento',
  done: 'Concluído', canceled: 'Cancelado', no_show: 'Não compareceu',
}
export const APPT_TONE: Record<ApptStatus, string> = {
  requested: 'border-amber-300 bg-amber-50 text-amber-900', confirmed: 'border-sky-300 bg-sky-50 text-sky-900',
  awaiting_arrival: 'border-sky-300 bg-sky-50 text-sky-900', in_service: 'border-violet-300 bg-violet-50 text-violet-900',
  done: 'border-emerald-300 bg-emerald-50 text-emerald-900', canceled: 'border-rule bg-paper text-muted', no_show: 'border-red-300 bg-red-50 text-red-900',
}
export type Appointment = {
  id: string
  customer_id: string | null
  vehicle_id: string | null
  contact_name: string | null
  contact_phone: string | null
  starts_at: string
  duration_minutes: number
  service_description: string
  responsible_user_id: string | null
  responsible_name: string | null
  status: ApptStatus
  notes: string | null
  quote_id: string | null
  order_id: string | null
  source: 'equipe' | 'publico'
  vehicle_text: string | null
  consent_at: string | null
  customer_name: string | null
  customer_whatsapp: string | null
  vehicle_label: string | null
}
export type AppointmentInput = {
  customer_id?: string | null
  vehicle_id?: string | null
  contact_name?: string
  contact_phone?: string
  starts_at: string
  duration_minutes?: number
  service_description: string
  responsible_user_id?: string | null
  status?: ApptStatus
  notes?: string
}
export const listAppointments = (org: string, from: Date, to: Date) =>
  rpc<Appointment[]>('workshop_list_appointments', { p_org: org, p_from: from.toISOString(), p_to: to.toISOString() })
export const saveAppointment = (org: string, id: string | null, data: AppointmentInput) =>
  rpc<string>('workshop_save_appointment', { p_org: org, p_id: id, p_data: data })
export const setAppointmentStatus = (org: string, id: string, status: ApptStatus, quote?: string, order?: string) =>
  rpc<void>('workshop_set_appointment_status', { p_org: org, p_id: id, p_status: status, p_quote: quote ?? null, p_order: order ?? null })

export type AgendaView = 'dia' | 'semana' | 'mes'
/** Início e fim (exclusivo) do período, no horário local. Semana começa na segunda. */
export function agendaRange(view: AgendaView, ref: Date): { from: Date; to: Date } {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate())
  if (view === 'dia') return { from: d, to: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1) }
  if (view === 'semana') {
    const back = (d.getDay() + 6) % 7
    const from = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back)
    return { from, to: new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7) }
  }
  return { from: new Date(d.getFullYear(), d.getMonth(), 1), to: new Date(d.getFullYear(), d.getMonth() + 1, 1) }
}
export function shiftRef(view: AgendaView, ref: Date, dir: 1 | -1): Date {
  if (view === 'dia') return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + dir)
  if (view === 'semana') return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + 7 * dir)
  return new Date(ref.getFullYear(), ref.getMonth() + dir, 1)
}
export function localDayKey(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ---------- Lembretes e relacionamento ----------
export const REMINDER_KINDS = ['date', 'km', 'interval', 'revision', 'recommendation'] as const
export type ReminderKind = (typeof REMINDER_KINDS)[number]
export const REMINDER_LABEL: Record<ReminderKind, string> = {
  date: 'Por data', km: 'Por quilometragem', interval: 'Intervalo recomendado', revision: 'Revisão periódica', recommendation: 'Recomendação técnica',
}
export type Reminder = {
  id: string
  customer_id: string
  vehicle_id: string | null
  order_id: string | null
  kind: ReminderKind
  title: string
  due_date: string | null
  due_km: number | null
  notes: string | null
  status: 'open' | 'done' | 'dismissed'
  last_contact_at: string | null
  customer_name?: string
  whatsapp?: string | null
  vehicle_label?: string | null
  vehicle_km?: number | null
  due?: boolean
}
export type ReminderInput = { customer_id: string; vehicle_id?: string | null; order_id?: string | null; kind: ReminderKind; title: string; due_date?: string; due_km?: string; notes?: string }
export const saveReminder = (org: string, id: string | null, data: ReminderInput) =>
  rpc<string>('workshop_save_reminder', { p_org: org, p_id: id, p_data: data })
export const setReminderStatus = (org: string, id: string, status: Reminder['status']) =>
  rpc<void>('workshop_set_reminder_status', { p_org: org, p_id: id, p_status: status })

export type ContactReason = 'quote_followup' | 'reminder' | 'return' | 'pickup' | 'campaign' | 'other'
export const CONTACT_LABEL: Record<ContactReason, string> = {
  quote_followup: 'Retorno de orçamento', reminder: 'Lembrete de manutenção', return: 'Convite para voltar', pickup: 'Moto pronta', campaign: 'Campanha', other: 'Outro',
}
export const logContact = (org: string, customer: string, reason: ContactReason, reference: string | null, note = '') =>
  rpc<void>('workshop_log_contact', { p_org: org, p_customer: customer, p_reason: reason, p_reference: reference, p_channel: 'whatsapp', p_note: note || null })

export type QuoteFollow = { quote_id: string; number: number; status: string; customer_id: string; customer_name: string; whatsapp: string | null; total_cents: number; sent_at?: string; valid_until?: string; updated_at?: string; last_contact_at?: string | null }
export type Relationship = {
  reminders: Reminder[]
  open_quotes: QuoteFollow[]
  lost_quotes: QuoteFollow[]
  inactive_customers: { customer_id: string; customer_name: string; whatsapp: string | null; last_visit: string; last_contact_at: string | null }[]
}
export const fetchRelationship = (org: string, inactiveDays = 180) =>
  rpc<Relationship>('workshop_relationship', { p_org: org, p_inactive_days: inactiveDays, p_quote_days: 2 })

export type CustomerContacts = {
  contacts: { reason: ContactReason; channel: string; note: string | null; created_at: string; by: string | null }[]
  reminders: Reminder[]
  payments: { order_number: number; amount_cents: number; method: PayMethod; paid_at: string; voided: boolean }[] | null
}
export const fetchCustomerContacts = (org: string, customer: string) =>
  rpc<CustomerContacts>('workshop_customer_contacts', { p_org: org, p_customer: customer })

/** Mensagens prontas de WhatsApp (PRD 2.1 §14.2). A equipe revisa e envia; o sistema não envia sozinho. */
export function contactMessage(reason: ContactReason, p: { customerName: string; workshopName: string; detail?: string }): string {
  const first = p.customerName.trim().split(/\s+/)[0] ?? ''
  const hi = `Olá, ${first}! Aqui é da ${p.workshopName}.`
  switch (reason) {
    case 'quote_followup': return `${hi}\nPassando para saber se conseguiu ver o orçamento${p.detail ? ` ${p.detail}` : ''}. Ficou alguma dúvida? Podemos ajustar o que precisar.`
    case 'reminder': return `${hi}\nEstá chegando a hora de: ${p.detail ?? 'fazer a manutenção da sua moto'}. Quer agendar um horário?`
    case 'return': return `${hi}\nFaz um tempo que sua moto não passa por aqui. Que tal uma revisão? Estamos à disposição para agendar.`
    case 'pickup': return `${hi}\nSua moto está pronta para retirada.${p.detail ? ` ${p.detail}` : ''}`
    default: return `${hi}\n${p.detail ?? ''}`.trim()
  }
}

// ---------- Relatórios ----------
export type Reports = {
  commercial: { created: number; approved: number; rejected: number; expired: number; avg_quote_cents: number; approved_cents: number }
  top_services: { description: string; count: number; cents: number }[]
  operational: { completed: number; active: number; avg_hours: number; pending_items: number }
  by_mechanic: { name: string; items_done: number; cents: number }[]
  financial: Omit<Finance, 'payments' | 'receivables'> | null
}
export const fetchReports = (org: string, from: string, to: string) => rpc<Reports>('workshop_reports', { p_org: org, p_from: from, p_to: to })

/** Taxa de aprovação em % (aprovados sobre decididos); 0 quando nada foi decidido. */
export function approvalRate(c: Reports['commercial']): number {
  const decided = c.approved + c.rejected + c.expired
  return decided === 0 ? 0 : Math.round((c.approved / decided) * 100)
}

// ---------- Utilidades ----------
export function todayIso(): string {
  return localDayKey(new Date())
}
export function monthStartIso(ref = new Date()): string {
  return localDayKey(new Date(ref.getFullYear(), ref.getMonth(), 1))
}
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR')
}

/** CSV com ";" (abre direto no Excel em português) e BOM para acentos. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n')
}
export function centsCsv(cents: number | null | undefined): string {
  return cents == null ? '' : (cents / 100).toFixed(2).replace('.', ',')
}
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Tempo médio por etapa das OS entregues no período (fluxo da oficina, Fase D).
export type StageTimes = { orders: number; diagnosis_hours: number | null; approval_hours: number | null; execution_hours: number | null; pickup_hours: number | null; total_hours: number | null }
export const fetchStageTimes = (org: string, from: string, to: string) => rpc<StageTimes>('workshop_stage_times', { p_org: org, p_from: from, p_to: to })
