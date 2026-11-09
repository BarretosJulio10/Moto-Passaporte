// Planos e preços configuráveis (PRD 4, 7.4; ADR-018).
import { getSupabase } from '@/lib/supabase'
import type { Database } from '@/types/supabase'

export type BillingPeriod = 'none' | 'monthly' | 'semiannual' | 'annual'
export type PlanKind = 'free' | 'premium'

export type PublicPlan = {
  code: string
  kind: PlanKind
  billing_period: BillingPeriod
  name: string
  description: string | null
  price_cents: number
  currency: string
  price_note: string | null
  max_motorcycles: number
  storage_quota_mb: number
  features: string[]
  trial_days: number
  cancellation_text: string | null
  entitlements: Entitlement[]
  max_share_links: number
  /** Valor de cada moto além das incluídas no plano, no mesmo período (ADR-062). */
  extra_motorcycle_cents?: number
}

export type Entitlement = 'pdf_reports' | 'maintenance_reminders' | 'spending_insights'

export const ENTITLEMENT_LABEL: Record<Entitlement, string> = {
  pdf_reports: 'Relatórios em PDF',
  maintenance_reminders: 'Lembretes de manutenção',
  spending_insights: 'Análise de gastos',
}

export type MyPlan = {
  code: string
  kind: PlanKind
  name: string
  billing_period: BillingPeriod
  max_motorcycles: number
  storage_quota_mb: number
  motorcycles_used: number
  features: string[]
  entitlements: Entitlement[]
  max_share_links: number
  /** Premium por cortesia (bônus) em vigor e quando termina (ADR-037). */
  bonus?: boolean
  bonus_until?: string | null
  bonus_source?: 'admin' | 'welcome' | null
  /** Premium pago por período (Pix/débito/boleto): até quando (ADR-039). */
  paid_until?: string | null
}

export type AdminPlan = Database['public']['Functions']['admin_list_plans']['Returns'][number]
export type PlanHistoryEntry = Database['public']['Functions']['admin_get_plan_history']['Returns'][number]

export const PERIOD_LABEL: Record<BillingPeriod, string> = {
  none: 'Sem cobrança',
  monthly: 'Mensal',
  semiannual: 'Semestral',
  annual: 'Anual',
}

export const PERIOD_SUFFIX: Record<BillingPeriod, string> = {
  none: '',
  monthly: 'por mês',
  semiannual: 'a cada 6 meses',
  annual: 'por ano',
}

export function formatPlanPrice(cents: number): string {
  if (cents === 0) return 'Grátis'
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatQuota(mb: number): string {
  return mb >= 1024 && mb % 1024 === 0 ? `${mb / 1024} GB` : `${mb} MB`
}

export async function fetchPublicPlans(): Promise<PublicPlan[]> {
  const { data, error } = await getSupabase().rpc('get_public_plans')
  if (error) throw error
  return (data ?? []) as unknown as PublicPlan[]
}

export async function fetchMyPlan(): Promise<MyPlan> {
  const { data, error } = await getSupabase().rpc('get_my_plan')
  if (error) throw error
  return data as unknown as MyPlan
}

export async function adminListPlans(): Promise<AdminPlan[]> {
  const { data, error } = await getSupabase().rpc('admin_list_plans')
  if (error) throw error
  return data ?? []
}

export type PlanInput = {
  id: string | null
  code: string
  kind: PlanKind
  billing_period: BillingPeriod
  name: string
  description: string
  price_cents: number
  price_note: string
  max_motorcycles: number
  storage_quota_mb: number
  features: string[]
  trial_days: number
  cancellation_text: string
  is_public: boolean
  sort_order: number
  entitlements: Entitlement[]
  max_share_links: number
}

export async function adminSavePlan(p: PlanInput): Promise<string> {
  const { data, error } = await getSupabase().rpc('admin_save_plan', {
    p_id: p.id,
    p_code: p.id ? null : p.code,
    p_kind: p.id ? null : p.kind,
    p_billing_period: p.id ? null : p.billing_period,
    p_name: p.name,
    p_description: p.description,
    p_price_cents: p.price_cents,
    p_price_note: p.price_note,
    p_max_motorcycles: p.max_motorcycles,
    p_storage_quota_mb: p.storage_quota_mb,
    p_features: p.features,
    p_trial_days: p.trial_days,
    p_cancellation_text: p.cancellation_text,
    p_is_public: p.is_public,
    p_sort_order: p.sort_order,
  })
  if (error) throw error
  // Benefícios e limite de links ficam numa função própria (sem versão nova se nada mudou).
  const { error: e2 } = await getSupabase().rpc('admin_set_plan_benefits', {
    p_id: data,
    p_entitlements: p.entitlements,
    p_max_share_links: p.max_share_links,
  })
  if (e2) throw e2
  return data
}

/** Preço de cada moto além das incluídas no plano (ADR-062), com motivo auditado. */
export async function adminSetPlanExtraPrice(id: string, cents: number, reason: string): Promise<void> {
  const { error } = await getSupabase().rpc('admin_set_plan_extra_price' as never, { p_id: id, p_cents: cents, p_reason: reason } as never)
  if (error) throw error
}

export async function adminSetPlanActive(id: string, active: boolean): Promise<void> {
  const { error } = await getSupabase().rpc('admin_set_plan_active', { p_id: id, p_active: active })
  if (error) throw error
}

export async function adminPlanHistory(id: string): Promise<PlanHistoryEntry[]> {
  const { data, error } = await getSupabase().rpc('admin_get_plan_history', { p_id: id })
  if (error) throw error
  return data ?? []
}

export function hasEntitlement(plan: Pick<MyPlan, 'entitlements'> | undefined | null, key: Entitlement): boolean {
  return Boolean(plan?.entitlements?.includes(key))
}
