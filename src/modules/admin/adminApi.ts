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

// Configurações gerais (PRD 7.8) e auditoria (PRD 7.7) — ADR-024.
export type SettingSpec = { kind: 'int' | 'email' | 'phone'; min?: number; max?: number; group: string; label: string }
export type AdminSetting = Omit<Fn['admin_list_settings']['Returns'][number], 'spec'> & { spec: SettingSpec }
export type AuditRow = Fn['admin_search_audit']['Returns'][number]
export type AuditFilters = { entityType: string; action: string; from: string; to: string; actor: string }

export async function listSettings(): Promise<AdminSetting[]> {
  const { data, error } = await getSupabase().rpc('admin_list_settings')
  if (error) throw error
  return (data ?? []) as unknown as AdminSetting[]
}

export async function updateSetting(key: string, value: string | number | null, reason: string): Promise<void> {
  const { error } = await getSupabase().rpc('admin_update_setting', { p_key: key, p_value: value, p_reason: reason })
  if (error) throw error
}

/** Converte o texto do formulário no valor da configuração; devolve mensagem se inválido. */
export function parseSettingInput(spec: SettingSpec, raw: string): { value: string | number | null } | string {
  const v = raw.trim()
  if (spec.kind === 'int') {
    if (!/^\d+$/.test(v)) return 'Use um número inteiro.'
    const n = Number(v)
    if (spec.min !== undefined && n < spec.min) return `Mínimo ${spec.min}.`
    if (spec.max !== undefined && n > spec.max) return `Máximo ${spec.max}.`
    return { value: n }
  }
  if (v === '') return { value: null }
  if (spec.kind === 'email') return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? { value: v.toLowerCase() } : 'E-mail inválido.'
  const digits = v.replace(/\D/g, '')
  return /^\d{12,13}$/.test(digits) ? { value: digits } : 'Use DDI + DDD + número, ex. 5521999998888.'
}

export async function searchAudit(f: AuditFilters, beforeId: number | null): Promise<AuditRow[]> {
  const { data, error } = await getSupabase().rpc('admin_search_audit', {
    p_entity_type: f.entityType || null,
    p_action: f.action || null,
    p_actor: /^[0-9a-f-]{36}$/i.test(f.actor.trim()) ? f.actor.trim() : null,
    p_from: f.from ? new Date(`${f.from}T00:00:00`).toISOString() : null,
    p_to: f.to ? new Date(new Date(`${f.to}T00:00:00`).getTime() + 86400000).toISOString() : null,
    p_limit: 50,
    p_before_id: beforeId,
  })
  if (error) throw error
  return data ?? []
}

export async function auditFacets(): Promise<{ entity_types: string[]; actions: string[] }> {
  const { data, error } = await getSupabase().rpc('admin_audit_facets')
  if (error) throw error
  return data as unknown as { entity_types: string[]; actions: string[] }
}

export async function getAuditEntry(id: number, reason: string): Promise<{ previous_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null }> {
  const { data, error } = await getSupabase().rpc('admin_get_audit_entry', { p_id: id, p_reason: reason })
  if (error) throw error
  return data as unknown as { previous_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null }
}

export type JobStatus = Fn['admin_job_status']['Returns'][number]
export const JOB_LABEL: Record<string, { name: string; every: string }> = {
  reconcile: { name: 'Conciliação com o Mercado Pago', every: 'a cada 6 horas' },
  storage_cleanup: { name: 'Limpeza de arquivos sem vínculo', every: 'todo dia às 04:41' },
}
export const JOB_STATUS_LABEL: Record<string, string> = { running: 'Em andamento', ok: 'Concluída', failed: 'Falhou', skipped: 'Pulada' }

/** Estado das rotinas automáticas (ADR-029). */
export async function fetchJobStatus(): Promise<JobStatus[]> {
  const { data, error } = await getSupabase().rpc('admin_job_status')
  if (error) throw error
  return data ?? []
}
