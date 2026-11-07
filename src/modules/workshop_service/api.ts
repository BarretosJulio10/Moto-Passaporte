// Serviços registrados pela oficina e histórico visto por ela (PRD 6.7, ADR-015).
import { getSupabase } from '@/lib/supabase'
import type { StorageUsage } from '@/modules/attachments/files'
import type { TimelineEntry } from '@/modules/maintenance/api'
import type { ItemInput, MaintenanceInput } from '@/modules/maintenance/schemas'

/** Histórico técnico da moto; valor, observações e comprovantes só dos registros da própria oficina. */
export async function fetchWorkshopTimeline(organizationId: string, motorcycleId: string): Promise<TimelineEntry[]> {
  const { data, error } = await getSupabase().rpc('get_workshop_timeline', {
    p_organization_id: organizationId,
    p_motorcycle_id: motorcycleId,
  })
  if (error) throw error
  return (data ?? []).map((r) => ({
    ...r,
    motorcycle_id: motorcycleId,
    organization_id: r.is_own ? organizationId : null,
    status: r.status as TimelineEntry['status'],
    items: (r.items ?? []) as unknown as TimelineEntry['items'],
    attachments: (r.attachments ?? []) as unknown as TimelineEntry['attachments'],
  })) as unknown as TimelineEntry[]
}

export async function createWorkshopService(
  organizationId: string,
  motorcycleId: string,
  input: MaintenanceInput,
  items: ItemInput[],
): Promise<{ id: string; below_previous: boolean }> {
  const { data, error } = await getSupabase().rpc('create_workshop_service', {
    p_organization_id: organizationId,
    p_motorcycle_id: motorcycleId,
    p_category: input.category as TimelineEntry['category'],
    p_title: input.title,
    p_service_date: input.serviceDate,
    p_description: input.description,
    p_mileage: input.mileage,
    p_service_value_cents: input.value,
    p_notes: input.notes,
    p_items: items,
    p_corrects_record_id: input.correctsRecordId,
    p_correction_reason: input.correctionReason,
  })
  if (error) throw error
  return data as unknown as { id: string; below_previous: boolean }
}

export async function getWorkshopStorageUsage(organizationId: string): Promise<StorageUsage> {
  const { data, error } = await getSupabase().rpc('get_workshop_storage_usage', { p_organization_id: organizationId })
  if (error) throw error
  const u = data as unknown as StorageUsage
  return { used_bytes: Number(u.used_bytes), quota_bytes: Number(u.quota_bytes), max_file_bytes: Number(u.max_file_bytes) }
}
