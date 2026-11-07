import { getSupabase } from '@/lib/supabase'
import type { Database } from '@/types/supabase'

type Fn = Database['public']['Functions']
export type StorageUserRow = Fn['admin_storage_top_users']['Returns'][number]
export type StorageMotoRow = Fn['admin_storage_top_motorcycles']['Returns'][number]
export type StorageWorkshopRow = Fn['admin_storage_top_workshops']['Returns'][number]
export type UnlinkedFile = Fn['admin_list_unlinked_files']['Returns'][number]
export type StorageCleanup = Fn['admin_list_storage_cleanups']['Returns'][number]

export type StorageOverview = {
  bucket_files: number
  bucket_bytes: number
  linked_files: number
  linked_bytes: number
  by_kind: Array<{ kind: string; files: number; bytes: number }>
  by_context: Array<{ context: string; files: number; bytes: number }>
  temporary_files: number
  temporary_bytes: number
  orphan_files: number
  orphan_bytes: number
  retention_hours: number
  alert_percent: number
  workshop_quota_bytes: number
  max_file_bytes: number
  users_in_alert: number
  workshops_in_alert: number
  last_cleanup: { finished_at: string | null; deleted_files: number | null; deleted_bytes: number | null; status: string } | null
}

export type CleanupResult = { ok: boolean; deleted_files: number; deleted_bytes: number; failed_files: number; message?: string }

export const KIND_LABEL: Record<string, string> = {
  photo: 'Fotos',
  invoice: 'Notas fiscais',
  service_order: 'Ordens de serviço',
  receipt: 'Recibos',
  document: 'Documentos',
  other: 'Outros',
}

export const CONTEXT_LABEL: Record<string, string> = {
  motorcycle: 'Documentos da moto',
  maintenance: 'Comprovantes de manutenção',
  diary: 'Fotos do diário',
  workshop: 'Enviados por oficinas',
}

export const CLEANUP_STATUS_LABEL: Record<string, string> = { planned: 'Em andamento', done: 'Concluída', failed: 'Falhou' }

async function rpc<T>(name: keyof Fn, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().rpc(name as never, args as never)
  if (error) throw error
  return data as T
}

export async function fetchStorageOverview(): Promise<StorageOverview> {
  const o = await rpc<StorageOverview>('admin_storage_overview')
  return {
    ...o,
    bucket_bytes: Number(o.bucket_bytes),
    linked_bytes: Number(o.linked_bytes),
    temporary_bytes: Number(o.temporary_bytes),
    orphan_bytes: Number(o.orphan_bytes),
    workshop_quota_bytes: Number(o.workshop_quota_bytes),
    by_kind: (o.by_kind ?? []).map((k) => ({ ...k, bytes: Number(k.bytes) })),
    by_context: (o.by_context ?? []).map((k) => ({ ...k, bytes: Number(k.bytes) })),
  }
}

export const listStorageUsers = () => rpc<StorageUserRow[]>('admin_storage_top_users', { p_limit: 20 })
export const listStorageMotorcycles = () => rpc<StorageMotoRow[]>('admin_storage_top_motorcycles', { p_limit: 20 })
export const listStorageWorkshops = () => rpc<StorageWorkshopRow[]>('admin_storage_top_workshops', { p_limit: 20 })
export const listUnlinkedFiles = () => rpc<UnlinkedFile[]>('admin_list_unlinked_files', { p_limit: 100 })
export const listStorageCleanups = () => rpc<StorageCleanup[]>('admin_list_storage_cleanups', { p_limit: 10 })

/** Apaga arquivos sem vínculo pela Edge Function storage-cleanup (o banco decide quais). */
export async function runStorageCleanup(reason: string): Promise<CleanupResult> {
  const { data, error } = await getSupabase().functions.invoke('storage-cleanup', { body: { reason } })
  if (error) {
    const ctx = (error as { context?: Response }).context
    let message: string | undefined
    if (ctx && typeof ctx.json === 'function') {
      try {
        message = ((await ctx.json()) as { message?: string }).message
      } catch {
        /* resposta sem corpo */
      }
    }
    if (message) throw new Error(message)
    throw new Error('Não foi possível executar a limpeza. Tente de novo.')
  }
  return data as CleanupResult
}
