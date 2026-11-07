// Painel administrativo (PRD 7; ADR-023). Ações sensíveis exigem motivo, gravado na auditoria.
import { getSupabase } from '@/lib/supabase'
import type { Database } from '@/types/supabase'

type Fn = Database['public']['Functions']
export type AdminUserRow = Fn['admin_list_users']['Returns'][number]
export type AdminWorkshopRow = Fn['admin_list_workshops']['Returns'][number]
export type AccountStatus = 'active' | 'suspended' | 'blocked'

export type Metrics = {
  users_total: number
  users_new_7d: number
  users_new_30d: number
  users_restricted: number
  motorcycles_total: number
  motorcycles_new_7d: number
  workshops_total: number
  workshops_active: number
  workshops_unverified: number
  records_total: number
  records_30d: number
  subscriptions_active: number
  subscriptions_past_due: number
  subscriptions_canceling: number
  mrr_cents: number
  payments_pending: number
  payments_rejected_30d: number
  invoices_failed: number
  storage_bytes: number
  files_total: number
  transfers_pending: number
  access_requests_pending: number
  claims_pending: number
  reports_30d: number
  billing_environment: 'test' | 'production' | null
}

export type AdminUserDetail = {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  created_at: string
  last_sign_in_at: string | null
  account_status: AccountStatus
  status_reason: string | null
  status_changed_at: string | null
  roles: string[]
  plan: string | null
  motorcycles: { id: string; name: string; year: number; plate: string | null; since: string }[]
  workshops: { name: string; role: string; status: string }[]
  subscription: { plan_name: string; status: string; current_period_end: string | null; environment: string } | null
}

export const ACCOUNT_STATUS_LABEL: Record<string, string> = { active: 'Ativa', suspended: 'Suspensa', blocked: 'Bloqueada' }
export const WORKSHOP_STATUS_LABEL: Record<string, string> = { active: 'Ativa', suspended: 'Suspensa', blocked: 'Bloqueada' }
export const VERIFICATION_LABEL: Record<string, string> = { unverified: 'Não verificada', verified: 'Verificada', rejected: 'Verificação recusada' }

export async function fetchMetrics(): Promise<Metrics> {
  const { data, error } = await getSupabase().rpc('admin_get_metrics')
  if (error) throw error
  return data as unknown as Metrics
}

export async function listUsers(search: string): Promise<AdminUserRow[]> {
  const { data, error } = await getSupabase().rpc('admin_list_users', { p_search: search || null, p_limit: 100 })
  if (error) throw error
  return data ?? []
}

export async function getUserDetail(userId: string, reason: string): Promise<AdminUserDetail> {
  const { data, error } = await getSupabase().rpc('admin_get_user', { p_user_id: userId, p_reason: reason })
  if (error) throw error
  return data as unknown as AdminUserDetail
}

export async function setUserStatus(userId: string, status: AccountStatus, reason: string): Promise<void> {
  const { error } = await getSupabase().rpc('admin_set_user_status', { p_user_id: userId, p_status: status, p_reason: reason })
  if (error) throw error
}

export async function listWorkshops(search: string): Promise<AdminWorkshopRow[]> {
  const { data, error } = await getSupabase().rpc('admin_list_workshops', { p_search: search || null, p_limit: 100 })
  if (error) throw error
  return data ?? []
}

export async function setWorkshopStatus(orgId: string, status: AccountStatus, reason: string): Promise<void> {
  const { error } = await getSupabase().rpc('admin_set_workshop_status', { p_organization_id: orgId, p_status: status, p_reason: reason })
  if (error) throw error
}

export async function setWorkshopVerification(orgId: string, verification: string, reason: string): Promise<void> {
  const { error } = await getSupabase().rpc('admin_set_workshop_verification', {
    p_organization_id: orgId, p_verification: verification, p_reason: reason,
  })
  if (error) throw error
}

export function validReason(reason: string): string | null {
  const r = reason.trim()
  if (r.length < 10) return 'Descreva o motivo com pelo menos 10 caracteres. Ele fica registrado na auditoria.'
  if (r.length > 500) return 'Motivo com até 500 caracteres.'
  return null
}
