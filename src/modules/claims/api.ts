// Pedidos de verificação de placa (ADR-007, ADR-025).
import { getSupabase } from '@/lib/supabase'
import type { Database } from '@/types/supabase'

type Fn = Database['public']['Functions']
export type MyClaim = Fn['get_my_claims']['Returns'][number]
export type OwnershipNotice = Fn['get_my_ownership_notices']['Returns'][number]
export type AdminClaim = Fn['admin_list_claims']['Returns'][number]

export const CLAIM_STATUS_LABEL: Record<string, string> = {
  pending: 'Em análise',
  approved: 'Procedente',
  rejected: 'Não procedente',
  canceled: 'Cancelado',
}

export async function fetchMyClaims(): Promise<MyClaim[]> {
  const { data, error } = await getSupabase().rpc('get_my_claims')
  if (error) throw error
  return data ?? []
}

export async function updateMyClaimNote(id: string, note: string): Promise<void> {
  const { error } = await getSupabase().rpc('update_my_claim_note', { p_claim_id: id, p_note: note })
  if (error) throw error
}

export async function cancelMyClaim(id: string): Promise<void> {
  const { error } = await getSupabase().rpc('cancel_my_claim', { p_claim_id: id })
  if (error) throw error
}

export async function fetchOwnershipNotices(): Promise<OwnershipNotice[]> {
  const { data, error } = await getSupabase().rpc('get_my_ownership_notices')
  if (error) throw error
  return data ?? []
}

export async function dismissOwnershipNotice(id: string): Promise<void> {
  const { error } = await getSupabase().rpc('dismiss_ownership_notice', { p_claim_id: id })
  if (error) throw error
}

export async function adminListClaims(status: string | null): Promise<AdminClaim[]> {
  const { data, error } = await getSupabase().rpc('admin_list_claims', { p_status: status, p_limit: 200 })
  if (error) throw error
  return data ?? []
}

export async function adminResolveClaim(i: { id: string; status: 'approved' | 'rejected'; reply: string; notifyOwner: boolean; reason: string }) {
  const { error } = await getSupabase().rpc('admin_resolve_claim', {
    p_claim_id: i.id, p_status: i.status, p_reply: i.reply, p_notify_owner: i.notifyOwner, p_reason: i.reason,
  })
  if (error) throw error
}
