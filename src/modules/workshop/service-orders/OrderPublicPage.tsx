import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { CheckboxField, TextField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { translateDbError } from '@/core/shared/dbErrors'
import { formatKm, formatPlate } from '@/core/shared/format'
import { formatDateTime } from '../shared/rpc'
import { rpc } from '../shared/rpc'
import type { ItemKind } from '../quotes/api'
import { OrderReceipt } from './OrderReceipt'
import { AUTH_LABEL, ENTRY_ITEMS, STATE_LABEL, type AuthMethod, type InspectionItems } from './api'

type Err = { code?: string; message?: string }
type Pub = {
  state: 'open'
  purpose: 'entry_ack' | 'receipt'
  number: number
  status: string
  opened_at: string
  km_in: number | null
  km_out: number | null
  completed_at: string | null
  delivered_at: string | null
  delivered_to_name: string | null
  receipt_code: string | null
  completion_notes: string | null
  final_total_cents: number | null
  adjustment_cents: number | null
  adjustment_reason: string | null
  customer_name: string
  vehicle: { brand: string; model: string; version: string | null; year: number | null; plate: string | null; color: string | null } | null
  workshop: { business_name: string; cnpj: string | null; phone: string | null; whatsapp: string | null; email: string | null; address: string | null; city: string | null; state: string | null; logo_url: string | null }
  entry: { items: InspectionItems; fuel_level: string | null; keys_count: number | null; km: number | null; notes: string | null; recorded_at: string; customer_ack_at: string | null; customer_ack_name: string | null } | null
  exit: { items: InspectionItems; km: number | null; notes: string | null } | null
  photos_count: number
  items: { position: number; kind: ItemKind; description: string; quantity: number; subtotal_cents: number; status: 'pending' | 'done' | 'not_done'; part_brand: string | null; part_code: string | null; notes: string | null; origin: string }[] | null
}
type Result = Pub | { state: 'not_found' } | { state: 'inactive'; workshop?: string }

const label = (k: string) => ENTRY_ITEMS.find((x) => x.key === k)?.label ?? k

/** /os/:token — ciência do estado na entrada ou comprovante de conclusão, sem conta (PRD 2.1 §9.2 e §8.4). */
export function OrderPublicPage() {
  const { token = '' } = useParams()
  const queryClient = useQueryClient()
  const key = ['public-os', token]
  const q = useQuery({ queryKey: key, queryFn: () => rpc<Result>('get_service_order_by_token', { p_token: token }), retry: false, refetchOnWindowFocus: false, staleTime: Infinity })
  const [name, setName] = useState('')
  const [ok, setOk] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  if (q.isLoading) return <div className="mx-auto max-w-4xl px-4 py-12"><p className="text-muted" role="status">Abrindo…</p></div>
  if (q.isError) return <div className="mx-auto max-w-2xl px-4 py-12"><Notice tone="error">{translateDbError(q.error as Err)}</Notice></div>
  const d = q.data!
  if (d.state === 'not_found') return <div className="mx-auto max-w-2xl px-4 py-12"><Notice tone="error" title="Link não encontrado">Confira o endereço ou peça um novo à oficina.</Notice></div>
  if (d.state === 'inactive') return <div className="mx-auto max-w-2xl px-4 py-12"><Notice tone="info" title="Este link não está mais ativo">{d.workshop ?? 'A oficina'} pode enviar um novo.</Notice></div>
  const p = d as Pub

  async function ack() {
    if (name.trim().length < 3) return setError('Escreva o seu nome completo.')
    if (!ok) return setError('Marque a confirmação.')
    setSending(true)
    setError(null)
    try {
      queryClient.setQueryData(key, await rpc<Pub>('ack_service_order_entry', { p_token: token, p_name: name.trim(), p_confirmed: true }))
    } catch (err) {
      setError(translateDbError(err as Err))
    } finally {
      setSending(false)
    }
  }

  if (p.purpose === 'receipt' && p.items) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <h1 className="heading text-3xl text-ink">Comprovante da OS nº {p.number}</h1>
          <Button variant="secondary" onClick={() => window.print()}>Salvar em PDF</Button>
        </div>
        <OrderReceipt doc={{
          workshop: p.workshop, number: p.number, openedAt: p.opened_at, completedAt: p.completed_at, deliveredAt: p.delivered_at,
          deliveredTo: p.delivered_to_name, receiptCode: p.receipt_code, customerName: p.customer_name, vehicle: p.vehicle, kmIn: p.km_in,
          kmOut: p.km_out, adjustmentCents: p.adjustment_cents ?? 0, adjustmentReason: p.adjustment_reason, finalTotalCents: p.final_total_cents,
          notes: p.completion_notes, photosCount: p.photos_count,
          items: p.items.map((i) => ({ ...i, net_cents: i.subtotal_cents, origin: i.origin.replace(/^Autorizado (\w+) por/, (_m, w: string) => `Autorizado ${(AUTH_LABEL[w as AuthMethod] ?? w).toLowerCase()} por`) })),
          entry: p.entry ? { items: p.entry.items, notes: p.entry.notes, ackName: p.entry.customer_ack_name, ackAt: p.entry.customer_ack_at } : null,
          exit: p.exit ? { items: p.exit.items, notes: p.exit.notes } : null,
        }} />
      </div>
    )
  }

  const e = p.entry
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{p.workshop.business_name} · OS nº {p.number}</p>
      <h1 className="heading mt-1 text-3xl text-ink">Estado da moto na entrada</h1>
      <p className="mt-1 text-muted">
        {p.vehicle ? [p.vehicle.brand, p.vehicle.model, p.vehicle.year].filter(Boolean).join(' ') : 'Moto'}
        {p.vehicle?.plate ? ` · ${formatPlate(p.vehicle.plate)}` : ''} · {p.customer_name}
      </p>
      {e && (
        <div className="mt-6 rounded-sheet border border-rule bg-white p-4 sm:p-6">
          <ul className="divide-y divide-rule/70">
            {Object.entries(e.items).map(([k, v]) => (
              <li key={k} className="flex items-start justify-between gap-3 py-2 text-sm">
                <span>{label(k)}{v.note ? <span className="block text-muted">{v.note}</span> : null}</span>
                <span className={`font-semibold ${v.state === 'avaria' ? 'text-danger' : v.state === 'atencao' ? 'text-graphite' : 'text-ok'}`}>{STATE_LABEL[v.state]}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-graphite">
            {[e.km !== null ? formatKm(e.km) : null, e.fuel_level ? `combustível ${e.fuel_level}` : null, e.keys_count !== null ? `${e.keys_count} chave(s) entregue(s)` : null].filter(Boolean).join(' · ')}
          </p>
          {e.notes && <p className="mt-1 text-sm">{e.notes}</p>}
          {p.photos_count > 0 && <p className="mt-1 text-xs text-muted">A oficina registrou {p.photos_count} foto(s). Peça para ver, se quiser.</p>}
          <p className="mt-1 text-xs text-muted">Registrado em {formatDateTime(e.recorded_at)}.</p>
        </div>
      )}
      {e?.customer_ack_at ? (
        <div className="mt-6"><Notice tone="success" title="Ciência registrada">{e.customer_ack_name} confirmou em {formatDateTime(e.customer_ack_at)}. Obrigado!</Notice></div>
      ) : (
        <div className="mt-6 rounded-sheet border border-rule bg-sheet p-4 sm:p-6">
          <TextField label="Seu nome completo" value={name} onChange={(ev) => setName(ev.target.value)} autoComplete="name" />
          <div className="mt-3">
            <CheckboxField checked={ok} onChange={(ev) => setOk(ev.target.checked)} label="Conferi e estou ciente do estado da moto registrado pela oficina na entrada." />
          </div>
          {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
          <Button className="mt-4" onClick={ack} loading={sending}>Confirmar ciência</Button>
          <p className="mt-3 text-xs text-muted">Se algo não confere, fale com a oficina antes de confirmar. A confirmação fica registrada com data e hora.</p>
        </div>
      )}
    </div>
  )
}
