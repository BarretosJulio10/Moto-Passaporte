// Transferência do passaporte (PRD 10, ADR-016). Contrato em docs/API_DOCUMENTATION.md (Transferência).
import { getSupabase } from '@/lib/supabase'
import type { Database } from '@/types/supabase'

type Fn = Database['public']['Functions']
export type OutgoingTransfer = Fn['get_motorcycle_transfers']['Returns'][number]
export type IncomingTransfer = Fn['get_my_incoming_transfers']['Returns'][number]
export type PreviousMotorcycle = Fn['get_my_previous_motorcycles']['Returns'][number]
export type TransferStatus = 'pending' | 'accepted' | 'rejected' | 'canceled' | 'expired'

export const TRANSFER_STATUS_LABEL: Record<TransferStatus, string> = {
  pending: 'Aguardando o comprador',
  accepted: 'Aceita',
  rejected: 'Recusada pelo comprador',
  canceled: 'Cancelada',
  expired: 'Expirada',
}

export async function createTransfer(motorcycleId: string, email: string, message?: string): Promise<string> {
  const { data, error } = await getSupabase().rpc('create_transfer_request', {
    p_motorcycle_id: motorcycleId,
    p_to_email: email,
    p_message: message?.trim() || undefined,
  })
  if (error) throw error
  return data as string
}

export async function cancelTransfer(id: string) {
  const { error } = await getSupabase().rpc('cancel_transfer_request', { p_transfer_id: id })
  if (error) throw error
}

export async function rejectTransfer(id: string) {
  const { error } = await getSupabase().rpc('reject_transfer_request', { p_transfer_id: id })
  if (error) throw error
}

export async function acceptTransfer(id: string, acquisitionDate?: string): Promise<string> {
  const { data, error } = await getSupabase().rpc('accept_transfer_request', {
    p_transfer_id: id,
    p_acquisition_date: acquisitionDate || undefined,
  })
  if (error) throw error
  return data as string
}

export async function fetchMotorcycleTransfers(motorcycleId: string): Promise<OutgoingTransfer[]> {
  const { data, error } = await getSupabase().rpc('get_motorcycle_transfers', { p_motorcycle_id: motorcycleId })
  if (error) throw error
  return data ?? []
}

export async function fetchIncomingTransfers(): Promise<IncomingTransfer[]> {
  const { data, error } = await getSupabase().rpc('get_my_incoming_transfers')
  if (error) throw error
  return data ?? []
}

export async function fetchPreviousMotorcycles(): Promise<PreviousMotorcycle[]> {
  const { data, error } = await getSupabase().rpc('get_my_previous_motorcycles')
  if (error) throw error
  return data ?? []
}
