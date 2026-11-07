// Envio e leitura de anexos. Contrato em docs/API_DOCUMENTATION.md (Anexos).
// Fluxo: preparar (tipo real + compressão) -> enviar ao bucket privado -> registrar (RPC).
import { getSupabase } from '@/lib/supabase'
import { translateDbError } from '@/core/shared/dbErrors'
import {
  buildStoragePath,
  cleanFileName,
  fitWithin,
  sniffMime,
  type AllowedMime,
  type AttachmentKind,
  type StorageUsage,
} from './files'

export const BUCKET = 'attachments'
const SIGNED_URL_SECONDS = 60 * 10

export type PreparedFile = { blob: Blob; mime: AllowedMime; name: string; originalSize: number }

export class AttachmentError extends Error {}

async function readHead(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, 16).arrayBuffer())
}

/** Reduz fotos grandes para JPEG. PDFs e imagens pequenas seguem como estão. */
async function compressImage(file: Blob, mime: AllowedMime): Promise<{ blob: Blob; mime: AllowedMime }> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return { blob: file, mime }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new AttachmentError('Não foi possível ler esta imagem.')
  }
  const size = fitWithin(bitmap.width, bitmap.height)
  const needsResize = size.width !== bitmap.width || size.height !== bitmap.height
  if (!needsResize && file.size <= 1.5 * 1024 * 1024) {
    bitmap.close()
    return { blob: file, mime }
  }
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return { blob: file, mime }
  }
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, size.width, size.height)
  ctx.drawImage(bitmap, 0, 0, size.width, size.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
  if (!blob || blob.size >= file.size) return { blob: file, mime }
  return { blob, mime: 'image/jpeg' }
}

export async function prepareFile(file: File): Promise<PreparedFile> {
  const mime = sniffMime(await readHead(file))
  if (!mime) throw new AttachmentError('Formato não aceito. Envie foto (JPG, PNG, WEBP) ou PDF.')
  const out = mime === 'application/pdf' ? { blob: file as Blob, mime } : await compressImage(file, mime)
  let name = cleanFileName(file.name)
  if (out.mime !== mime) name = name.replace(/\.(png|webp|jpe?g)$/i, '') + '.jpg'
  return { blob: out.blob, mime: out.mime, name, originalSize: file.size }
}

export async function getStorageUsage(): Promise<StorageUsage> {
  const { data, error } = await getSupabase().rpc('get_storage_usage')
  if (error) throw error
  const u = data as unknown as StorageUsage
  return { used_bytes: Number(u.used_bytes), quota_bytes: Number(u.quota_bytes), max_file_bytes: Number(u.max_file_bytes) }
}

export async function uploadAttachment(params: {
  motorcycleId: string
  file: PreparedFile
  kind: AttachmentKind
  maintenanceRecordId?: string
  diaryEntryId?: string
  /** Envio feito por oficina autorizada: registra como comprovante da oficina. */
  organizationId?: string
}): Promise<string> {
  const supabase = getSupabase()
  const path = buildStoragePath(params.motorcycleId, params.file.mime)
  const up = await supabase.storage.from(BUCKET).upload(path, params.file.blob, {
    contentType: params.file.mime,
    upsert: false,
    cacheControl: '3600',
  })
  if (up.error) {
    const msg = up.error.message ?? ''
    if (/exceed|too large|maximum allowed size/i.test(msg)) throw new AttachmentError('Arquivo grande demais.')
    if (/mime|content type/i.test(msg)) throw new AttachmentError('Formato não aceito.')
    throw new AttachmentError('Não foi possível enviar o arquivo. Tente de novo.')
  }
  const { data, error } = params.organizationId
    ? await supabase.rpc('register_workshop_attachment', {
        p_organization_id: params.organizationId,
        p_storage_path: path,
        p_file_name: params.file.name,
        p_kind: params.kind,
        p_maintenance_record_id: params.maintenanceRecordId ?? '',
      })
    : await supabase.rpc('register_attachment', {
        p_motorcycle_id: params.motorcycleId,
        p_storage_path: path,
        p_file_name: params.file.name,
        p_kind: params.kind,
        p_maintenance_record_id: params.maintenanceRecordId,
        p_diary_entry_id: params.diaryEntryId,
      })
  if (error) throw new AttachmentError(translateDbError(error))
  return data as string
}

/** Links temporários (10 minutos) para ver arquivos privados. */
export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {}
  const { data, error } = await getSupabase().storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS)
  if (error) throw error
  const out: Record<string, string> = {}
  for (const item of data ?? []) if (item.path && item.signedUrl) out[item.path] = item.signedUrl
  return out
}

/** Envia vários arquivos para um registro. Devolve as mensagens de quem falhou. */
export async function uploadAll(
  motorcycleId: string,
  target: { maintenanceRecordId?: string; diaryEntryId?: string; organizationId?: string },
  pending: Array<{ file: PreparedFile; kind: AttachmentKind }>,
): Promise<string[]> {
  const failures: string[] = []
  for (const p of pending) {
    try {
      await uploadAttachment({ motorcycleId, file: p.file, kind: p.kind, ...target })
    } catch (err) {
      failures.push(`${p.file.name}: ${err instanceof Error ? err.message : 'falhou.'}`)
    }
  }
  return failures
}

/**
 * Apaga arquivos já desvinculados (fotos removidas do diário). O Storage só
 * permite apagar arquivo próprio sem registro. Falhas não bloqueiam o usuário.
 */
export async function removeFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  try {
    await getSupabase().storage.from(BUCKET).remove(paths)
  } catch {
    // Arquivo fica sem uso; limpeza administrativa (KI-017).
  }
}
