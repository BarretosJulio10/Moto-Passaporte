import { getSupabase } from '@/lib/supabase'
import { AttachmentError } from '@/modules/attachments/api'
import { fitWithin, sniffMime } from '@/modules/attachments/files'
import { rpc } from '@/modules/workshop/shared/rpc'

/** App da Pista (ADR-057): leitura e ações do mecânico, sem preços nem contato do cliente. */

export type PistaShop = {
  organization_id: string
  name: string
  is_responsible: boolean
  allow_unassigned: boolean
  allow_ready: boolean
  user_name: string
}

export type PistaStatus =
  | 'open' | 'awaiting_diagnosis' | 'awaiting_approval' | 'awaiting_parts' | 'awaiting_execution'
  | 'in_progress' | 'paused' | 'awaiting_complement' | 'ready' | 'completed' | 'awaiting_pickup' | 'delivered' | 'canceled'

export const PISTA_STATUS_LABEL: Record<PistaStatus, string> = {
  open: 'Aberta', awaiting_diagnosis: 'Aguardando diagnóstico', awaiting_approval: 'Aguardando aprovação',
  awaiting_parts: 'Aguardando peça', awaiting_execution: 'Na fila', in_progress: 'Em execução', paused: 'Pausada',
  awaiting_complement: 'Aguardando complemento', ready: 'Pronto', completed: 'Concluída', awaiting_pickup: 'Aguardando retirada',
  delivered: 'Entregue', canceled: 'Cancelada',
}

export const PISTA_STATUS_TONE: Record<PistaStatus, string> = {
  open: 'bg-paper text-ink', awaiting_diagnosis: 'bg-paper text-ink', awaiting_approval: 'bg-paper text-ink',
  awaiting_parts: 'bg-brass text-sheet', awaiting_execution: 'bg-paper text-ink', in_progress: 'bg-ink text-sheet',
  paused: 'bg-muted text-sheet', awaiting_complement: 'bg-brass text-sheet', ready: 'bg-ok text-sheet',
  completed: 'bg-ok text-sheet', awaiting_pickup: 'bg-ok text-sheet', delivered: 'bg-paper text-muted', canceled: 'bg-paper text-muted',
}

export type PistaOrderRow = {
  id: string
  number: number
  status: PistaStatus
  due_date: string | null
  km_in: number | null
  mine: boolean
  mechanic_user_id: string | null
  mechanic_name: string | null
  customer_name: string
  plate: string | null
  brand: string | null
  model: string | null
  year: number | null
  notes: string | null
  items_total: number
  items_done: number
  photos: number
  updated_at: string
}

export type PistaPhase = 'entry' | 'work' | 'exit'
export const PHASE_LABEL: Record<PistaPhase, string> = { entry: 'Entrada', work: 'Execução', exit: 'Saída' }

export type PistaItem = {
  id: string; position: number; kind: string; description: string; quantity: number
  status: 'pending' | 'done' | 'not_done'; notes: string | null; part_brand: string | null; part_code: string | null
  executed_at: string | null; executed_by_name: string | null
}
export type PistaNote = { id: string; body: string; item_id: string | null; created_at: string; created_by: string | null; created_by_name: string | null; voided: boolean }
export type PistaAudio = {
  id: string; storage_path: string | null; mime_type: string; duration_seconds: number; title: string | null
  item_id: string | null; created_at: string; created_by_name: string | null; expired: boolean
}
export type PistaPhoto = { id: string; phase: PistaPhase; storage_path: string; caption: string | null; created_at: string; created_by_name: string | null }
export type PistaInspection = {
  items: Record<string, { state: 'ok' | 'atencao' | 'avaria' | 'na'; note?: string }>
  fuel_level: string | null; keys_count: number | null; km: number | null; notes: string | null
  recorded_at: string; customer_ack_at: string | null
}

export type PistaOrder = {
  id: string
  number: number
  status: PistaStatus
  due_date: string | null
  km_in: number | null
  km_out: number | null
  notes: string | null
  technical_notes: string | null
  mine: boolean
  mechanic_user_id: string | null
  mechanic_name: string | null
  customer_name: string
  vehicle: { plate: string | null; brand: string | null; model: string | null; year: number | null; color: string | null } | null
  items: PistaItem[]
  photos: PistaPhoto[]
  notes_list: PistaNote[]
  audios: PistaAudio[]
  inspections: Partial<Record<'entry' | 'exit', PistaInspection>>
}

export const fetchPistaContext = () => rpc<PistaShop[]>('pista_context')
export const fetchPistaOrders = (org: string) => rpc<PistaOrderRow[]>('pista_list_orders', { p_org: org })
export const fetchPistaOrder = (org: string, order: string) => rpc<PistaOrder>('pista_get_order', { p_org: org, p_order: order })

export const WORKSHOP_BUCKET = 'workshop-files'

/** Foto: reduz no aparelho (sem GPS: a imagem é redesenhada) e devolve o arquivo pronto para a fila. */
export async function preparePhoto(file: File): Promise<{ blob: Blob; mime: string; ext: string }> {
  const mime = sniffMime(new Uint8Array(await file.slice(0, 16).arrayBuffer()))
  if (!mime || mime === 'application/pdf') throw new AttachmentError('Envie uma foto (JPG, PNG ou WebP).')
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
    return { blob: file, mime, ext: mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg' }
  }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new AttachmentError('Não foi possível ler esta foto.')
  }
  // Sempre redesenha: tira localização (EXIF/GPS) e reduz para ~1600 px.
  const size = fitWithin(bitmap.width, bitmap.height, 1600)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new AttachmentError('Não foi possível preparar a foto.')
  }
  ctx.drawImage(bitmap, 0, 0, size.width, size.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8))
  if (!blob) throw new AttachmentError('Não foi possível preparar a foto.')
  return { blob, mime: 'image/jpeg', ext: 'jpg' }
}

/** Envia o arquivo ao bucket da oficina e pede a conferência do conteúdo (ADR-033). Repetir é seguro. */
export async function uploadWorkshopFile(path: string, blob: Blob, mime: string) {
  const supabase = getSupabase()
  const up = await supabase.storage.from(WORKSHOP_BUCKET).upload(path, blob, { contentType: mime, upsert: false, cacheControl: '3600' })
  const already = up.error && /exists|duplicate/i.test(up.error.message ?? '')
  if (up.error && !already) throw new Error(up.error.message || 'Falha no envio do arquivo.')
  const { error } = await supabase.functions.invoke('attachment-check', { body: { path, bucket: WORKSHOP_BUCKET } })
  if (error) {
    const status = (error as { context?: Response }).context?.status
    if (status === 409) return // já registrado numa tentativa anterior
    throw new Error('O arquivo não passou na conferência.')
  }
}

export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  const list = paths.filter(Boolean)
  if (list.length === 0) return {}
  const { data, error } = await getSupabase().storage.from(WORKSHOP_BUCKET).createSignedUrls(list, 1800)
  if (error) throw error
  const out: Record<string, string> = {}
  for (const item of data ?? []) if (item.path && item.signedUrl) out[item.path] = item.signedUrl
  return out
}

/** Áudio gravado no aparelho: formato aceito e extensão do arquivo. */
export function audioFormat(mimeType: string): { mime: 'audio/mp4' | 'audio/webm' | 'audio/ogg'; ext: 'm4a' | 'webm' | 'ogg' } | null {
  const m = mimeType.toLowerCase()
  if (m.startsWith('audio/mp4') || m.startsWith('audio/aac') || m.startsWith('audio/x-m4a')) return { mime: 'audio/mp4', ext: 'm4a' }
  if (m.startsWith('audio/webm')) return { mime: 'audio/webm', ext: 'webm' }
  if (m.startsWith('audio/ogg')) return { mime: 'audio/ogg', ext: 'ogg' }
  return null
}

export function pistaUrl(origin = typeof window !== 'undefined' ? window.location.origin : '') {
  return `${origin}/pista`
}

export function vehicleLabel(v: { brand: string | null; model: string | null; year?: number | null } | null) {
  if (!v) return 'Moto sem cadastro'
  return [v.brand, v.model, v.year].filter(Boolean).join(' ') || 'Moto'
}
