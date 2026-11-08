// Compartilhamento controlado do passaporte (PRD 11, ADR-017).
import { getSupabase } from '@/lib/supabase'
import type { Database } from '@/types/supabase'
import type { MaintenanceCategory, RecordSource } from '@/modules/maintenance/labels'
import type { DiaryCategory } from '@/modules/diary/schemas'
import type { AttachmentKind } from '@/modules/attachments/files'

export type Share = Database['public']['Functions']['get_motorcycle_shares']['Returns'][number]
export type ShareStatus = 'active' | 'expired' | 'revoked'

export type ShareOptions = {
  show_plate: boolean
  show_mileage: boolean
  show_history: boolean
  show_values: boolean
  show_attachments: boolean
  show_diary: boolean
}

export const DEFAULT_OPTIONS: ShareOptions = {
  show_plate: false,
  show_mileage: true,
  show_history: true,
  show_values: false,
  show_attachments: false,
  show_diary: false,
}

export const OPTION_LABEL: Record<keyof ShareOptions, { label: string; hint: string }> = {
  show_history: { label: 'Histórico de serviços', hint: 'Datas, serviços, peças, quilometragem e origem de cada registro.' },
  show_mileage: { label: 'Quilometragem documentada', hint: 'Leituras registradas ao longo do tempo.' },
  show_plate: { label: 'Placa', hint: 'Útil para o comprador conferir a moto.' },
  show_values: { label: 'Valores dos serviços', hint: 'Quanto foi pago em cada serviço.' },
  show_attachments: { label: 'Mostrar comprovantes', hint: 'Quem tem o link vê e abre as notas fiscais, ordens de serviço e recibos dos serviços. Fotos do diário não entram.' },
  show_diary: { label: 'Diário compartilhável', hint: 'Só as entradas que você marcou como compartilháveis.' },
}

export const SHARE_STATUS_LABEL: Record<ShareStatus, string> = { active: 'Ativo', expired: 'Expirado', revoked: 'Revogado' }

export type SharedPassport = {
  brand: string
  model: string
  version: string | null
  manufacturing_year: number
  model_year: number | null
  displacement_cc: number | null
  color: string | null
  passport_created_at: string
  shared_at: string
  expires_at: string | null
  origin_workshop: string | null
  options: { plate: boolean; mileage: boolean; history: boolean; values: boolean; attachments: boolean; diary: boolean }
  plate?: string | null
  mileage?: Array<{ recorded_at: string; mileage: number; source_type: RecordSource; below_previous: boolean }>
  history?: Array<{
    service_date: string
    category: MaintenanceCategory
    title: string
    description: string | null
    mileage: number | null
    evidence_level: RecordSource
    workshop_name: string | null
    is_correction: boolean
    items: Array<{ item_name: string; brand: string | null; quantity: number }>
    service_value_cents: number | null
    attachments: Array<{ kind: AttachmentKind; id?: string; mime_type?: string }> | null
  }>
  diary?: Array<{ entry_date: string; category: DiaryCategory; title: string; body: string | null; location: string | null; photo_count: number }>
}

export function shareUrl(token: string, origin = window.location.origin) {
  return `${origin}/c/${token}`
}

export async function fetchShares(motorcycleId: string): Promise<Share[]> {
  const { data, error } = await getSupabase().rpc('get_motorcycle_shares', { p_motorcycle_id: motorcycleId })
  if (error) throw error
  return data ?? []
}

export async function createShare(motorcycleId: string, label: string, expiresInDays: number | null, o: ShareOptions) {
  const { data, error } = await getSupabase().rpc('create_passport_share', {
    p_motorcycle_id: motorcycleId,
    p_label: label.trim() || undefined,
    p_expires_in_days: expiresInDays ?? undefined,
    p_show_plate: o.show_plate,
    p_show_mileage: o.show_mileage,
    p_show_history: o.show_history,
    p_show_values: o.show_values,
    p_show_attachments: o.show_attachments,
    p_show_diary: o.show_diary,
  })
  if (error) throw error
  return data as unknown as { id: string; token: string }
}

export async function revokeShare(shareId: string) {
  const { error } = await getSupabase().rpc('revoke_passport_share', { p_share_id: shareId })
  if (error) throw error
}

export async function fetchSharedPassport(token: string): Promise<SharedPassport | null> {
  const { data, error } = await getSupabase().rpc('get_shared_passport', { p_token: token })
  if (error) throw error
  return (data as unknown as SharedPassport | null) ?? null
}

export async function fetchPublicPageEnabled(motorcycleId: string): Promise<boolean> {
  const { data, error } = await getSupabase().rpc('get_passport_settings', { p_motorcycle_id: motorcycleId })
  if (error) throw error
  return Boolean((data as unknown as { public_page_enabled: boolean }).public_page_enabled)
}

export async function setPublicPageEnabled(motorcycleId: string, enabled: boolean) {
  const { error } = await getSupabase().rpc('set_public_page_enabled', { p_motorcycle_id: motorcycleId, p_enabled: enabled })
  if (error) throw error
}

/** Link temporário (60 s) de um comprovante do passaporte compartilhado (ADR-034). */
export async function openSharedFile(token: string, attachmentId: string): Promise<string> {
  const { data, error } = await getSupabase().functions.invoke('shared-file', { body: { token, attachment_id: attachmentId } })
  if (error) {
    const ctx = (error as { context?: Response }).context
    let message: string | undefined
    if (ctx && typeof ctx.json === 'function') {
      try {
        message = ((await ctx.json()) as { message?: string }).message
      } catch {
        /* sem corpo */
      }
    }
    throw new Error(message ?? 'Não foi possível abrir o comprovante agora.')
  }
  return (data as { url: string }).url
}
