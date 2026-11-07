// Acesso ao banco do módulo de motocicletas. Contrato em docs/API_DOCUMENTATION.md.
import { getSupabase } from '@/lib/supabase'
import type { RegisterMotorcycleInput, MileageInput } from './schemas'

export type RegisterResult =
  | { status: 'created'; motorcycle_id: string; public_id: string }
  | { status: 'verification_required'; claim_id: string }

export async function registerMotorcycle(input: RegisterMotorcycleInput): Promise<RegisterResult> {
  const { data, error } = await getSupabase().rpc('register_motorcycle', {
    p_brand: input.brand,
    p_model: input.model,
    p_manufacturing_year: input.manufacturingYear,
    p_plate: input.plate,
    p_current_mileage: input.currentMileage,
    p_version: input.version,
    p_model_year: input.modelYear,
    p_displacement_cc: input.displacementCc,
    p_color: input.color,
    p_chassis: input.chassis,
    p_acquisition_date: input.acquisitionDate,
    p_initial_notes: input.initialNotes,
  })
  if (error) throw error
  return data as unknown as RegisterResult
}

export async function fetchMyMotorcycles() {
  const { data, error } = await getSupabase()
    .from('my_motorcycles')
    .select('id, public_id, brand, model, version, manufacturing_year, model_year, current_plate, latest_mileage, latest_mileage_at')
    .order('passport_created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function fetchMotorcycle(id: string) {
  const { data, error } = await getSupabase().from('my_motorcycles').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export async function fetchPlates(motorcycleId: string) {
  const { data, error } = await getSupabase()
    .from('motorcycle_plates')
    .select('id, plate, valid_from, valid_until')
    .eq('motorcycle_id', motorcycleId)
    .order('valid_from', { ascending: false })
  if (error) throw error
  return data
}

export async function fetchMileage(motorcycleId: string) {
  const { data, error } = await getSupabase()
    .from('mileage_records')
    .select('id, mileage, recorded_at, source_type, note, corrects_record_id, below_previous, created_at')
    .eq('motorcycle_id', motorcycleId)
    .order('recorded_at', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

/** Chassi decifrado no banco, só para o titular atual (ADR-032). */
export async function fetchChassis(motorcycleId: string): Promise<string | null> {
  const { data, error } = await getSupabase().rpc('get_my_chassis', { p_motorcycle_id: motorcycleId })
  if (error) throw error
  return (data as string | null) ?? null
}

/** Grava o chassi cifrado (vazio apaga). Só o titular atual. */
export async function updateChassis(motorcycleId: string, chassis: string | null) {
  const { error } = await getSupabase().rpc('set_my_chassis', { p_motorcycle_id: motorcycleId, p_chassis: chassis ?? '' })
  if (error) throw error
}

export async function changePlate(motorcycleId: string, plate: string) {
  const { error } = await getSupabase().rpc('change_motorcycle_plate', { p_motorcycle_id: motorcycleId, p_new_plate: plate })
  if (error) throw error
}

export async function recordMileage(motorcycleId: string, input: MileageInput) {
  const { data, error } = await getSupabase().rpc('record_mileage', {
    p_motorcycle_id: motorcycleId,
    p_mileage: input.mileage,
    p_recorded_at: input.recordedAt,
    p_note: input.note,
    p_corrects_record_id: input.correctsRecordId,
  })
  if (error) throw error
  return data as unknown as { id: string; below_previous: boolean }
}

export type PublicPassport = {
  public_id: string
  brand: string
  model: string
  version: string | null
  manufacturing_year: number
  model_year: number | null
  displacement_cc: number | null
  color: string | null
  passport_created_at: string
}

export async function getPublicPassport(publicId: string): Promise<PublicPassport | null> {
  const { data, error } = await getSupabase().rpc('get_public_passport', { p_public_id: publicId })
  if (error) throw error
  return (data as unknown as PublicPassport | null) ?? null
}

/** Endereço público do passaporte (QR Code e link). Nunca usar o id interno. */
export function publicPassportUrl(publicId: string, origin = window.location.origin): string {
  return `${origin}/p/${publicId}`
}
