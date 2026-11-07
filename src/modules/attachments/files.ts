// Regras de arquivo dos anexos (PRD 5.6). Funções puras, sem Supabase, para teste.
import type { Database } from '@/types/supabase'

export type AttachmentKind = Database['public']['Enums']['attachment_kind']
export type AllowedMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'

export const KIND_LABEL: Record<AttachmentKind, string> = {
  invoice: 'Nota fiscal',
  service_order: 'Ordem de serviço',
  receipt: 'Recibo',
  photo: 'Foto',
  document: 'Documento',
  other: 'Outro',
}
export const KINDS = Object.keys(KIND_LABEL) as AttachmentKind[]

export const EXTENSION: Record<AllowedMime, 'jpg' | 'png' | 'webp' | 'pdf'> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

/** Máximo de arquivos por envio no formulário. */
export const MAX_FILES_PER_RECORD = 5
/** Lado maior das fotos depois da compressão. */
export const MAX_IMAGE_SIDE = 2000

/**
 * Descobre o tipo real pelos primeiros bytes, sem confiar na extensão
 * nem no tipo informado pelo navegador.
 */
export function sniffMime(bytes: Uint8Array): AllowedMime | null {
  const b = bytes
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a)
    return 'image/png'
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50)
    return 'image/webp'
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return 'application/pdf'
  return null
}

/** Novo tamanho mantendo a proporção, com o lado maior limitado. */
export function fitWithin(width: number, height: number, max = MAX_IMAGE_SIDE): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= max) return { width, height }
  const scale = max / longest
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/** Caminho no Storage: pasta da moto + nome aleatório. Bate com a regra do banco. */
export function buildStoragePath(motorcycleId: string, mime: AllowedMime, uuid: string = crypto.randomUUID()): string {
  return `${motorcycleId}/${uuid}.${EXTENSION[mime]}`
}

/** Nome exibido: sem pastas, sem caracteres de controle, até 200 caracteres. */
export function cleanFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const base = name.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f]/g, '').trim() ?? ''
  return (base || 'arquivo').slice(0, 200)
}

/** Sugestão de tipo pelo nome do arquivo. */
export function guessKind(name: string, mime: AllowedMime): AttachmentKind {
  const n = name.toLowerCase()
  if (/nota|nf-?e|danfe|fiscal/.test(n)) return 'invoice'
  if (/\bos\b|ordem/.test(n)) return 'service_order'
  if (/recibo/.test(n)) return 'receipt'
  return mime === 'application/pdf' ? 'document' : 'photo'
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024).toLocaleString('pt-BR')} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB`
}

export type StorageUsage = { used_bytes: number; quota_bytes: number; max_file_bytes: number }

/** Confere um arquivo já preparado contra os limites do servidor. Devolve mensagem ou null. */
export function checkLimits(size: number, usage: StorageUsage | undefined, pendingBytes = 0): string | null {
  if (!usage) return null
  if (size > usage.max_file_bytes) return `Arquivo maior que ${formatBytes(usage.max_file_bytes)}.`
  if (usage.used_bytes + pendingBytes + size > usage.quota_bytes) return 'Seu espaço de anexos acabou.'
  return null
}
