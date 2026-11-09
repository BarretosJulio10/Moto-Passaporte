import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { translateDbError } from '@/core/shared/dbErrors'
import { formatKm } from '@/core/shared/format'
import { ENTRY_ITEMS, EXIT_ITEMS, FUEL_LEVELS, STATE_LABEL, type InspectionState } from '@/modules/workshop/service-orders/api'
import {
  audioFormat, fetchPistaOrder, PHASE_LABEL, PISTA_STATUS_LABEL, PISTA_STATUS_TONE, preparePhoto, signedUrls, vehicleLabel,
  type PistaItem, type PistaOrder, type PistaPhase,
} from './api'
import { cacheRead, usePista, withCache } from './PistaApp'
import { enqueue, onEntrySent, type OutboxEntry } from './outbox'
import { AudioPlayer } from './AudioPlayer'

const CLOSED = ['completed', 'awaiting_pickup', 'delivered', 'canceled']

function defaultPhase(o: PistaOrder): PistaPhase {
  if (o.status === 'ready') return 'exit'
  if (['in_progress', 'paused', 'awaiting_parts', 'awaiting_complement'].includes(o.status)) return 'work'
  return 'entry'
}

function time(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function PistaOrderPage() {
  const { orderId = '' } = useParams()
  const { shop, userId, outbox, online } = usePista()
  const org = shop.organization_id
  const qc = useQueryClient()
  const key = `order:${org}:${orderId}`
  const order = useQuery({
    queryKey: ['pista-order', org, orderId],
    queryFn: () => withCache(key, () => fetchPistaOrder(org, orderId)),
    initialData: () => cacheRead<PistaOrder>(key),
    refetchInterval: online ? 45_000 : false,
  })
  useEffect(() => {
    onEntrySent((e) => {
      if (e.orderId === orderId) void qc.invalidateQueries({ queryKey: ['pista-order', org, orderId] })
      void qc.invalidateQueries({ queryKey: ['pista-orders', org] })
    })
  }, [qc, org, orderId])

  const mine = outbox.filter((e) => e.orderId === orderId && !e.failed)
  const o = order.data
  if (order.isLoading && !o) return <p className="p-6 text-muted" role="status">Carregando OS…</p>
  if (!o) return <p className="m-4 rounded-xl bg-danger/10 p-4 text-danger">{translateDbError(order.error as { message?: string })}</p>

  const closed = CLOSED.includes(o.status)
  const canAct = !closed && (o.mine || shop.is_responsible || !o.mechanic_user_id)
  const queue = (kind: OutboxEntry['kind'], args: Record<string, unknown>, extra: Partial<OutboxEntry> = {}) =>
    enqueue({ userId, org, orderId, kind, args, ...extra })

  return (
    <div className="pb-6">
      <section className="bg-sheet px-4 pb-4 pt-3 shadow-sm">
        <Link to="/pista" className="text-sm font-semibold text-muted">← Minhas OS</Link>
        <div className="mt-1 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-3xl font-bold tracking-wider">{o.vehicle?.plate || `OS ${o.number}`}</p>
            <p className="text-graphite">{vehicleLabel(o.vehicle)}{o.vehicle?.color ? ` · ${o.vehicle.color}` : ''}</p>
            <p className="text-sm text-muted">OS {o.number} · {o.customer_name}{o.km_in != null ? ` · entrada ${formatKm(o.km_in)}` : ''}</p>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${PISTA_STATUS_TONE[o.status]}`}>{PISTA_STATUS_LABEL[o.status]}</span>
        </div>
        {o.notes && <p className="mt-3 rounded-xl bg-paper px-3 py-2 text-graphite"><span className="font-semibold">Pedido do cliente: </span>{o.notes}</p>}
        {!o.mechanic_user_id && !closed && (
          <button type="button" onClick={() => void queue('take', {})}
            className="mt-3 h-14 w-full rounded-xl bg-[#D66C20] text-lg font-bold text-white">Pegar esta OS</button>
        )}
        {o.mechanic_user_id && !o.mine && <p className="mt-2 text-sm text-muted">Mecânico: {o.mechanic_name ?? '—'}</p>}
      </section>

      {canAct && <StatusBar order={o} allowReady={shop.allow_ready || shop.is_responsible} queue={queue} />}
      {closed && <p className="m-3 rounded-xl bg-paper p-3 text-graphite">Esta OS foi encerrada no painel. Os registros ficam guardados.</p>}

      <ItemsSection order={o} pending={mine} canAct={canAct} queue={queue} />
      <PhotosSection order={o} pending={mine} canAct={canAct} queue={queue} />
      <NotesSection order={o} pending={mine} canAct={canAct} queue={queue} userId={userId} />
      <AudioSection order={o} pending={mine} canAct={canAct} queue={queue} />
      <ChecklistSection order={o} canAct={canAct} queue={queue} />

      {canAct && (
        <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 gap-2 border-t border-rule bg-sheet px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]"
          aria-label="Registrar">
          <a href="#fotos" className="flex h-14 items-center justify-center rounded-xl bg-ink text-base font-bold text-sheet">📷 Foto</a>
          <a href="#notas" className="flex h-14 items-center justify-center rounded-xl border border-rule text-base font-bold">✏️ Nota</a>
          <a href="#audio" className="flex h-14 items-center justify-center rounded-xl border border-rule text-base font-bold">🎙️ Áudio</a>
        </nav>
      )}
    </div>
  )
}

type Queue = (kind: OutboxEntry['kind'], args: Record<string, unknown>, extra?: Partial<OutboxEntry>) => Promise<unknown>

function Section({ id, title, children, aside }: { id: string; title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section id={id} className="mx-3 mt-4 scroll-mt-24 rounded-2xl border border-rule bg-sheet p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

function StatusBar({ order, allowReady, queue }: { order: PistaOrder; allowReady: boolean; queue: Queue }) {
  const [readyOpen, setReadyOpen] = useState(false)
  const [km, setKm] = useState(order.km_out?.toString() ?? '')
  const exitPhotos = order.photos.filter((p) => p.phase === 'exit').length
  const btn = (status: string, label: string, primary = false) => (
    <button type="button" onClick={() => void queue('status', { status })} disabled={order.status === status}
      className={`h-14 rounded-xl text-base font-bold disabled:opacity-40 ${primary ? 'bg-ink text-sheet' : 'border border-rule bg-sheet'}`}>{label}</button>
  )
  return (
    <div className="mx-3 mt-3">
      <div className="grid grid-cols-2 gap-2">
        {btn('in_progress', order.status === 'in_progress' ? 'Em execução' : 'Iniciar', true)}
        {btn('paused', 'Pausar')}
        {btn('awaiting_parts', 'Aguardando peça')}
        {allowReady && (
          <button type="button" onClick={() => setReadyOpen(true)} disabled={order.status === 'ready'}
            className="h-14 rounded-xl bg-ok text-base font-bold text-sheet disabled:opacity-40">Pronto</button>
        )}
      </div>
      {readyOpen && (
        <div className="mt-3 rounded-2xl border border-ok bg-ok/5 p-4">
          <p className="font-bold">Marcar como pronto</p>
          {exitPhotos === 0 && <p className="mt-1 text-sm text-brass">Ainda não há foto de saída. Tire antes, se puder.</p>}
          <label className="mt-2 block">
            <span className="text-sm font-semibold">Km de saída</span>
            <input inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value.replace(/\D/g, '').slice(0, 7))}
              className="mt-1 h-14 w-full rounded-xl border border-rule bg-sheet px-4 text-lg" placeholder={order.km_in?.toString() ?? ''} />
          </label>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" className="h-12 rounded-xl border border-rule bg-sheet font-semibold" onClick={() => setReadyOpen(false)}>Voltar</button>
            <button type="button" className="h-12 rounded-xl bg-ok font-bold text-sheet"
              onClick={() => { void queue('ready', { km_out: km ? Number(km) : null }); setReadyOpen(false) }}>Confirmar</button>
          </div>
        </div>
      )}
    </div>
  )
}

function ItemsSection({ order, pending, canAct, queue }: { order: PistaOrder; pending: OutboxEntry[]; canAct: boolean; queue: Queue }) {
  const local = new Map<string, string>()
  for (const e of pending) if (e.kind === 'item') local.set(String(e.args.item), String(e.args.status))
  if (order.items.length === 0) return null
  const done = order.items.filter((i) => (local.get(i.id) ?? i.status) === 'done').length
  return (
    <Section id="itens" title="O que fazer" aside={<span className="text-sm text-muted">{done}/{order.items.length} feitos</span>}>
      <ul className="space-y-2">
        {order.items.map((i: PistaItem) => {
          const status = local.get(i.id) ?? i.status
          const isDone = status === 'done'
          return (
            <li key={i.id} className={`rounded-xl border p-3 ${isDone ? 'border-ok bg-ok/5' : status === 'not_done' ? 'border-rule bg-paper opacity-70' : 'border-rule'}`}>
              <button type="button" disabled={!canAct} onClick={() => void queue('item', { item: i.id, status: isDone ? 'pending' : 'done' })}
                className="flex w-full items-center gap-3 text-left" aria-pressed={isDone}>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 text-lg font-bold ${isDone ? 'border-ok bg-ok text-sheet' : 'border-rule'}`}>{isDone ? '✓' : ''}</span>
                <span className="min-w-0">
                  <span className={`block font-semibold ${status === 'not_done' ? 'line-through' : ''}`}>{i.description}</span>
                  <span className="block text-xs text-muted">
                    {i.quantity !== 1 ? `${i.quantity} × · ` : ''}{i.kind === 'labor' ? 'Serviço' : 'Peça/material'}
                    {i.executed_by_name && isDone ? ` · feito por ${i.executed_by_name}` : ''}
                    {local.has(i.id) ? ' · enviando…' : ''}
                  </span>
                </span>
              </button>
              {canAct && !isDone && status !== 'not_done' && (
                <button type="button" onClick={() => void queue('item', { item: i.id, status: 'not_done' })} className="mt-1 text-xs font-semibold text-muted underline">Não foi feito</button>
              )}
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

function useSigned(paths: string[]) {
  const key = paths.join('|')
  return useQuery({ queryKey: ['pista-signed', key], queryFn: () => signedUrls(paths), enabled: paths.length > 0, staleTime: 20 * 60_000, retry: false })
}

function PhotosSection({ order, pending, canAct, queue }: { order: PistaOrder; pending: OutboxEntry[]; canAct: boolean; queue: Queue }) {
  const { shop } = usePista()
  const [phase, setPhase] = useState<PistaPhase>(() => defaultPhase(order))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const signed = useSigned(order.photos.map((p) => p.storage_path))
  const local = pending.filter((e) => e.kind === 'photo')
  const localUrls = useMemo(() => local.map((e) => ({ id: e.id, url: e.blob ? URL.createObjectURL(e.blob) : '' })), [local.map((e) => e.id).join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => localUrls.forEach((u) => URL.revokeObjectURL(u.url)), [localUrls])

  async function onFiles(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    setError(null)
    for (const file of Array.from(files).slice(0, 20)) {
      try {
        const p = await preparePhoto(file)
        const path = `${shop.organization_id}/${crypto.randomUUID()}.${p.ext}` // pasta = oficina (regra do bucket)
        await queue('photo', { phase, caption: null }, { blob: p.blob, mime: p.mime, path })
      } catch (err) {
        setError((err as Error).message)
      }
    }
    setBusy(false)
    if (input.current) input.current.value = ''
  }
  return (
    <Section id="fotos" title="Fotos" aside={<span className="text-sm text-muted">{order.photos.length + local.length}/60</span>}>
      {canAct && (
        <>
          <div className="mb-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Etapa da foto">
            {(['entry', 'work', 'exit'] as PistaPhase[]).map((ph) => (
              <button key={ph} type="button" role="radio" aria-checked={phase === ph} onClick={() => setPhase(ph)}
                className={`h-11 rounded-xl text-sm font-bold ${phase === ph ? 'bg-ink text-sheet' : 'border border-rule'}`}>{PHASE_LABEL[ph]}</button>
            ))}
          </div>
          <label className={`flex h-16 cursor-pointer items-center justify-center rounded-xl bg-[#D66C20] text-lg font-bold text-white ${busy ? 'opacity-60' : ''}`}>
            {busy ? 'Preparando…' : `📷 Tirar foto (${PHASE_LABEL[phase].toLowerCase()})`}
            <input ref={input} type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={(e) => void onFiles(e.target.files)} />
          </label>
          {error && <p className="mt-2 text-sm font-semibold text-danger" role="alert">{error}</p>}
        </>
      )}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {localUrls.map((u) => (
          <div key={u.id} className="relative aspect-square overflow-hidden rounded-lg bg-paper">
            {u.url && <img src={u.url} alt="Foto aguardando envio" className="h-full w-full object-cover opacity-70" />}
            <span className="absolute inset-x-0 bottom-0 bg-ink/70 px-1 py-0.5 text-center text-[10px] font-bold text-sheet">enviando…</span>
          </div>
        ))}
        {[...order.photos].reverse().map((p) => (
          <a key={p.id} href={signed.data?.[p.storage_path]} target="_blank" rel="noreferrer" className="relative aspect-square overflow-hidden rounded-lg bg-paper">
            {signed.data?.[p.storage_path] && <img src={signed.data[p.storage_path]} alt={p.caption ?? `Foto de ${PHASE_LABEL[p.phase]}`} className="h-full w-full object-cover" loading="lazy" />}
            <span className="absolute inset-x-0 bottom-0 bg-ink/60 px-1 py-0.5 text-center text-[10px] font-semibold text-sheet">{PHASE_LABEL[p.phase]}</span>
          </a>
        ))}
      </div>
      {order.photos.length + local.length === 0 && <p className="mt-2 text-sm text-muted">Nenhuma foto ainda.</p>}
    </Section>
  )
}

function NotesSection({ order, pending, canAct, queue, userId }: { order: PistaOrder; pending: OutboxEntry[]; canAct: boolean; queue: Queue; userId: string }) {
  const [text, setText] = useState('')
  const [item, setItem] = useState('')
  const local = pending.filter((e) => e.kind === 'note')
  const notes = order.notes_list.filter((n) => !n.voided)
  const itemName = (id: string | null) => order.items.find((i) => i.id === id)?.description
  return (
    <Section id="notas" title="Notas">
      {canAct && (
        <div className="space-y-2">
          <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 2000))} rows={3}
            placeholder="Escreva ou toque no microfone do teclado para ditar"
            className="w-full rounded-xl border border-rule bg-paper px-4 py-3 text-lg" aria-label="Nova nota" />
          {order.items.length > 0 && (
            <select value={item} onChange={(e) => setItem(e.target.value)} className="h-12 w-full rounded-xl border border-rule bg-sheet px-3" aria-label="Sobre qual item">
              <option value="">Nota geral da OS</option>
              {order.items.map((i) => <option key={i.id} value={i.id}>{i.description}</option>)}
            </select>
          )}
          <button type="button" disabled={!text.trim()} onClick={() => { void queue('note', { body: text.trim(), item: item || null }); setText(''); setItem('') }}
            className="h-14 w-full rounded-xl bg-ink text-lg font-bold text-sheet disabled:opacity-40">Salvar nota</button>
        </div>
      )}
      <ul className="mt-3 space-y-2">
        {local.map((e) => (
          <li key={e.id} className="rounded-xl bg-paper p-3 opacity-80">
            <p className="whitespace-pre-wrap">{String(e.args.body)}</p>
            <p className="mt-1 text-xs text-muted">enviando…</p>
          </li>
        ))}
        {[...notes].reverse().map((n) => (
          <li key={n.id} className="rounded-xl bg-paper p-3">
            <p className="whitespace-pre-wrap">{n.body}</p>
            <p className="mt-1 text-xs text-muted">
              {n.created_by === userId ? 'Você' : n.created_by_name ?? 'Equipe'} · {time(n.created_at)}{n.item_id ? ` · ${itemName(n.item_id) ?? 'item'}` : ''}
            </p>
          </li>
        ))}
      </ul>
      {notes.length + local.length === 0 && !canAct && <p className="text-sm text-muted">Nenhuma nota.</p>}
    </Section>
  )
}

const MAX_SECONDS = 120

function AudioSection({ order, pending, canAct, queue }: { order: PistaOrder; pending: OutboxEntry[]; canAct: boolean; queue: Queue }) {
  const { shop } = usePista()
  const [state, setState] = useState<'idle' | 'recording' | 'review'>('idle')
  const [seconds, setSeconds] = useState(0)
  const [blob, setBlob] = useState<{ data: Blob; mime: string; ext: string; seconds: number } | null>(null)
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [blocked, setBlocked] = useState(false)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const started = useRef(0)
  const timer = useRef<number | null>(null)
  const signed = useSigned(order.audios.map((a) => a.storage_path ?? '').filter(Boolean))
  const local = pending.filter((e) => e.kind === 'audio')
  const reviewUrl = useMemo(() => (blob ? URL.createObjectURL(blob.data) : ''), [blob])
  useEffect(() => () => { if (reviewUrl) URL.revokeObjectURL(reviewUrl) }, [reviewUrl])
  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); recorder.current?.stream.getTracks().forEach((t) => t.stop()) }, [])

  async function start() {
    setError(null)
    setBlocked(false)
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Este celular não grava áudio pelo app. Use a nota com o microfone do teclado.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find((t) => MediaRecorder.isTypeSupported?.(t))
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined)
      chunks.current = []
      rec.ondataavailable = (ev) => { if (ev.data.size) chunks.current.push(ev.data) }
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const fmt = audioFormat(rec.mimeType || type || '')
        const secs = Math.max(1, Math.min(MAX_SECONDS, Math.round((Date.now() - started.current) / 1000)))
        if (!fmt) { setError('Formato de áudio deste celular não é aceito.'); setState('idle'); return }
        setBlob({ data: new Blob(chunks.current, { type: fmt.mime }), mime: fmt.mime, ext: fmt.ext, seconds: secs })
        setState('review')
      }
      recorder.current = rec
      started.current = Date.now()
      setSeconds(0)
      rec.start()
      setState('recording')
      timer.current = window.setInterval(() => {
        const s = Math.round((Date.now() - started.current) / 1000)
        setSeconds(s)
        if (s >= MAX_SECONDS) stop()
      }, 250)
    } catch (err) {
      const name = (err as { name?: string })?.name ?? ''
      if (name === 'NotAllowedError' || name === 'SecurityError') setBlocked(true)
      else if (name === 'NotFoundError') setError('Nenhum microfone encontrado neste celular.')
      else setError('Não foi possível usar o microfone agora. Feche outros apps que estejam gravando e tente de novo.')
    }
  }
  function stop() {
    if (timer.current) { window.clearInterval(timer.current); timer.current = null }
    if (recorder.current?.state === 'recording') recorder.current.stop()
  }
  function save() {
    if (!blob) return
    const path = `${shop.organization_id}/${crypto.randomUUID()}.${blob.ext}`
    void queue('audio', { duration: blob.seconds, title: title.trim() || null }, { blob: blob.data, mime: blob.mime, path })
    setBlob(null)
    setTitle('')
    setState('idle')
  }
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <Section id="audio" title="Áudios" aside={<span className="text-sm text-muted">só a equipe ouve</span>}>
      {canAct && state === 'idle' && (
        <button type="button" onClick={() => void start()} className="h-16 w-full rounded-xl bg-[#D66C20] text-lg font-bold text-white">🎙️ Gravar áudio (até 2 min)</button>
      )}
      {state === 'recording' && (
        <button type="button" onClick={stop} className="h-16 w-full animate-pulse rounded-xl bg-danger text-lg font-bold text-white">■ Parar · {mmss(seconds)}</button>
      )}
      {state === 'review' && blob && (
        <div className="space-y-2 rounded-xl bg-paper p-3">
          <audio controls src={reviewUrl} className="w-full" />
          <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 120))} placeholder="Título (opcional), ex.: barulho na relação"
            className="h-12 w-full rounded-xl border border-rule bg-sheet px-3" aria-label="Título do áudio" />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => { setBlob(null); setState('idle') }} className="h-12 rounded-xl border border-rule bg-sheet font-semibold">Descartar</button>
            <button type="button" onClick={save} className="h-12 rounded-xl bg-ink font-bold text-sheet">Salvar áudio</button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm font-semibold text-danger" role="alert">{error}</p>}
      {blocked && <MicHelp onRetry={() => void start()} />}
      <ul className="mt-3 space-y-2">
        {local.map((e) => (
          <li key={e.id} className="rounded-xl bg-paper p-3 text-sm opacity-80">{String(e.args.title ?? 'Áudio')} · {mmss(Number(e.args.duration))} · enviando…</li>
        ))}
        {[...order.audios].reverse().map((a) => (
          <li key={a.id} className="rounded-xl bg-paper p-3">
            <p className="font-semibold">{a.title ?? 'Áudio'} <span className="font-normal text-muted">· {mmss(a.duration_seconds)}</span></p>
            {a.expired || !a.storage_path
              ? <p className="text-sm text-muted">Áudio expirado (apagado 90 dias após a entrega).</p>
              : <AudioPlayer src={signed.data?.[a.storage_path]} />}
            <p className="mt-1 text-xs text-muted">{a.created_by_name ?? 'Equipe'} · {time(a.created_at)}</p>
          </li>
        ))}
      </ul>
    </Section>
  )
}

const STATES: InspectionState[] = ['ok', 'atencao', 'avaria', 'na']
const STATE_TONE: Record<InspectionState, string> = { ok: 'bg-ok text-sheet', atencao: 'bg-brass text-sheet', avaria: 'bg-danger text-sheet', na: 'bg-muted text-sheet' }

function ChecklistSection({ order, canAct, queue }: { order: PistaOrder; canAct: boolean; queue: Queue }) {
  const [phase, setPhase] = useState<'entry' | 'exit'>(order.status === 'ready' ? 'exit' : 'entry')
  const current = order.inspections[phase]
  const base = phase === 'entry' ? ENTRY_ITEMS : EXIT_ITEMS
  const locked = phase === 'entry' ? Boolean(current?.customer_ack_at) : false
  const [items, setItems] = useState(current?.items ?? {})
  const [fuel, setFuel] = useState(current?.fuel_level ?? '')
  const [keys, setKeys] = useState(current?.keys_count?.toString() ?? '')
  const [km, setKm] = useState(current?.km?.toString() ?? (phase === 'entry' ? order.km_in?.toString() ?? '' : order.km_out?.toString() ?? ''))
  const [notes, setNotes] = useState(current?.notes ?? '')
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    const c = order.inspections[phase]
    setItems(c?.items ?? (phase === 'exit' ? {} : {}))
    setFuel(c?.fuel_level ?? '')
    setKeys(c?.keys_count?.toString() ?? '')
    setKm(c?.km?.toString() ?? (phase === 'entry' ? order.km_in?.toString() ?? '' : order.km_out?.toString() ?? ''))
    setNotes(c?.notes ?? '')
    setSaved(false)
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Section id="checklist" title="Checklist" aside={current ? <span className="text-xs text-muted">salvo {time(current.recorded_at)}</span> : undefined}>
      <div className="mb-3 grid grid-cols-2 gap-2">
        {(['entry', 'exit'] as const).map((p) => (
          <button key={p} type="button" onClick={() => setPhase(p)} className={`h-11 rounded-xl font-bold ${phase === p ? 'bg-ink text-sheet' : 'border border-rule'}`}>
            {p === 'entry' ? 'Entrada' : 'Saída'}
          </button>
        ))}
      </div>
      {locked && <p className="mb-2 rounded-xl bg-ok/10 p-2 text-sm">O cliente já confirmou o checklist de entrada; ele não muda mais.</p>}
      <ul className="space-y-2">
        {base.map((b) => {
          const st = items[b.key]?.state
          return (
            <li key={b.key}>
              <p className="text-sm font-semibold">{b.label}</p>
              <div className="mt-1 grid grid-cols-4 gap-1">
                {STATES.map((s) => (
                  <button key={s} type="button" disabled={!canAct || locked}
                    onClick={() => { setItems({ ...items, [b.key]: { ...items[b.key], state: s } }); setSaved(false) }}
                    className={`h-10 rounded-lg text-xs font-bold ${st === s ? STATE_TONE[s] : 'border border-rule bg-sheet'}`}>{STATE_LABEL[s]}</button>
                ))}
              </div>
            </li>
          )
        })}
      </ul>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <label className="block">
          <span className="text-xs font-semibold">Combustível</span>
          <select value={fuel} onChange={(e) => setFuel(e.target.value)} disabled={!canAct || locked} className="mt-1 h-12 w-full rounded-xl border border-rule bg-sheet px-2">
            <option value="">—</option>
            {FUEL_LEVELS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold">Chaves</span>
          <input inputMode="numeric" value={keys} onChange={(e) => setKeys(e.target.value.replace(/\D/g, '').slice(0, 1))} disabled={!canAct || locked}
            className="mt-1 h-12 w-full rounded-xl border border-rule bg-sheet px-2" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold">Km</span>
          <input inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value.replace(/\D/g, '').slice(0, 7))} disabled={!canAct || locked}
            className="mt-1 h-12 w-full rounded-xl border border-rule bg-sheet px-2" />
        </label>
      </div>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 500))} disabled={!canAct || locked} rows={2} placeholder="Observações"
        className="mt-2 w-full rounded-xl border border-rule bg-paper px-3 py-2" aria-label="Observações do checklist" />
      {canAct && !locked && (
        <button type="button" onClick={() => { void queue('inspection', { phase, data: { items, fuel_level: fuel, keys_count: keys, km, notes } }); setSaved(true) }}
          className="mt-2 h-14 w-full rounded-xl bg-ink text-lg font-bold text-sheet">{saved ? 'Salvo ✓' : `Salvar checklist de ${phase === 'entry' ? 'entrada' : 'saída'}`}</button>
      )}
    </Section>
  )
}

/** Microfone bloqueado: o site não consegue abrir as configurações; mostra o caminho em cada celular. */
function MicHelp({ onRetry }: { onRetry: () => void }) {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const installed = window.matchMedia?.('(display-mode: standalone)').matches === true
  return (
    <div className="mt-3 rounded-xl border border-danger/40 bg-danger/5 p-3 text-sm text-graphite" role="alert">
      <p className="font-bold text-danger">O microfone está bloqueado para o App da Pista.</p>
      <p className="mt-1">O celular não deixa o app abrir essa configuração. Libere assim e toque em “Tentar de novo”:</p>
      {ios ? (
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Abra <strong>Ajustes</strong> do iPhone → <strong>Safari</strong> → <strong>Microfone</strong>.</li>
          <li>Escolha <strong>Perguntar</strong> ou <strong>Permitir</strong>.</li>
          <li>Volte ao app e toque em gravar: quando perguntar, toque em <strong>Permitir</strong>.</li>
        </ol>
      ) : installed ? (
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Segure o dedo no ícone <strong>Pista</strong> na tela de início → <strong>Informações do app</strong> (ⓘ).</li>
          <li><strong>Permissões</strong> → <strong>Microfone</strong> → <strong>Permitir só durante o uso</strong>.</li>
        </ol>
      ) : (
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Toque no <strong>cadeado</strong> (ou ícone de ajustes) ao lado do endereço, no alto da tela.</li>
          <li><strong>Permissões</strong> → <strong>Microfone</strong> → <strong>Permitir</strong>.</li>
        </ol>
      )}
      <button type="button" onClick={onRetry} className="mt-3 h-11 w-full rounded-xl bg-ink font-bold text-sheet">Tentar de novo</button>
    </div>
  )
}
