import { getSupabase } from '@/lib/supabase'
import type { Database } from '@/types/supabase'

type Fn = Database['public']['Functions']
export type PrivacyRequest = Fn['get_my_privacy_requests']['Returns'][number]
export type AdminPrivacyRequest = Fn['admin_list_privacy_requests']['Returns'][number]
export type PrivacyKind = 'deletion' | 'correction' | 'access' | 'other'

export const PRIVACY_KIND_LABEL: Record<string, string> = {
  deletion: 'Excluir minha conta e meus dados pessoais',
  correction: 'Corrigir dados',
  access: 'Saber como meus dados são usados',
  other: 'Outro assunto de privacidade',
}
export const PRIVACY_STATUS_LABEL: Record<string, string> = {
  pending: 'Recebido', in_progress: 'Em análise', done: 'Atendido', rejected: 'Respondido', canceled: 'Cancelado',
}

export type Profile = { full_name: string | null; email: string | null; phone: string | null; created_at: string }

export async function fetchMyProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await getSupabase().from('profiles').select('full_name, email, phone, created_at').eq('id', userId).maybeSingle()
  if (error) throw error
  return data as Profile | null
}

export async function updateMyProfile(userId: string, fullName: string, phone: string | null) {
  const { error } = await getSupabase().from('profiles').update({ full_name: fullName, phone }).eq('id', userId)
  if (error) throw error
}

export async function changePassword(password: string) {
  const { error } = await getSupabase().auth.updateUser({ password })
  if (error) throw error
}

export async function exportMyData(): Promise<unknown> {
  const { data, error } = await getSupabase().rpc('export_my_data')
  if (error) throw error
  return data
}

export async function fetchMyPrivacyRequests(): Promise<PrivacyRequest[]> {
  const { data, error } = await getSupabase().rpc('get_my_privacy_requests')
  if (error) throw error
  return data ?? []
}

export async function createPrivacyRequest(kind: PrivacyKind, details: string) {
  const { error } = await getSupabase().rpc('create_privacy_request', { p_kind: kind, p_details: details.trim() || null })
  if (error) throw error
}

export async function cancelPrivacyRequest(id: string) {
  const { error } = await getSupabase().rpc('cancel_my_privacy_request', { p_id: id })
  if (error) throw error
}

export async function adminListPrivacyRequests(status: string): Promise<AdminPrivacyRequest[]> {
  const { data, error } = await getSupabase().rpc('admin_list_privacy_requests', { p_status: status })
  if (error) throw error
  return data ?? []
}

export async function adminResolvePrivacyRequest(id: string, status: string, reply: string, reason: string) {
  const { error } = await getSupabase().rpc('admin_resolve_privacy_request', { p_id: id, p_status: status, p_reply: reply, p_reason: reason })
  if (error) throw error
}

/** Baixa um JSON gerado no navegador (nada passa por outro servidor). */
export function downloadJson(data: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Exclusão a pedido do titular = anonimização (ADR-036). Irreversível. */
export async function adminAnonymizeAccount(requestId: string, reason: string) {
  const { data, error } = await getSupabase().rpc('admin_anonymize_account', { p_request_id: requestId, p_reason: reason })
  if (error) throw error
  return data as { diary_entries: number; diary_files: number }
}
