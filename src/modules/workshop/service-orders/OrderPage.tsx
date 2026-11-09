import { EntryFlowCard } from '../flow/EntryFlowCard'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { SelectField, TextAreaField, TextField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { PageHeader } from '@/components/AppLayout'
import { translateDbError } from '@/core/shared/dbErrors'
import { formatDate, formatKm, formatPlate } from '@/core/shared/format'
import { vehicleLabel } from '../customers/api'
import { Card, StatusChip, WorkshopShell } from '../shared/WorkshopShell'
import { formatCents, formatDateTime, onlyDigits, parseMoney } from '../shared/rpc'
import { ITEM_KIND_LABEL, ITEM_KINDS, STATUS_LABEL as QUOTE_STATUS_LABEL, whatsappUrl, type ItemKind } from '../quotes/api'
import type { WorkshopPermissions } from '../customers/api'
import { InspectionCard, PhotosCard } from './InspectionAndPhotos'
import { PistaMediaCard } from '@/modules/pista/PistaMediaCard'
import { OrderReceipt, type ReceiptDoc } from './OrderReceipt'
import { HistoryCard, HistoryOptionsFields } from './HistoryCard'
import { PaymentsCard, ReminderForm } from '../management/widgets'
import {
  addComplement, addOrderItem, fetchOrderHistory, type HistoryOptions, type OrderHistory, AUTH_LABEL, AUTH_METHODS, cancelOrder, CLOSED, completeOrder, createOrderLink, deliverOrder, fetchOrder,
  itemNet, ITEM_STATUS_LABEL, MANUAL_STATUSES, notifyPickup, ORDER_STATUS_LABEL, ORDER_STATUS_TONE, orderLink, setOrderStatus,
  setTechnicalNotes, updateOrder, updateOrderItem, type AuthMethod, type ItemStatus, type Order, type OrderItem, type OrderStatus,
} from './api'

type Err = { code?: string; message?: string }
const errText = (e: unknown) => translateDbError(e as Err)

export function OrderPage() {
  return <WorkshopShell>{({ orgId, perms }) => <OrderView orgId={orgId} perms={perms} />}</WorkshopShell>
}

export function toReceipt(o: Order): ReceiptDoc {
  return {
    workshop: o.workshop, number: o.number, openedAt: o.created_at, completedAt: o.completed_at, deliveredAt: o.delivered_at,
    deliveredTo: o.delivered_to_name, receiptCode: o.receipt_code, customerName: o.customer.full_name, vehicle: o.vehicle,
    kmIn: o.km_in, kmOut: o.km_out, adjustmentCents: o.adjustment_cents, adjustmentReason: o.adjustment_reason,
    finalTotalCents: o.final_total_cents, notes: o.completion_notes, photosCount: o.photos.length,
    items: o.items.map((i) => ({
      position: i.position, kind: i.kind, description: i.description, quantity: i.quantity, net_cents: itemNet(i), status: i.status,
      part_brand: i.part_brand, part_code: i.part_code, notes: i.notes,
      origin: i.source === 'manual' ? `Autorizado ${AUTH_LABEL[i.auth_method ?? 'outro'].toLowerCase()} por ${i.auth_by_name}` : `Orçamento nº ${i.quote_number}`,
    })),
    entry: o.inspections.entry ? { items: o.inspections.entry.items, notes: o.inspections.entry.notes, ackName: o.inspections.entry.customer_ack_name, ackAt: o.inspections.entry.customer_ack_at } : null,
    exit: o.inspections.exit ? { items: o.inspections.exit.items, notes: o.inspections.exit.notes } : null,
  }
}

const EVENT_LABEL: Record<string, string> = {
  created: 'OS aberta', status_changed: 'Situação alterada', assigned: 'Mecânico designado', item_added: 'Item incluído com autorização',
  item_updated: 'Item atualizado', complement_added: 'Itens do complementar incluídos', checklist_saved: 'Checklist salvo',
  photo_added: 'Foto incluída', photo_removed: 'Foto removida', link_created: 'Link criado para o cliente', customer_ack: 'Cliente deu ciência da entrada',
  completed: 'OS concluída', pickup_notified: 'Cliente avisado da retirada', delivered: 'Moto entregue', canceled: 'OS cancelada', notes_updated: 'Observações atualizadas',
  history_published: 'Registrado no histórico da moto', history_photo_added: 'Foto enviada ao histórico da moto',
  note_added: 'Nota da pista', note_voided: 'Nota anulada', audio_added: 'Áudio da pista', mechanic_ready: 'Mecânico marcou Pronto', taken: 'Mecânico pegou a OS', diagnosed: 'Diagnóstico pronto', quote_created: 'Orçamento montado a partir da entrada', quote_items_added: 'Itens aprovados entraram na OS',
}

function OrderView({ orgId, perms }: { orgId: string; perms: WorkshopPermissions & { user_id?: string } }) {
  const { orderId = '' } = useParams()
  const queryClient = useQueryClient()
  const key = ['ws-order', orgId, orderId]
  const q = useQuery({ queryKey: key, queryFn: () => fetchOrder(orgId, orderId), enabled: Boolean(orderId) })
  const hist = useQuery({ queryKey: ['ws-order-history', orgId, orderId], queryFn: () => fetchOrderHistory(orgId, orderId), enabled: Boolean(orderId) })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState('')
  const [link, setLink] = useState<{ purpose: 'entry_ack' | 'receipt'; url: string } | null>(null)
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: key }),
    queryClient.invalidateQueries({ queryKey: ['ws-orders', orgId] }),
    queryClient.invalidateQueries({ queryKey: ['ws-orders-summary', orgId] }),
    queryClient.invalidateQueries({ queryKey: ['ws-order-history', orgId, orderId] }),
  ])
  async function run(name: string, fn: () => Promise<unknown>) {
    setBusy(name)
    setError(null)
    try { await fn(); await refresh() } catch (err) { setError(errText(err)) } finally { setBusy('') }
  }

  if (q.isLoading) return <p className="text-muted" role="status">Carregando…</p>
  if (q.isError || !q.data) return <Notice tone="error">{errText(q.error)}</Notice>
  const o = q.data
  const manage = perms.manage_quotes
  const execute = perms.execute_orders
  const closed = CLOSED.includes(o.status)
  const pending = o.items.filter((i) => i.status === 'pending').length
  const authorized = o.items.filter((i) => i.status !== 'not_done').reduce((s, i) => s + itemNet(i), 0)
  const phone = o.customer.whatsapp ?? o.customer.phone
  const vText = o.vehicle ? vehicleLabel(o.vehicle) : null

  async function makeLink(purpose: 'entry_ack' | 'receipt') {
    await run(`link-${purpose}`, async () => {
      const r = await createOrderLink(orgId, o.id, purpose)
      setLink({ purpose, url: orderLink(r.token) })
    })
  }

  return (
    <div>
      <div className="print:hidden">
        <Link to={`/oficina/${orgId}/os`} className="text-sm text-muted underline underline-offset-4">Ordens de serviço</Link>
        <div className="mt-2">
          <PageHeader
            title={<span className="flex flex-wrap items-center gap-3">OS nº {o.number}<StatusChip className={ORDER_STATUS_TONE[o.status]}>{ORDER_STATUS_LABEL[o.status]}</StatusChip></span>}
            intro={<>
              <Link to={`/oficina/${orgId}/clientes/${o.customer_id}`} className="underline underline-offset-4">{o.customer.full_name}</Link>
              {vText ? ` · ${vText}` : ''}{o.vehicle?.plate ? ` · ${formatPlate(o.vehicle.plate)}` : ''}
              {o.quote ? <> · do <Link to={`/oficina/${orgId}/orcamentos/${o.quote.id}`} className="underline underline-offset-4">orçamento nº {o.quote.number}</Link></> : o.auth_method ? ' · aberta sem orçamento' : ' · entrada da moto'}
            </>}
            actions={o.completed_at && <Button variant="secondary" onClick={() => window.print()}>Imprimir comprovante</Button>} />
        </div>
      </div>
      {error && <div className="mt-4 max-w-2xl print:hidden"><Notice tone="error">{error}</Notice></div>}

      {o.completed_at && <div className="mt-6 hidden print:block"><OrderReceipt doc={toReceipt(o)} /></div>}

      <div className="mt-6 grid gap-6 print:hidden 2xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {o.auth_method && (
            <Notice tone="info" title="Aberta sem orçamento">
              Autorizada {AUTH_LABEL[o.auth_method].toLowerCase()} por {o.auth_by_name}{o.auth_note ? ` (${o.auth_note})` : ''}.
            </Notice>
          )}
          <EntryFlowCard orgId={orgId} order={o} canManage={manage} canExecute={execute} onChanged={refresh} run={run} busy={busy} />
          <ItemsCard orgId={orgId} order={o} canExecute={execute && !closed} canManage={manage && !closed} run={run} busy={busy} />
          {o.complements.length > 0 && (
            <Card title="Orçamentos complementares">
              <ul className="flex flex-col gap-2 text-sm">
                {o.complements.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                    <Link to={`/oficina/${orgId}/orcamentos/${c.id}`} className="font-semibold text-ink underline underline-offset-4">Nº {c.number} · {QUOTE_STATUS_LABEL[c.status]}</Link>
                    {c.included ? <span className="text-ok">itens aprovados já na OS</span>
                      : (c.status === 'approved' || c.status === 'partially_approved') && manage && !closed
                        ? <Button size="sm" loading={busy === `comp-${c.id}`} onClick={() => run(`comp-${c.id}`, () => addComplement(orgId, o.id, c.id))}>Incluir itens aprovados</Button>
                        : <span className="text-muted">aguardando aprovação do cliente</span>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <div className="grid gap-6 xl:grid-cols-2">
            <InspectionCard key={`entry-${o.inspections.entry?.recorded_at ?? ''}`} orgId={orgId} order={o} phase="entry" canEdit={execute} onSaved={refresh} />
            <InspectionCard key={`exit-${o.inspections.exit?.recorded_at ?? ''}`} orgId={orgId} order={o} phase="exit" canEdit={execute} onSaved={refresh} />
          </div>
          <PhotosCard orgId={orgId} order={o} canEdit={execute} onChanged={refresh} />
          <PistaMediaCard orgId={orgId} orderId={o.id} />
          <TechnicalNotes key={o.technical_notes ?? ''} orgId={orgId} order={o} canEdit={execute && !closed} onSaved={refresh} />
        </div>

        <aside className="flex flex-col gap-4 2xl:sticky 2xl:top-6 2xl:self-start">
          <Card title="Andamento">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div><dt className="text-muted">Aberta</dt><dd>{formatDateTime(o.created_at)}</dd></div>
              <div><dt className="text-muted">Por</dt><dd>{o.created_by_name ?? '—'}</dd></div>
              <div><dt className="text-muted">Km na entrada</dt><dd>{formatKm(o.km_in)}</dd></div>
              <div><dt className="text-muted">Autorizado</dt><dd className="tabular-nums">{formatCents(authorized)}</dd></div>
            </dl>
            {!closed && (execute || manage) && (
              <div className="mt-4">
                <SelectField label="Situação" value={MANUAL_STATUSES.includes(o.status) ? o.status : ''} options={MANUAL_STATUSES}
                  optionLabel={(s) => ORDER_STATUS_LABEL[s as OrderStatus]} disabled={Boolean(busy)}
                  onChange={(e) => run('status', () => setOrderStatus(orgId, o.id, e.target.value as OrderStatus))} />
              </div>
            )}
            {manage && !closed ? (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <SelectField label="Mecânico" value={o.mechanic_user_id ?? ''} options={o.team.map((t) => t.user_id)} placeholder="Ninguém"
                  optionLabel={(id) => o.team.find((t) => t.user_id === id)?.name ?? id}
                  onChange={(e) => run('mech', () => updateOrder(orgId, o.id, { mechanic_user_id: e.target.value || null }))} />
                <TextField label="Prazo" type="date" value={o.due_date ?? ''}
                  onChange={(e) => run('due', () => updateOrder(orgId, o.id, { due_date: e.target.value || null }))} />
              </div>
            ) : (
              <p className="mt-3 text-sm text-graphite">Mecânico: {o.mechanic_name ?? '—'} · Prazo: {o.due_date ? formatDate(o.due_date, 'short') : '—'}</p>
            )}
          </Card>

          {manage && !closed && o.inspections.entry && !o.inspections.entry.customer_ack_at && (
            <Card title="Ciência do cliente na entrada">
              <p className="text-sm text-graphite">Mande o checklist para o cliente conferir o estado da moto e confirmar, sem precisar de conta.</p>
              <Button className="mt-3" size="sm" variant="secondary" loading={busy === 'link-entry_ack'} onClick={() => makeLink('entry_ack')}>Gerar link de ciência</Button>
            </Card>
          )}

          {link && (
            <Card title={link.purpose === 'receipt' ? 'Link do comprovante' : 'Link de ciência da entrada'}>
              <input readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} aria-label="Link" className="w-full rounded-doc border border-rule bg-paper px-3 py-2 text-sm" />
              <div className="mt-3 flex flex-wrap gap-2">
                <a target="_blank" rel="noreferrer" className="inline-flex items-center rounded-doc bg-ink px-4 py-2.5 text-sm font-semibold text-sheet hover:bg-ink-soft"
                  href={whatsappUrl(phone, link.purpose === 'receipt'
                    ? `Olá, ${o.customer.full_name.split(' ')[0]}! Sua ${vText ?? 'moto'} está pronta na ${o.workshop.business_name}. Comprovante dos serviços (OS nº ${o.number}): ${link.url}`
                    : `Olá, ${o.customer.full_name.split(' ')[0]}! Registramos o estado da sua ${vText ?? 'moto'} na entrada (OS nº ${o.number}). Confira e confirme por aqui: ${link.url}`)}>
                  Enviar pelo WhatsApp
                </a>
                <Button size="sm" variant="secondary" onClick={() => void navigator.clipboard?.writeText(link.url)}>Copiar</Button>
              </div>
              <p className="mt-2 text-xs text-muted">O link aparece só agora e vale 30 dias. Gerar outro desativa o anterior.</p>
            </Card>
          )}

          {manage && !closed && <CompleteCard orgId={orgId} order={o} history={hist.data} pending={pending} run={run} busy={busy} />}
          {hist.data && (closed || hist.data.motorcycle_id) && o.status !== 'canceled' && (
            <HistoryCard orgId={orgId} order={o} history={hist.data} canManage={manage} onChanged={refresh} />
          )}

          {o.completed_at && (
            <Card title="Concluída">
              <p className="text-sm text-graphite">
                Em {formatDateTime(o.completed_at)} por {o.completed_by_name ?? 'equipe'} · {formatKm(o.km_out)} · total <span className="font-semibold">{formatCents(o.final_total_cents)}</span> · código {o.receipt_code}
              </p>
              {manage && o.status !== 'delivered' && (
                <div className="mt-3 flex flex-col items-start gap-2">
                  <Button size="sm" loading={busy === 'link-receipt'} onClick={async () => { await makeLink('receipt'); if (o.status === 'completed') await run('pickup', () => notifyPickup(orgId, o.id)) }}>
                    Avisar que está pronta (comprovante)
                  </Button>
                  <DeliverForm orgId={orgId} order={o} run={run} busy={busy} />
                </div>
              )}
              {manage && o.status === 'delivered' && (
                <Button className="mt-3" size="sm" variant="secondary" loading={busy === 'link-receipt'} onClick={() => makeLink('receipt')}>Gerar link do comprovante</Button>
              )}
            </Card>
          )}

          {perms.manage_finance && <PaymentsCard orgId={orgId} orderId={o.id} canceled={o.status === 'canceled'} />}
          {manage && o.completed_at && o.status !== 'canceled' && <ReminderCard orgId={orgId} order={o} />}

          {manage && !closed && <CancelCard orgId={orgId} order={o} run={run} busy={busy} />}
          {o.status === 'canceled' && <Notice tone="info" title="OS cancelada">{o.canceled_reason}</Notice>}

          <Card title="Histórico da OS">
            <ol className="flex flex-col gap-2.5 text-sm">
              {o.events.map((e) => (
                <li key={e.id} className="border-l-2 border-rule pl-3">
                  <p className="font-semibold text-ink">{EVENT_LABEL[e.kind] ?? e.kind}
                    {e.to_status && e.kind === 'status_changed' ? <span className="font-normal text-muted">: {ORDER_STATUS_LABEL[e.to_status]}</span> : null}</p>
                  <p className="text-muted">{formatDateTime(e.created_at)}{e.actor_label ? ` · ${e.actor_label}` : ''}</p>
                  {typeof e.data?.description === 'string' && <p className="text-graphite">{e.data.description}{typeof e.data.status === 'string' ? ` → ${ITEM_STATUS_LABEL[e.data.status as ItemStatus]}` : ''}</p>}
                  {typeof e.data?.reason === 'string' && <p className="text-graphite">"{e.data.reason}"</p>}
                  {typeof e.data?.note === 'string' && e.data.note && <p className="text-graphite">"{e.data.note}"</p>}
                </li>
              ))}
            </ol>
          </Card>
        </aside>
      </div>
    </div>
  )
}

function ItemsCard({ orgId, order: o, canExecute, canManage, run, busy }: {
  orgId: string; order: Order; canExecute: boolean; canManage: boolean; run: (n: string, fn: () => Promise<unknown>) => Promise<void>; busy: string
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  return (
    <Card title={`Serviços autorizados (${o.items.filter((i) => i.status === 'done').length} de ${o.items.length} feitos)`}
      actions={canManage && !adding && <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>Item extra</Button>}>
      <p className="mb-3 text-sm text-muted">Só aparecem itens autorizados pelo cliente. Item recusado no orçamento não entra.</p>
      <ol className="flex flex-col gap-2">
        {o.items.map((i) => (
          <li key={i.id} className={`rounded-doc border p-3 ${i.status === 'done' ? 'border-ok/40 bg-ok/5' : i.status === 'not_done' ? 'border-rule bg-paper/60' : 'border-rule'}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className={`font-semibold ${i.status === 'not_done' ? 'text-muted line-through' : 'text-ink'}`}>{i.position}. {i.description}</p>
                <p className="text-xs text-muted">
                  {ITEM_KIND_LABEL[i.kind]} · {Number(i.quantity).toLocaleString('pt-BR')} · {formatCents(itemNet(i))} ·{' '}
                  {i.source === 'manual' ? `autorizado ${AUTH_LABEL[i.auth_method ?? 'outro'].toLowerCase()} por ${i.auth_by_name}` : `orçamento nº ${i.quote_number}`}
                </p>
                {(i.part_brand || i.part_code) && <p className="text-sm text-graphite">Peça: {[i.part_brand, i.part_code].filter(Boolean).join(' · ')}</p>}
                {i.notes && <p className="text-sm text-graphite">{i.notes}</p>}
                {i.executed_at && <p className="text-xs text-ok">Executado por {i.executed_by_name ?? 'equipe'} em {formatDateTime(i.executed_at)}</p>}
              </div>
              {canExecute && (
                <div className="flex flex-wrap gap-1" role="group" aria-label={`Situação do item ${i.position}`}>
                  {(['done', 'not_done', 'pending'] as ItemStatus[]).map((s) => (
                    <button key={s} type="button" aria-pressed={i.status === s} disabled={Boolean(busy)}
                      onClick={() => i.status !== s && run(`item-${i.id}`, () => updateOrderItem(orgId, o.id, i.id, { status: s }))}
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${i.status === s
                        ? s === 'done' ? 'border-ok bg-ok text-sheet' : s === 'not_done' ? 'border-muted bg-muted text-sheet' : 'border-ink bg-ink text-sheet'
                        : 'border-rule text-ink hover:border-ink'}`}>
                      {ITEM_STATUS_LABEL[s]}
                    </button>
                  ))}
                  <button type="button" className="px-2 text-xs underline" onClick={() => setEditing(editing === i.id ? null : i.id)}>Peça e obs.</button>
                </div>
              )}
            </div>
            {editing === i.id && <ItemDetails orgId={orgId} order={o} item={i} run={run} onDone={() => setEditing(null)} />}
          </li>
        ))}
      </ol>
      {adding && <ExtraItem orgId={orgId} order={o} run={run} onDone={() => setAdding(false)} />}
    </Card>
  )
}

function ItemDetails({ orgId, order, item, run, onDone }: { orgId: string; order: Order; item: OrderItem; run: (n: string, fn: () => Promise<unknown>) => Promise<void>; onDone: () => void }) {
  const [brand, setBrand] = useState(item.part_brand ?? '')
  const [code, setCode] = useState(item.part_code ?? '')
  const [notes, setNotes] = useState(item.notes ?? '')
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-3">
      <TextField label="Fabricante/marca da peça" value={brand} onChange={(e) => setBrand(e.target.value)} />
      <TextField label="Código da peça" value={code} onChange={(e) => setCode(e.target.value)} />
      <TextField label="Observação" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="flex gap-2 sm:col-span-3">
        <Button size="sm" onClick={async () => { await run(`det-${item.id}`, () => updateOrderItem(orgId, order.id, item.id, { part_brand: brand, part_code: code, notes })); onDone() }}>Salvar</Button>
        <Button size="sm" variant="secondary" onClick={onDone}>Cancelar</Button>
      </div>
    </div>
  )
}

function ExtraItem({ orgId, order, run, onDone }: { orgId: string; order: Order; run: (n: string, fn: () => Promise<unknown>) => Promise<void>; onDone: () => void }) {
  const [kind, setKind] = useState<ItemKind>('part')
  const [desc, setDesc] = useState('')
  const [qty, setQty] = useState('1')
  const [price, setPrice] = useState('')
  const [method, setMethod] = useState<AuthMethod>('telefone')
  const [by, setBy] = useState(order.customer.full_name)
  const [note, setNote] = useState('')
  const [err, setErr] = useState<string | null>(null)
  return (
    <div className="mt-4 rounded-doc border border-brass/50 bg-brass/5 p-4">
      <p className="text-sm text-graphite">
        Item novo sem orçamento precisa da autorização do cliente registrada. Para valores maiores, prefira um orçamento complementar (o cliente aprova pelo link).
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <SelectField label="Tipo" value={kind} options={ITEM_KINDS} optionLabel={(o) => ITEM_KIND_LABEL[o as ItemKind]} onChange={(e) => setKind(e.target.value as ItemKind)} />
        <TextField label="Descrição" value={desc} onChange={(e) => setDesc(e.target.value)} className="sm:col-span-3" />
        <TextField label="Qtd." value={qty} inputMode="decimal" onChange={(e) => setQty(e.target.value)} />
        <TextField label="Valor unit. (R$)" value={price} inputMode="decimal" onChange={(e) => setPrice(e.target.value)} />
        <SelectField label="Como autorizou" value={method} options={AUTH_METHODS} optionLabel={(o) => AUTH_LABEL[o as AuthMethod]} onChange={(e) => setMethod(e.target.value as AuthMethod)} />
        <TextField label="Quem autorizou" value={by} onChange={(e) => setBy(e.target.value)} />
        <TextField label="Observação da autorização" value={note} onChange={(e) => setNote(e.target.value)} className="sm:col-span-4" />
      </div>
      {err && <div className="mt-3"><Notice tone="error">{err}</Notice></div>}
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={async () => {
          const cents = parseMoney(price || '0')
          if (desc.trim().length < 2) return setErr('Descreva o item.')
          if (cents === null) return setErr('Valor inválido.')
          await run('extra', () => addOrderItem(orgId, order.id, { kind, description: desc.trim(), quantity: Number(qty.replace(',', '.')) || 1, unit_price_cents: cents }, method, by.trim(), note.trim()))
          onDone()
        }}>Incluir com autorização</Button>
        <Button size="sm" variant="secondary" onClick={onDone}>Cancelar</Button>
      </div>
    </div>
  )
}

function TechnicalNotes({ orgId, order, canEdit, onSaved }: { orgId: string; order: Order; canEdit: boolean; onSaved: () => Promise<unknown> }) {
  const [v, setV] = useState(order.technical_notes ?? '')
  const [saving, setSaving] = useState(false)
  if (!canEdit && !order.technical_notes) return null
  return (
    <Card title="Observações técnicas (só a equipe vê)">
      {canEdit ? (
        <>
          <TextAreaField label="Diagnóstico, medidas, recomendações" value={v} onChange={(e) => setV(e.target.value)} rows={3} />
          <Button className="mt-2" size="sm" variant="secondary" loading={saving} disabled={v === (order.technical_notes ?? '')}
            onClick={async () => { setSaving(true); try { await setTechnicalNotes(orgId, order.id, v); await onSaved() } finally { setSaving(false) } }}>Salvar observações</Button>
        </>
      ) : <p className="whitespace-pre-line text-graphite">{order.technical_notes}</p>}
    </Card>
  )
}

/** Lembrete de manutenção a partir da OS concluída (PRD 2.1 §14.1). */
function ReminderCard({ orgId, order: o }: { orgId: string; order: Order }) {
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const first = o.items.find((i) => i.status === 'done')?.description
  return (
    <Card title="Próxima manutenção">
      {saved && !open && <p className="mb-2 text-sm text-emerald-800">Lembrete criado. Ele aparece em Relacionamento quando estiver perto.</p>}
      {open ? (
        <ReminderForm orgId={orgId} customerId={o.customer_id} vehicleId={o.vehicle_id} orderId={o.id} suggestion={first ? `Próxima: ${first}` : ''}
          onDone={() => { setOpen(false); setSaved(true) }} onCancel={() => setOpen(false)} />
      ) : (
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Criar lembrete para o cliente</Button>
      )}
    </Card>
  )
}

function CompleteCard({ orgId, order: o, history, pending, run, busy }: { orgId: string; order: Order; history?: OrderHistory; pending: number; run: (n: string, fn: () => Promise<unknown>) => Promise<void>; busy: string }) {
  const [open, setOpen] = useState(false)
  const [km, setKm] = useState(o.inspections.exit?.km?.toString() ?? '')
  const [notes, setNotes] = useState('')
  const [adj, setAdj] = useState('')
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [hopts, setHopts] = useState<HistoryOptions>({ publish: true })
  const done = o.items.filter((i) => i.status === 'done')
  const sum = done.reduce((s, i) => s + itemNet(i), 0)
  const adjCents = adj ? (adj.trim().startsWith('-') ? -1 : 1) * (parseMoney(adj.replace('-', '')) ?? 0) : 0
  return (
    <Card title="Concluir a OS">
      {pending > 0 ? (
        <p className="text-sm text-graphite">Marque cada serviço como executado ou não executado ({pending} pendente{pending === 1 ? '' : 's'}).</p>
      ) : !open ? (
        <>
          <p className="text-sm text-graphite">{done.length} serviço{done.length === 1 ? '' : 's'} executado{done.length === 1 ? '' : 's'} · {formatCents(sum)}</p>
          <Button className="mt-3" size="sm" onClick={() => setOpen(true)} disabled={done.length === 0}>Conferir e concluir</Button>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <TextField label="Km final" value={km} onChange={(e) => setKm(e.target.value)} inputMode="numeric" hint={o.km_in !== null ? `Entrada: ${formatKm(o.km_in)}` : undefined} />
          <TextField label="Ajuste no valor (R$, opcional)" value={adj} onChange={(e) => setAdj(e.target.value)} placeholder="-10,00 ou 15,00" inputMode="decimal" />
          {adjCents !== 0 && <TextField label="Motivo do ajuste" value={reason} onChange={(e) => setReason(e.target.value)} />}
          <TextAreaField label="Observações finais (vão no comprovante)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          <p className="text-sm">Valor final: <span className="font-semibold">{formatCents(sum + adjCents)}</span></p>
          {history?.motorcycle_id && <HistoryOptionsFields history={history} value={hopts} onChange={setHopts} showPublishToggle />}
          {!o.inspections.exit && <p className="text-xs text-muted">Dica: preencha o checklist de saída antes de concluir.</p>}
          {err && <Notice tone="error">{err}</Notice>}
          <div className="flex gap-2">
            <Button size="sm" loading={busy === 'complete'} onClick={async () => {
              if (!km) return setErr('Informe o km final.')
              setErr(null)
              await run('complete', () => completeOrder(orgId, o.id, Number(onlyDigits(km)), notes, adjCents, reason, history?.motorcycle_id ? hopts : { publish: false }))
            }}>Concluir OS</Button>
            <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>Voltar</Button>
          </div>
          <p className="text-xs text-muted">Depois de concluída, itens e valores não mudam mais.</p>
        </div>
      )}
    </Card>
  )
}

function DeliverForm({ orgId, order, run, busy }: { orgId: string; order: Order; run: (n: string, fn: () => Promise<unknown>) => Promise<void>; busy: string }) {
  const [open, setOpen] = useState(false)
  const [to, setTo] = useState(order.customer.full_name)
  if (!open) return <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Registrar entrega</Button>
  return (
    <div className="flex w-full flex-col gap-2">
      <TextField label="Quem retirou a moto" value={to} onChange={(e) => setTo(e.target.value)} />
      <div className="flex gap-2">
        <Button size="sm" loading={busy === 'deliver'} onClick={() => run('deliver', () => deliverOrder(orgId, order.id, to))}>Confirmar entrega</Button>
        <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>Voltar</Button>
      </div>
    </div>
  )
}

function CancelCard({ orgId, order, run, busy }: { orgId: string; order: Order; run: (n: string, fn: () => Promise<unknown>) => Promise<void>; busy: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  if (!open) return <div><Button size="sm" variant="quiet" onClick={() => setOpen(true)}>Cancelar OS</Button></div>
  return (
    <Card title="Cancelar OS">
      <TextAreaField label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
      <div className="mt-2 flex gap-2">
        <Button size="sm" loading={busy === 'cancel'} onClick={() => run('cancel', () => cancelOrder(orgId, order.id, reason))}>Cancelar OS</Button>
        <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>Voltar</Button>
      </div>
    </Card>
  )
}
