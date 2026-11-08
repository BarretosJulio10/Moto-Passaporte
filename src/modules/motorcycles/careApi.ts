// Rotinas de cuidado da moto: óleo por km, corrente por dias e check-up semanal (ADR-041).
import { getSupabase } from '@/lib/supabase'

export type OilStatus = 'ok' | 'soon' | 'due' | 'unknown'
export type CareStatus = {
  current_km: number | null
  km_updated_at: string | null
  oil: {
    enabled: boolean
    configured: boolean
    interval_km: number
    last_change_km: number | null
    last_change_from: 'history' | 'informed' | 'first_reading'
    last_change_date: string | null
    next_km: number | null
    km_left: number | null
    soon_before: number
    status: OilStatus
  }
  chain: { enabled: boolean; interval_days: number; last_done_at: string | null; next_at: string | null; due: boolean }
}

export const OIL_SUGGESTED_KM = 1000

export async function fetchCare(motorcycleId: string): Promise<CareStatus> {
  const { data, error } = await getSupabase().rpc('get_motorcycle_care', { p_motorcycle_id: motorcycleId })
  if (error) throw error
  return data as unknown as CareStatus
}

export async function setCare(motorcycleId: string, routine: 'oil_change' | 'chain_check', interval: number | null, enabled = true, lastDoneKm?: number | null): Promise<CareStatus> {
  const { data, error } = await getSupabase().rpc('set_motorcycle_care', {
    p_motorcycle_id: motorcycleId, p_routine: routine, p_interval: interval, p_enabled: enabled, p_last_done_km: lastDoneKm ?? null,
  })
  if (error) throw error
  return data as unknown as CareStatus
}

export async function markCareDone(motorcycleId: string, routine: 'oil_change' | 'chain_check'): Promise<CareStatus> {
  const { data, error } = await getSupabase().rpc('mark_care_done', { p_motorcycle_id: motorcycleId, p_routine: routine })
  if (error) throw error
  return data as unknown as CareStatus
}

/** Dias desde a última atualização do km (null = nunca). */
export function daysSince(iso: string | null, now = new Date()): number | null {
  if (!iso) return null
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000)
}
