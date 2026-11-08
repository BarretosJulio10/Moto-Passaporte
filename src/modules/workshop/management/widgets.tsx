// Peças pequenas da Fase 4 usadas em várias telas: recebimentos da OS, lembrete e contato por WhatsApp.
import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { SelectField, TextAreaField, TextField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { translateDbError } from '@/core/shared/dbErrors'
import { Card } from '../shared/WorkshopShell'
import { formatCents, formatDateTime, parseMoney, centsToInput } from '../shared/rpc'
import { whatsappUrl } from '../quotes/api'
import {
  PAY_LABEL, PAY_METHODS, REMINDER_KINDS, REMINDER_LABEL, contactMessage, fetchOrderPayments, formatDay, logContact,
  recordPayment, saveReminder, todayIso, voidPayment, type ContactReason, type PayMethod, type ReminderKind,
} from './api'

type Err = { code?: string; message?: string }

/** Recebimentos de uma OS (PRD 2.1 §15). Só aparece para quem tem a permissão Financeiro. */
export function PaymentsCard({ orgId, orderId, canceled }: { orgId: string; orderId: string; canceled: boolean }) {
  const qc = useQueryClient()
  const key = ['ws-order-payments', orgId, orderId]
  const q = useQuery({ queryKey: key, queryFn: () => fetchOrderPayments(orgId, orderId) })
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PayMethod>('pix')
  const [date, setDate] = useState(todayIso())
  const [notes, setNotes] = useState('')
  const [voiding, setVoiding] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: key }), qc.invalidateQueries({ queryKey: ['ws-finance', orgId] })])

  if (q.isLoading) return <Card title="Recebimentos"><p className="text-sm text-muted" role="status">Carregando…</p></Card>
  if (q.isError || !q.data) return <Card title="Recebimentos"><Notice tone="error">{translateDbError(q.error as Err)}</Notice></Card>
  const p = q.data

  async function add(e: FormEvent) {
    e.preventDefault()
    const cents = parseMoney(amount)
    if (!cents || cents <= 0) return setError('Informe o valor recebido. Ex.: 150,00')
    setBusy(true)
    setError(null)
    try {
      await recordPayment(orgId, orderId, cents, method, date, notes)
      setAmount('')
      setNotes('')
      await refresh()
    } catch (err) {
      setError(translateDbError(err as Err))
    } finally {
      setBusy(false)
    }
  }
  async function doVoid(id: string) {
    if (reason.trim().length < 3) return setError('Informe o motivo do estorno.')
    setBusy(true)
    setError(null)
    try {
      await voidPayment(orgId, id, reason.trim())
      setVoiding(null)
      setReason('')
      await refresh()
    } catch (err) {
      setError(translateDbError(err as Err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Recebimentos">
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <div><dt className="text-muted">{p.final ? 'Total' : 'Previsto'}</dt><dd className="font-semibold tabular-nums text-ink">{formatCents(p.due_cents)}</dd></div>
        <div><dt className="text-muted">Recebido</dt><dd className="font-semibold tabular-nums text-emerald-800">{formatCents(p.paid_cents)}</dd></div>
        <div><dt className="text-muted">Falta</dt><dd className={`font-semibold tabular-nums ${p.pending_cents > 0 ? 'text-amber-800' : 'text-ink'}`}>{formatCents(p.pending_cents)}</dd></div>
      </dl>
      {p.payments.length > 0 && (
        <ul className="mt-3 divide-y divide-rule/70 text-sm">
          {p.payments.map((x) => (
            <li key={x.id} className={`py-2 ${x.voided_at ? 'text-muted' : ''}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className={`font-semibold tabular-nums ${x.voided_at ? 'line-through' : 'text-ink'}`}>{formatCents(x.amount_cents)}</span>
                  {' · '}{PAY_LABEL[x.method]} · {formatDay(x.paid_at)}{x.created_by_name ? ` · ${x.created_by_name}` : ''}
                </span>
                {!x.voided_at && voiding !== x.id && <Button size="sm" variant="quiet" onClick={() => { setVoiding(x.id); setReason('') }}>Estornar</Button>}
              </div>
              {x.notes && <p className="text-muted">{x.notes}</p>}
              {x.voided_at && <p className="text-xs">Estornado em {formatDateTime(x.voided_at)}: "{x.void_reason}"</p>}
              {voiding === x.id && (
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <TextField label="Motivo do estorno" value={reason} onChange={(e) => setReason(e.target.value)} className="min-w-[12rem] flex-1" />
                  <Button size="sm" loading={busy} onClick={() => doVoid(x.id)}>Confirmar estorno</Button>
                  <Button size="sm" variant="secondary" onClick={() => setVoiding(null)}>Voltar</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {!canceled && p.pending_cents > 0 && (
        <form onSubmit={add} className="mt-4 grid gap-3 border-t border-rule pt-4 sm:grid-cols-2" noValidate>
          <TextField label="Valor (R$)" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal"
            placeholder={centsToInput(p.pending_cents)} />
          <SelectField label="Forma" value={method} options={PAY_METHODS} optionLabel={(o) => PAY_LABEL[o as PayMethod]}
            onChange={(e) => setMethod(e.target.value as PayMethod)} />
          <TextField label="Data" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
          <TextField label="Observação (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: sinal, 2x no cartão" />
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="submit" size="sm" loading={busy}>Registrar recebimento</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setAmount(centsToInput(p.pending_cents))}>Valor que falta</Button>
          </div>
        </form>
      )}
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      <p className="mt-3 text-xs text-muted">Controle interno de recebimentos. Não emite nota fiscal nem processa pagamento.</p>
    </Card>
  )
}

/** Cria um lembrete de manutenção para o cliente (PRD 2.1 §14.1). */
export function ReminderForm({ orgId, customerId, vehicleId, orderId, suggestion, onDone, onCancel }: {
  orgId: string; customerId: string; vehicleId?: string | null; orderId?: string | null; suggestion?: string
  onDone: () => void | Promise<unknown>; onCancel: () => void
}) {
  const [kind, setKind] = useState<ReminderKind>('date')
  const [title, setTitle] = useState(suggestion ?? '')
  const [dueDate, setDueDate] = useState('')
  const [dueKm, setDueKm] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (title.trim().length < 2) return setError('Diga o que deve ser feito. Ex.: Trocar óleo')
    if (!dueDate && !dueKm) return setError('Informe a data ou a quilometragem do lembrete.')
    if (dueKm && !/^\d+$/.test(dueKm)) return setError('Quilometragem só com números.')
    setBusy(true)
    setError(null)
    try {
      await saveReminder(orgId, null, { customer_id: customerId, vehicle_id: vehicleId ?? null, order_id: orderId ?? null, kind, title: title.trim(),
        due_date: dueDate || undefined, due_km: dueKm || undefined, notes })
      await onDone()
    } catch (err) {
      setError(translateDbError(err as Err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="rounded-doc border border-rule bg-paper/60 p-4" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="O que fazer" value={title} onChange={(e) => setTitle(e.target.value)} className="sm:col-span-2" placeholder="Trocar óleo" />
        <SelectField label="Tipo" value={kind} options={REMINDER_KINDS} optionLabel={(o) => REMINDER_LABEL[o as ReminderKind]}
          onChange={(e) => setKind(e.target.value as ReminderKind)} />
        <TextField label="Data" type="date" value={dueDate} min={todayIso()} onChange={(e) => setDueDate(e.target.value)} />
        <TextField label="Quilometragem (opcional)" value={dueKm} onChange={(e) => setDueKm(e.target.value)} inputMode="numeric" placeholder="15000" />
        <TextAreaField label="Observação" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="sm:col-span-2" />
      </div>
      <p className="mt-2 text-xs text-muted">O lembrete aparece em Relacionamento quando estiver perto. Nada é enviado sozinho ao cliente.</p>
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      <div className="mt-3 flex gap-2">
        <Button type="submit" size="sm" loading={busy}>Salvar lembrete</Button>
        <Button type="button" size="sm" variant="secondary" onClick={onCancel}>Cancelar</Button>
      </div>
    </form>
  )
}

/** Abre o WhatsApp com a mensagem pronta e registra o contato (não prova que foi enviado). */
export function ContactButton({ orgId, customerId, customerName, whatsapp, workshopName, reason, reference, detail, onLogged, label = 'WhatsApp', text }: {
  orgId: string; customerId: string; customerName: string; whatsapp: string | null | undefined; workshopName: string
  reason: ContactReason; reference?: string | null; detail?: string; onLogged?: () => void; label?: string; text?: string
}) {
  if (!whatsapp) return <span className="text-xs text-muted">sem WhatsApp</span>
  const url = whatsappUrl(whatsapp, text ?? contactMessage(reason, { customerName, workshopName, detail }))
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      onClick={() => { logContact(orgId, customerId, reason, reference ?? null).then(() => onLogged?.(), () => undefined) }}
      className="inline-flex items-center rounded-doc border border-rule bg-sheet px-3 py-1.5 text-sm font-semibold text-ink hover:border-ink">
      {label}
    </a>
  )
}
