import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { SelectField, TextAreaField, TextField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { translateDbError } from '@/core/shared/dbErrors'
import { formatKm } from '@/core/shared/format'
import { Card } from '../shared/WorkshopShell'
import { formatDateTime, onlyDigits } from '../shared/rpc'
import {
  ENTRY_ITEMS, EXIT_ITEMS, FUEL_LEVELS, PHOTO_PHASE_LABEL, STATE_LABEL, photoUrls, removePhoto, saveInspection, uploadOrderPhoto,
  type Inspection, type InspectionItems, type InspectionState, type Order, type PhotoPhase,
} from './api'

type Err = { code?: string; message?: string }
const STATES: InspectionState[] = ['ok', 'atencao', 'avaria', 'na']
const STATE_TONE: Record<InspectionState, string> = {
  ok: 'border-ok bg-ok text-sheet', atencao: 'border-brass bg-brass text-sheet', avaria: 'border-danger bg-danger text-sheet', na: 'border-muted bg-muted text-sheet',
}

/** Checklist de entrada ou saída (PRD 2.1 §9). Itens padrão + itens extras livres. */
export function InspectionCard({ orgId, order, phase, canEdit, onSaved }: {
  orgId: string; order: Order; phase: 'entry' | 'exit'; canEdit: boolean; onSaved: () => Promise<unknown>
}) {
  const current: Inspection | undefined = order.inspections[phase]
  const base = phase === 'entry' ? ENTRY_ITEMS : EXIT_ITEMS
  const locked = phase === 'entry'
    ? Boolean(current?.customer_ack_at) || ['completed', 'awaiting_pickup', 'delivered', 'canceled'].includes(order.status)
    : ['delivered', 'canceled'].includes(order.status)
  const [editing, setEditing] = useState(phase === 'entry' && !current && canEdit && !locked)
  const [items, setItems] = useState<InspectionItems>(() => current?.items ?? {})
  const [extra, setExtra] = useState('')
  const [fuel, setFuel] = useState(current?.fuel_level ?? '')
  const [keys, setKeys] = useState(current?.keys_count?.toString() ?? '')
  const [km, setKm] = useState(current?.km?.toString() ?? (phase === 'entry' ? order.km_in?.toString() ?? '' : ''))
  const [notes, setNotes] = useState(current?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const keysAll = [...base.map((b) => b.key), ...Object.keys(items).filter((k) => !base.some((b) => b.key === k))]
  const label = (k: string) => base.find((b) => b.key === k)?.label ?? k

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await saveInspection(orgId, order.id, phase, { items, fuel_level: fuel, keys_count: keys, km: onlyDigits(km), notes })
      await onSaved()
      setEditing(false)
    } catch (err) {
      setError(translateDbError(err as Err))
    } finally {
      setSaving(false)
    }
  }

  const title = phase === 'entry' ? 'Checklist de entrada' : 'Checklist de saída'
  return (
    <Card title={title} actions={canEdit && !locked && !editing && <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>{current ? 'Editar' : 'Preencher'}</Button>}>
      {phase === 'entry' && current?.customer_ack_at && (
        <p className="mb-3 rounded-doc border border-ok/40 bg-ok/5 px-3 py-2 text-sm text-graphite">
          Ciência do cliente: {current.customer_ack_name} em {formatDateTime(current.customer_ack_at)}. O checklist não muda mais.
        </p>
      )}
      {!editing && !current && <p className="text-muted">Ainda não preenchido.</p>}
      {!editing && current && (
        <div className="text-sm">
          <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
            {Object.entries(current.items).map(([k, v]) => (
              <li key={k} className="flex items-start justify-between gap-2 border-b border-rule/60 py-1">
                <span className="text-graphite">{label(k)}{v.note ? <span className="block text-xs text-muted">{v.note}</span> : null}</span>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${STATE_TONE[v.state]}`}>{STATE_LABEL[v.state]}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-muted">
            {[current.km !== null ? formatKm(current.km) : null, current.fuel_level ? `combustível ${current.fuel_level}` : null,
              current.keys_count !== null ? `${current.keys_count} chave${current.keys_count === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ')}
          </p>
          {current.notes && <p className="mt-1 whitespace-pre-line text-graphite">{current.notes}</p>}
          <p className="mt-1 text-xs text-muted">Registrado por {current.recorded_by_name ?? 'equipe'} em {formatDateTime(current.recorded_at)}.</p>
        </div>
      )}
      {editing && (
        <div>
          <ul className="flex flex-col gap-2">
            {keysAll.map((k) => {
              const v = items[k]
              return (
                <li key={k} className="rounded-doc border border-rule p-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-graphite">{label(k)}</span>
                    <span className="flex flex-wrap gap-1" role="radiogroup" aria-label={label(k)}>
                      {STATES.map((s) => (
                        <button key={s} type="button" role="radio" aria-checked={v?.state === s}
                          onClick={() => setItems({ ...items, [k]: { ...v, state: s } })}
                          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${v?.state === s ? STATE_TONE[s] : 'border-rule text-ink hover:border-ink'}`}>
                          {STATE_LABEL[s]}
                        </button>
                      ))}
                    </span>
                  </div>
                  {v && v.state !== 'ok' && v.state !== 'na' && (
                    <input value={v.note ?? ''} onChange={(e) => setItems({ ...items, [k]: { ...v, note: e.target.value.slice(0, 300) } })}
                      placeholder="Descreva (onde, tamanho…)" aria-label={`Observação: ${label(k)}`}
                      className="mt-2 w-full rounded-doc border border-rule bg-sheet px-3 py-1.5 text-sm focus:border-ink focus:outline-none" />
                  )}
                </li>
              )
            })}
          </ul>
          <div className="mt-2 flex gap-2">
            <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Outro item (ex.: baú, protetor de motor)" aria-label="Outro item"
              className="flex-1 rounded-doc border border-rule bg-sheet px-3 py-2 text-sm focus:border-ink focus:outline-none" />
            <Button size="sm" variant="secondary" onClick={() => { const k = extra.trim().slice(0, 60); if (k && !items[k]) setItems({ ...items, [k]: { state: 'ok' } }); setExtra('') }}>Incluir</Button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <TextField label="Quilometragem" value={km} onChange={(e) => setKm(e.target.value)} inputMode="numeric" />
            {phase === 'entry' && <SelectField label="Combustível" value={fuel} options={FUEL_LEVELS} placeholder="Não informado" onChange={(e) => setFuel(e.target.value)} />}
            {phase === 'entry' && <TextField label="Chaves entregues" value={keys} onChange={(e) => setKeys(e.target.value)} inputMode="numeric" />}
            <TextAreaField label={phase === 'entry' ? 'Observações da entrada' : 'Testes, pendências e observações'} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="sm:col-span-3" />
          </div>
          {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={save} loading={saving}>Salvar checklist</Button>
            {current && <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>}
          </div>
        </div>
      )}
    </Card>
  )
}

/** Fotos da OS em bucket privado; links temporários de 10 min (PRD 2.1 §20.3). */
export function PhotosCard({ orgId, order, canEdit, onChanged }: { orgId: string; order: Order; canEdit: boolean; onChanged: () => Promise<unknown> }) {
  const input = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<PhotoPhase>(order.status === 'awaiting_execution' || order.status === 'open' ? 'entry' : 'work')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const paths = order.photos.map((p) => p.storage_path)
  const urls = useQuery({ queryKey: ['ws-os-photos', order.id, paths.join(',')], queryFn: () => photoUrls(paths), enabled: paths.length > 0, staleTime: 5 * 60_000 })
  const closed = ['delivered', 'canceled'].includes(order.status)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  async function onFiles(files: FileList | null) {
    if (!files?.length) return
    setError(null)
    try {
      for (const [i, f] of Array.from(files).entries()) {
        setBusy(`Enviando ${i + 1} de ${files.length}…`)
        await uploadOrderPhoto(orgId, order.id, f, phase)
      }
      await onChanged()
    } catch (err) {
      setError(err instanceof Error && !(err as Err).code ? err.message : translateDbError(err as Err))
      await onChanged()
    } finally {
      setBusy('')
      if (input.current) input.current.value = ''
    }
  }

  return (
    <Card title={`Fotos (${order.photos.length})`}>
      {canEdit && !closed && (
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <SelectField label="Etapa" value={phase} options={['entry', 'work', 'exit']} optionLabel={(o) => PHOTO_PHASE_LABEL[o as PhotoPhase]}
            onChange={(e) => setPhase(e.target.value as PhotoPhase)} />
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple className="sr-only" id={`os-photo-${order.id}`}
            onChange={(e) => void onFiles(e.target.files)} />
          <label htmlFor={`os-photo-${order.id}`} className="inline-flex cursor-pointer items-center rounded-doc bg-ink px-4 py-2.5 text-sm font-semibold text-sheet hover:bg-ink-soft">
            {busy || 'Tirar ou escolher fotos'}
          </label>
        </div>
      )}
      {error && <div className="mb-3"><Notice tone="error">{error}</Notice></div>}
      {order.photos.length === 0 && <p className="text-muted">Registre os lados da moto na entrada e o serviço feito.</p>}
      {(['entry', 'work', 'exit'] as PhotoPhase[]).map((ph) => {
        const list = order.photos.filter((p) => p.phase === ph)
        if (!list.length) return null
        return (
          <div key={ph} className="mt-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">{PHOTO_PHASE_LABEL[ph]}</p>
            <ul className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {list.map((p) => (
                <li key={p.id} className="relative">
                  <button type="button" onClick={() => setOpen(p.storage_path)} className="block aspect-square w-full overflow-hidden rounded-doc border border-rule bg-paper"
                    aria-label={`Abrir foto${p.caption ? `: ${p.caption}` : ''}`}>
                    {urls.data?.[p.storage_path] ? <img src={urls.data[p.storage_path]} alt={p.caption ?? ''} className="h-full w-full object-cover" loading="lazy" />
                      : <span className="text-xs text-muted">…</span>}
                  </button>
                  {canEdit && !['completed', 'awaiting_pickup', 'delivered', 'canceled'].includes(order.status) && (
                    <button type="button" onClick={async () => { await removePhoto(orgId, order.id, p.id); await onChanged() }}
                      className="absolute right-1 top-1 rounded-full bg-sheet/90 px-1.5 text-xs text-danger" aria-label="Remover foto">✕</button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
      {open && urls.data?.[open] && (
        <div role="dialog" aria-modal="true" aria-label="Foto" className="fixed inset-0 z-50 flex items-center justify-center bg-graphite/80 p-4" onClick={() => setOpen(null)}>
          <img src={urls.data[open]} alt="" className="max-h-full max-w-full rounded-doc" />
        </div>
      )}
    </Card>
  )
}
