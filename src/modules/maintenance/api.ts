// Linha do tempo e registros de manutenção. Contrato em docs/API_DOCUMENTATION.md.
import { getSupabase } from '@/lib/supabase'
import type { MaintenanceCategory, RecordSource } from './labels'
import type { ItemInput, MaintenanceInput } from './schemas'
import type { AttachmentSummary } from '@/modules/attachments/AttachmentList'

export type TimelineItem = {
  id: string
  item_name: string
  brand: string | null
  part_number: string | null
  quantity: number
  notes: string | null
}

export type TimelineEntry = {
  id: string
  motorcycle_id: string
  category: MaintenanceCategory
  title: string
  description: string | null
  service_date: string
  mileage: number | null
  source_type: RecordSource
  organization_id: string | null
  workshop_name: string | null
  service_value_cents: number | null
  notes: string | null
  corrects_record_id: string | null
  correction_reason: string | null
  is_void: boolean
  created_at: string
  status: 'current' | 'superseded'
  items: TimelineItem[]
  attachments: AttachmentSummary[]
  /** Nível de evidência mostrado no carimbo: oficina > comprovante > dono (PRD 5.5). */
  evidence_level: RecordSource
}

export async function fetchTimeline(motorcycleId: string): Promise<TimelineEntry[]> {
  const { data, error } = await getSupabase()
    .from('maintenance_timeline')
    .select('*')
    .eq('motorcycle_id', motorcycleId)
    .order('service_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as unknown as TimelineEntry[]
}

export async function createMaintenanceRecord(motorcycleId: string, input: MaintenanceInput, items: ItemInput[]) {
  const { data, error } = await getSupabase().rpc('create_maintenance_record', {
    p_motorcycle_id: motorcycleId,
    p_category: input.category as MaintenanceCategory,
    p_title: input.title,
    p_service_date: input.serviceDate,
    p_description: input.description,
    p_mileage: input.mileage,
    p_workshop_name: input.workshopName,
    p_service_value_cents: input.value,
    p_notes: input.notes,
    p_items: items,
    p_corrects_record_id: input.correctsRecordId,
    p_correction_reason: input.correctionReason,
  })
  if (error) throw error
  return data as unknown as { id: string; below_previous: boolean }
}

export async function voidMaintenanceRecord(recordId: string, reason: string) {
  const { data, error } = await getSupabase().rpc('void_maintenance_record', { p_record_id: recordId, p_reason: reason })
  if (error) throw error
  return data
}

/** Filtros da linha do tempo (PRD 5.4: categoria, data, oficina e tipo de registro). */
export type TimelineFilters = {
  category: MaintenanceCategory | ''
  source: RecordSource | ''
  workshop: string
  from: string
  to: string
  showSuperseded: boolean
}

export const EMPTY_FILTERS: TimelineFilters = { category: '', source: '', workshop: '', from: '', to: '', showSuperseded: false }

export function applyFilters(entries: TimelineEntry[], f: TimelineFilters): TimelineEntry[] {
  return entries.filter((e) => {
    if (!f.showSuperseded && e.status === 'superseded') return false
    if (!f.showSuperseded && e.is_void) return false
    if (f.category && e.category !== f.category) return false
    if (f.source && e.evidence_level !== f.source) return false
    if (f.workshop && (e.workshop_name ?? '') !== f.workshop) return false
    if (f.from && e.service_date < f.from) return false
    if (f.to && e.service_date > f.to) return false
    return true
  })
}
