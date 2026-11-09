// Controle de Gastos (PRD 2.2, ADR-050). Contrato em docs/modules/SPENDING.md.
import { getSupabase } from '@/lib/supabase'
import type { MaintenanceCategory } from '@/modules/maintenance/labels'

export type SpendingScope = 'ownership' | 'all'
export type SpendingFilters = {
  period: PeriodKey
  from: string
  to: string
  category: MaintenanceCategory | ''
  /** '' = todas; '__none__' = "Feito por mim / sem oficina". */
  workshop: string
  source: '' | 'owner' | 'document' | 'workshop'
  scope: SpendingScope
  compare: boolean
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
  filters: { categories: MaintenanceCategory[]; workshops: string[] }
  months?: { month: string; cents: number; count: number; previous_cents: number | null }[]
  by_category?: { category: MaintenanceCategory; cents: number; count: number }[]
  by_workshop?: { workshop: string | null; cents: number; count: number }[]
  missing?: { id: string; service_date: string; title: string }[]
}

export type SpendingSnapshot = { month_cents: number; year_cents: number; year_entries: number; year_missing: number; entitled: boolean }

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
  period: 'this_year', from: '', to: '', category: '', workshop: '', source: '', scope: 'ownership', compare: false,
}

/** Filtros ↔ endereço da página (RF-02: voltar ao mesmo recorte). */
export function filtersFromParams(p: URLSearchParams): SpendingFilters {
  const period = PERIODS.some(([k]) => k === p.get('periodo')) ? (p.get('periodo') as PeriodKey) : DEFAULT_FILTERS.period
  const source = p.get('origem')
  return {
    period,
    from: p.get('de') ?? '',
    to: p.get('ate') ?? '',
    category: (p.get('categoria') ?? '') as MaintenanceCategory | '',
    workshop: p.get('oficina') ?? '',
    source: source === 'owner' || source === 'document' || source === 'workshop' ? source : '',
    scope: p.get('escopo') === 'tudo' ? 'all' : 'ownership',
    compare: p.get('comparar') === '1',
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
  return p
}

export async function fetchSpendingSummary(motorcycleId: string | null, f: SpendingFilters): Promise<SpendingSummary> {
  const r = periodRange(f.period, new Date(), { from: f.from, to: f.to })
  const { data, error } = await getSupabase().rpc('get_spending_summary' as never, {
    p_motorcycle: motorcycleId, p_from: r.from, p_to: r.to, p_scope: f.scope,
    p_category: f.category || null, p_workshop: f.workshop === '__none__' ? '' : f.workshop || null,
    p_source: f.source || null, p_compare: f.compare,
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
    category: t.category as MaintenanceCategory | '',
    workshop: t.workshop,
    source: t.source as SpendingFilters['source'],
    scope: 'all',
  }
  const q = filtersToParams(f).toString()
  return q ? `?${q}` : ''
}
