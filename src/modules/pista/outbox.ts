import { rpc } from '@/modules/workshop/shared/rpc'
import { uploadWorkshopFile } from './api'

/**
 * Fila do App da Pista (ADR-057): toda ação vai primeiro para o aparelho (IndexedDB) e é enviada
 * em ordem, com novas tentativas. Cada item tem um código único (caminho do arquivo ou client_id),
 * então reenviar nunca duplica no servidor. No iPhone não existe envio em segundo plano: a fila
 * roda ao abrir o app, ao voltar para ele, quando a internet volta e a cada 30 s.
 */

export type OutboxKind = 'photo' | 'audio' | 'note' | 'item' | 'status' | 'ready' | 'take' | 'inspection'

export type OutboxEntry = {
  id: string
  userId: string
  org: string
  orderId: string
  kind: OutboxKind
  args: Record<string, unknown>
  blob?: Blob
  mime?: string
  path?: string
  createdAt: number
  attempts: number
  lastError?: string
  /** Erro definitivo (a OS foi encerrada, sem permissão…): não tenta mais, mostra ao mecânico. */
  failed?: boolean
}

const DB = 'pista'
const STORE = 'outbox'
let dbPromise: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('user', 'userId')
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const d = await db()
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode)
    const req = fn(t.objectStore(STORE))
    t.oncomplete = () => resolve(req ? (req as IDBRequest<T>).result : undefined)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

export async function listOutbox(userId: string): Promise<OutboxEntry[]> {
  const all = (await tx<OutboxEntry[]>('readonly', (s) => s.index('user').getAll(userId))) ?? []
  return all.sort((a, b) => a.createdAt - b.createdAt)
}

export async function enqueue(entry: Omit<OutboxEntry, 'id' | 'createdAt' | 'attempts'> & { id?: string }) {
  const full: OutboxEntry = { ...entry, id: entry.id ?? crypto.randomUUID(), createdAt: Date.now(), attempts: 0 }
  await tx('readwrite', (s) => s.put(full))
  notify()
  void flush(entry.userId)
  return full
}

export async function removeEntry(id: string) {
  await tx('readwrite', (s) => s.delete(id))
  notify()
}

async function save(entry: OutboxEntry) {
  await tx('readwrite', (s) => s.put(entry))
}

const listeners = new Set<() => void>()
export function onOutboxChange(fn: () => void) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
function notify() {
  for (const fn of listeners) fn()
}

/** Erros do servidor que não melhoram tentando de novo. */
function isPermanent(err: unknown): boolean {
  const e = err as { code?: string; message?: string }
  return ['42501', '22023', 'P0001', 'P0002', '23514'].includes(e?.code ?? '')
}

async function send(e: OutboxEntry) {
  const base = { p_org: e.org, p_order: e.orderId }
  switch (e.kind) {
    case 'photo':
      if (!e.blob || !e.path || !e.mime) throw Object.assign(new Error('Foto sem arquivo.'), { code: 'P0001' })
      await uploadWorkshopFile(e.path, e.blob, e.mime)
      await rpc('pista_add_photo', { ...base, p_path: e.path, p_phase: e.args.phase, p_caption: e.args.caption ?? null })
      return
    case 'audio':
      if (!e.blob || !e.path || !e.mime) throw Object.assign(new Error('Áudio sem arquivo.'), { code: 'P0001' })
      await uploadWorkshopFile(e.path, e.blob, e.mime)
      await rpc('pista_add_audio', { ...base, p_path: e.path, p_duration: e.args.duration, p_title: e.args.title ?? null, p_item: e.args.item ?? null })
      return
    case 'note':
      await rpc('pista_add_note', { ...base, p_client_id: e.id, p_body: e.args.body, p_item: e.args.item ?? null })
      return
    case 'item':
      await rpc('pista_set_item', { ...base, p_item: e.args.item, p_status: e.args.status })
      return
    case 'status':
      await rpc('pista_set_status', { ...base, p_status: e.args.status })
      return
    case 'ready':
      await rpc('pista_mark_ready', { ...base, p_km_out: e.args.km_out ?? null })
      return
    case 'take':
      await rpc('pista_take_order', base)
      return
    case 'inspection':
      await rpc('pista_save_inspection', { ...base, p_phase: e.args.phase, p_data: e.args.data })
      return
  }
}

let running = false
let onSent: ((e: OutboxEntry) => void) | null = null
export function onEntrySent(fn: (e: OutboxEntry) => void) {
  onSent = fn
}

/** Envia a fila em ordem. Para no primeiro erro de rede para manter a ordem das ações. */
export async function flush(userId: string): Promise<void> {
  if (running || typeof navigator !== 'undefined' && navigator.onLine === false) return
  running = true
  try {
    for (const e of await listOutbox(userId)) {
      if (e.failed) continue
      try {
        await send(e)
        await removeEntry(e.id)
        onSent?.(e)
      } catch (err) {
        e.attempts += 1
        e.lastError = (err as Error)?.message ?? 'Falha no envio.'
        if (isPermanent(err)) e.failed = true
        await save(e)
        notify()
        if (!e.failed) break
      }
    }
  } finally {
    running = false
  }
}

export function startOutbox(userId: string): () => void {
  const run = () => { void flush(userId) }
  const onVisible = () => { if (document.visibilityState === 'visible') run() }
  window.addEventListener('online', run)
  document.addEventListener('visibilitychange', onVisible)
  const timer = window.setInterval(run, 30_000)
  run()
  return () => {
    window.removeEventListener('online', run)
    document.removeEventListener('visibilitychange', onVisible)
    window.clearInterval(timer)
  }
}
