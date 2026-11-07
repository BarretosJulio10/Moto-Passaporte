// Pesquisa por placa e autorizações de oficina (PRD 6.4, 6.6).
// Contrato em docs/API_DOCUMENTATION.md (Autorizações de oficina).
import { getSupabase } from '@/lib/supabase'
import type { Database } from '@/types/supabase'

type Fn = Database['public']['Functions']
export type AccessStatus = Database['public']['Enums']['workshop_access_status']
export type AccessType = Database['public']['Enums']['workshop_access_type']
export type OwnerAccess = Fn['get_motorcycle_workshop_access']['Returns'][number]
export type PendingRequest = Fn['get_my_pending_access_requests']['Returns'][number]
export type WorkshopAccess = Fn['get_workshop_access_list']['Returns'][number]

export type PlateSearchResult =
  | { found: false }
  | {
      found: true
      brand: string
      model: string
      manufacturing_year: number
      access_id: string | null
      access_status: AccessStatus | null
      access_type: AccessType | null
      /** A moto ainda aceita Oficina de Origem (prazo e nenhuma definida). */
      origin_available: boolean
      motorcycle_id: string | null
    }

export const STATUS_LABEL: Record<AccessStatus, string> = {
  pending: 'Aguardando o titular',
  approved: 'Autorizada',
  rejected: 'Recusada',
  canceled: 'Pedido cancelado',
  revoked: 'Revogada',
  ended: 'Encerrada',
}

export async function searchPlate(organizationId: string, plate: string): Promise<PlateSearchResult> {
  const { data, error } = await getSupabase().rpc('search_motorcycle_by_plate', { p_organization_id: organizationId, p_plate: plate })
  if (error) throw error
  return data as unknown as PlateSearchResult
}

export async function requestAccess(organizationId: string, plate: string, message?: string, origin = false) {
  const { data, error } = await getSupabase().rpc('request_workshop_access', {
    p_organization_id: organizationId,
    p_plate: plate,
    p_message: message?.trim() || undefined,
    p_origin: origin,
  })
  if (error) throw error
  return data as unknown as { id: string; status: AccessStatus; access_type: AccessType }
}

export async function cancelRequest(accessId: string) {
  const { error } = await getSupabase().rpc('cancel_workshop_access_request', { p_access_id: accessId })
  if (error) throw error
}

export async function fetchWorkshopAccess(organizationId: string): Promise<WorkshopAccess[]> {
  const { data, error } = await getSupabase().rpc('get_workshop_access_list', { p_organization_id: organizationId })
  if (error) throw error
  return data ?? []
}

export async function fetchMotorcycleAccess(motorcycleId: string): Promise<OwnerAccess[]> {
  const { data, error } = await getSupabase().rpc('get_motorcycle_workshop_access', { p_motorcycle_id: motorcycleId })
  if (error) throw error
  return data ?? []
}

export async function fetchPendingRequests(): Promise<PendingRequest[]> {
  const { data, error } = await getSupabase().rpc('get_my_pending_access_requests')
  if (error) throw error
  return data ?? []
}

/** asOrigin = false aprova um pedido de Oficina de Origem apenas como acesso comum. */
export async function decideAccess(accessId: string, approve: boolean, asOrigin = true) {
  const { error } = await getSupabase().rpc('decide_workshop_access', { p_access_id: accessId, p_approve: approve, p_as_origin: asOrigin })
  if (error) throw error
}

/** Titular define ou tira o título de Oficina de Origem (PRD 6.5). */
export async function setOrigin(accessId: string, origin: boolean) {
  const { error } = await getSupabase().rpc('set_origin_workshop', { p_access_id: accessId, p_origin: origin })
  if (error) throw error
}

export const ORIGIN_LABEL = 'Oficina de Origem'

export async function revokeAccess(accessId: string) {
  const { error } = await getSupabase().rpc('revoke_workshop_access', { p_access_id: accessId })
  if (error) throw error
}

/** Separa a lista da oficina em grupos para a tela. */
export function splitWorkshopAccess(list: WorkshopAccess[]) {
  return {
    approved: list.filter((a) => a.status === 'approved'),
    pending: list.filter((a) => a.status === 'pending'),
    closed: list.filter((a) => a.status !== 'approved' && a.status !== 'pending'),
  }
}
