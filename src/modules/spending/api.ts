// Controle de Gastos (PRD 2.2, ADR-050). Contrato em docs/modules/SPENDING.md.
import { getSupabase } from '@/lib/supabase'
import { translateDbError } from '@/core/shared/dbErrors'
import { CATEGORY_LABEL } from '@/modules/maintenance/labels'
import { AttachmentError, prepareFile } from '@/modules/attachments/api'
import { buildStoragePath } from '@/modules/attachments/files'
import type { MaintenanceCategory } from '@/modules/maintenance/labels'

export type SpendingScope = 'ownership' | 'all'
export type SpendingFilters = {
  period: PeriodKey
  from: string
  to: string
  /** Categoria de serviço ou de despesa avulsa. */
  category: SpendingCategory | ''
  /** '' = todas; '__none__' = "Feito por mim / sem oficina". */
  workshop: string
  source: '' | 'owner' | 'document' | 'workshop'
  scope: SpendingScope
  compare: boolean
  kind: '' | EntryKind
}

export type SpendingSummary = {
  entitled: boolean
  scope: SpendingScope
  ownership_start: string | null
  from: string
  to: string
  total_cents: number
  entries: number
  missing_values: number
  monthly_average_cents: number | null
  service_cents?: number
  expense_cents?: number
  filters: { categories: SpendingCategory[]; workshops: string[] }
  km?: number | null
  cost_per_km_cents?: number | null
  year_projection_cents?: number | null
  year_to_date_cents?: number
  by_motorcycle?: { motorcycle_id: string; label: string; cents: number; count: number }[] | null
  months?: { month: string; cents: number; count: number; previous_cents: number | null }[]
  by_category?: { category: SpendingCategory; kind: EntryKind; cents: number; count: number }[]
  by_workshop?: { workshop: string | null; cents: number; count: number }[]
  missing?: { id: string; motorcycle_id: string; service_date: string; title: string }[]
}

export type SpendingSnapshot = {
  month_cents: number; year_cents: number; year_entries: number; year_missing: number; entitled: boolean
  /** Só no gratuito: quantas despesas avulsas ainda cabem neste mês. */
  expenses_left_this_month?: number | null
}

export type EntryKind = 'service' | 'expense'
export const EXPENSE_CATEGORIES = ['fuel', 'insurance', 'taxes_license', 'fine', 'parking_toll', 'gear', 'washing', 'financing', 'expense_other'] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]
export type SpendingCategory = MaintenanceCategory | ExpenseCategory
export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  fuel: 'Combustível',
  insurance: 'Seguro',
  taxes_license: 'IPVA e licenciamento',
  fine: 'Multa',
  parking_toll: 'Estacionamento e pedágio',
  gear: 'Acessórios e equipamentos',
  washing: 'Lavagem e estética',
  financing: 'Financiamento e consórcio',
  expense_other: 'Outras despesas',
}
export function isExpenseCategory(c: string): c is ExpenseCategory {
  return (EXPENSE_CATEGORIES as readonly string[]).includes(c)
}
export function categoryLabel(c: string): string {
  return isExpenseCategory(c) ? EXPENSE_CATEGORY_LABEL[c] : CATEGORY_LABEL[c as MaintenanceCategory] ?? c
}

export type SpendingEntry = {
  kind: EntryKind
  id: string
  motorcycle_id: string
  category: SpendingCategory
  title: string
  date: string
  workshop_name: string | null
  mileage: number | null
  value_cents: number | null
  has_receipt: boolean
  receipt_path: string | null
  receipt_name: string | null
}

export const PERIODS = [
  ['this_month', 'Este mês'],
  ['last_3', 'Últimos 3 meses'],
  ['last_6', 'Últimos 6 meses'],
  ['last_12', 'Últimos 12 meses'],
  ['this_year', 'Este ano'],
  ['last_year', 'Ano passado'],
  ['all', 'Tudo'],
  ['custom', 'Escolher datas'],
] as const
export type PeriodKey = (typeof PERIODS)[number][0]

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Datas (locais) do período escolhido. 'all' e 'custom' sem data = o banco decide pelo primeiro lançamento. */
export function periodRange(period: PeriodKey, today = new Date(), custom?: { from: string; to: string }): { from: string | null; to: string | null } {
  const y = today.getFullYear()
  const m = today.getMonth()
  switch (period) {
    case 'this_month': return { from: iso(new Date(y, m, 1)), to: iso(today) }
    case 'last_3': return { from: iso(new Date(y, m - 2, 1)), to: iso(today) }
    case 'last_6': return { from: iso(new Date(y, m - 5, 1)), to: iso(today) }
    case 'last_12': return { from: iso(new Date(y, m - 11, 1)), to: iso(today) }
    case 'this_year': return { from: iso(new Date(y, 0, 1)), to: iso(today) }
    case 'last_year': return { from: iso(new Date(y - 1, 0, 1)), to: iso(new Date(y - 1, 11, 31)) }
    case 'all': return { from: null, to: null }
    case 'custom': return { from: custom?.from || null, to: custom?.to || null }
  }
}

export const DEFAULT_FILTERS: SpendingFilters = {
  period: 'this_year', from: '', to: '', category: '', workshop: '', source: '', scope: 'ownership', compare: false, kind: '',
}

/** Filtros ↔ endereço da página (RF-02: voltar ao mesmo recorte). */
export function filtersFromParams(p: URLSearchParams): SpendingFilters {
  const period = PERIODS.some(([k]) => k === p.get('periodo')) ? (p.get('periodo') as PeriodKey) : DEFAULT_FILTERS.period
  const source = p.get('origem')
  const kind = p.get('tipo')
  return {
    period,
    from: p.get('de') ?? '',
    to: p.get('ate') ?? '',
    category: (p.get('categoria') ?? '') as SpendingCategory | '',
    workshop: p.get('oficina') ?? '',
    source: source === 'owner' || source === 'document' || source === 'workshop' ? source : '',
    scope: p.get('escopo') === 'tudo' ? 'all' : 'ownership',
    compare: p.get('comparar') === '1',
    kind: kind === 'servicos' ? 'service' : kind === 'despesas' ? 'expense' : '',
  }
}
export function filtersToParams(f: SpendingFilters): URLSearchParams {
  const p = new URLSearchParams()
  if (f.period !== DEFAULT_FILTERS.period) p.set('periodo', f.period)
  if (f.period === 'custom') {
    if (f.from) p.set('de', f.from)
    if (f.to) p.set('ate', f.to)
  }
  if (f.category) p.set('categoria', f.category)
  if (f.workshop) p.set('oficina', f.workshop)
  if (f.source) p.set('origem', f.source)
  if (f.scope === 'all') p.set('escopo', 'tudo')
  if (f.compare) p.set('comparar', '1')
  if (f.kind) p.set('tipo', f.kind === 'service' ? 'servicos' : 'despesas')
  return p
}

export async function fetchSpendingSummary(motorcycleId: string | null, f: SpendingFilters): Promise<SpendingSummary> {
  const r = periodRange(f.period, new Date(), { from: f.from, to: f.to })
  const { data, error } = await getSupabase().rpc('get_spending_summary' as never, {
    p_motorcycle: motorcycleId, p_from: r.from, p_to: r.to, p_scope: f.scope,
    p_category: f.category || null, p_workshop: f.workshop === '__none__' ? '' : f.workshop || null,
    p_source: f.source || null, p_compare: f.compare, p_kind: f.kind || null,
  } as never)
  if (error) throw error
  return data as unknown as SpendingSummary
}

export async function fetchSpendingSnapshot(motorcycleId: string | null = null): Promise<SpendingSnapshot> {
  const { data, error } = await getSupabase().rpc('get_spending_snapshot' as never, { p_motorcycle: motorcycleId } as never)
  if (error) throw error
  return data as unknown as SpendingSnapshot
}

/** "2026-03" → "mar/26". */
export function monthLabel(ym: string, long = false): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y ?? 2000, (m ?? 1) - 1, 1)
  return long
    ? d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    : `${d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}/${String(y).slice(2)}`
}

/** Soma dos valores que contam na linha do tempo (vigentes, não anulados, com valor) — RF-09. */
export function timelineTotal(entries: { status: string; is_void: boolean; service_value_cents: number | null }[]): { cents: number; withValue: number; missing: number } {
  let cents = 0
  let withValue = 0
  let missing = 0
  for (const e of entries) {
    if (e.status !== 'current' || e.is_void) continue
    if (e.service_value_cents == null) missing++
    else { cents += e.service_value_cents; withValue++ }
  }
  return { cents, withValue, missing }
}

/** Filtros da linha do tempo → endereço da página de gastos com o mesmo recorte (RF-09). */
export function timelineToSpendingQuery(t: { category: string; source: string; workshop: string; from: string; to: string }): string {
  const f: SpendingFilters = {
    ...DEFAULT_FILTERS,
    period: t.from || t.to ? 'custom' : 'all',
    from: t.from, to: t.to,
    category: t.category as SpendingCategory | '',
    workshop: t.workshop,
    source: t.source as SpendingFilters['source'],
    scope: 'all',
    kind: 'service',
  }
  const q = filtersToParams(f).toString()
  return q ? `?${q}` : ''
}

export async function fetchSpendingEntries(motorcycleId: string | null, f: SpendingFilters): Promise<SpendingEntry[]> {
  const r = periodRange(f.period, new Date(), { from: f.from, to: f.to })
  const { data, error } = await getSupabase().rpc('get_spending_entries' as never, {
    p_motorcycle: motorcycleId, p_from: r.from, p_to: r.to, p_scope: f.scope,
    p_category: f.category || null, p_workshop: f.workshop === '__none__' ? '' : f.workshop || null,
    p_source: f.source || null, p_kind: f.kind || null, p_limit: 300,
  } as never)
  if (error) throw error
  return (data ?? []) as unknown as SpendingEntry[]
}

// Despesas avulsas (RF-07) ------------------------------------------------------------
export const RECEIPT_BUCKET = 'expense-receipts'

export type ExpenseInput = {
  id?: string
  motorcycleId: string
  category: ExpenseCategory
  date: string
  valueCents: number
  description: string
  mileage: number | null
  receipt?: File | null
  removeReceipt?: boolean
}

/** Envia o comprovante (se houver) para a pasta da pessoa, grava a despesa e apaga o arquivo substituído. */
export async function saveExpense(userId: string, input: ExpenseInput): Promise<string> {
  const supabase = getSupabase()
  let path: string | null = null
  let name: string | null = null
  if (input.receipt) {
    const prepared = await prepareFile(input.receipt)
    path = buildStoragePath(userId, prepared.mime)
    name = prepared.name
    const up = await supabase.storage.from(RECEIPT_BUCKET).upload(path, prepared.blob, { contentType: prepared.mime, upsert: false })
    if (up.error) {
      if (/exceed|too large|maximum allowed size/i.test(up.error.message ?? '')) throw new AttachmentError('Arquivo grande demais.')
      throw new AttachmentError('Não foi possível enviar o comprovante. Tente de novo.')
    }
  }
  const { data, error } = await supabase.rpc('save_owner_expense' as never, {
    p_id: input.id ?? null, p_motorcycle: input.motorcycleId, p_category: input.category, p_expense_date: input.date,
    p_value_cents: input.valueCents, p_description: input.description || null, p_mileage: input.mileage,
    p_receipt_path: path, p_receipt_name: name, p_remove_receipt: Boolean(input.removeReceipt),
  } as never)
  if (error) {
    if (path) await supabase.storage.from(RECEIPT_BUCKET).remove([path])
    throw new Error(translateDbError(error))
  }
  const res = data as unknown as { id: string; remove_path: string | null }
  if (res.remove_path) await supabase.storage.from(RECEIPT_BUCKET).remove([res.remove_path])
  return res.id
}

export async function deleteExpense(id: string): Promise<void> {
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('delete_owner_expense' as never, { p_id: id } as never)
  if (error) throw new Error(translateDbError(error))
  const path = (data as unknown as { remove_path: string | null })?.remove_path
  if (path) await supabase.storage.from(RECEIPT_BUCKET).remove([path])
}

export async function receiptUrl(path: string): Promise<string> {
  const { data, error } = await getSupabase().storage.from(RECEIPT_BUCKET).createSignedUrl(path, 600)
  if (error || !data) throw new Error('Não foi possível abrir o comprovante.')
  return data.signedUrl
}

/** "R$ 0,57/km" a partir de centavos com fração. */
export function formatPerKm(cents: number | null | undefined): string {
  if (cents == null) return '—'
  return `${(cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })}/km`
}

// Exportar CSV (RF-11, Premium) ------------------------------------------------------
export type ExportRow = SpendingEntry & { motorcycle: string }

export async function fetchSpendingExport(motorcycleId: string | null, f: SpendingFilters): Promise<ExportRow[]> {
  const r = periodRange(f.period, new Date(), { from: f.from, to: f.to })
  const { data, error } = await getSupabase().rpc('get_spending_export' as never, {
    p_motorcycle: motorcycleId, p_from: r.from, p_to: r.to, p_scope: f.scope,
    p_category: f.category || null, p_workshop: f.workshop === '__none__' ? '' : f.workshop || null,
    p_source: f.source || null, p_kind: f.kind || null,
  } as never)
  if (error) throw new Error(translateDbError(error))
  return (data ?? []) as unknown as ExportRow[]
}

const csvCell = (v: string) => (/[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
const brDate = (iso: string) => iso.split('-').reverse().join('/')
const brMoney = (cents: number) => (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false })

/** CSV para o Excel brasileiro: separador ";", vírgula decimal, BOM para os acentos. Última linha = total. */
export function buildSpendingCsv(rows: ExportRow[]): string {
  const head = ['Data', 'Tipo', 'Moto', 'Categoria', 'Descrição', 'Oficina', 'Km', 'Valor (R$)']
  const lines = [...rows]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => [
      brDate(r.date), r.kind === 'service' ? 'Serviço' : 'Despesa avulsa', r.motorcycle ?? '', categoryLabel(r.category),
      r.title ?? '', r.workshop_name ?? '', r.mileage != null ? String(r.mileage) : '', r.value_cents != null ? brMoney(r.value_cents) : '',
    ].map(csvCell).join(';'))
  const total = rows.reduce((a, r) => a + (r.value_cents ?? 0), 0)
  lines.push(['', '', '', '', 'Total', '', '', brMoney(total)].join(';'))
  return '﻿' + [head.join(';'), ...lines].join('\r\n') + '\r\n'
}

export function downloadText(name: string, text: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
