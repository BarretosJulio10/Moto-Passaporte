import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { CheckboxField, TextAreaField, TextField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { translateDbError } from '@/core/shared/dbErrors'
import { formatDate } from '@/core/shared/format'
import { cancelTransfer, createTransfer, fetchMotorcycleTransfers, TRANSFER_STATUS_LABEL, type TransferStatus } from './api'

const errText = (e: unknown) => translateDbError(e as { code?: string; message?: string })

/** Titular transfere o passaporte para a conta do comprador (PRD 10). */
export function TransferSection({ motorcycleId }: { motorcycleId: string }) {
  const queryClient = useQueryClient()
  const transfers = useQuery({ queryKey: ['transfers', motorcycleId], queryFn: () => fetchMotorcycleTransfers(motorcycleId) })
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [understood, setUnderstood] = useState(false)
  const [fieldError, setFieldError] = useState<string>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const list = transfers.data ?? []
  const pending = list.find((t) => t.status === 'pending')
  const past = list.filter((t) => t.status !== 'pending')

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['transfers', motorcycleId] })
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const value = email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      setFieldError('Informe o e-mail da conta do comprador.')
      return
    }
    if (!understood) {
      setFieldError(undefined)
      setError('Confirme que entendeu o que acontece na transferência.')
      return
    }
    setFieldError(undefined)
    setError('')
    setBusy(true)
    try {
      await createTransfer(motorcycleId, value, message)
      setOpen(false)
      setEmail('')
      setMessage('')
      setUnderstood(false)
      await refresh()
    } catch (e) {
      setError(errText(e))
    }
    setBusy(false)
  }

  async function onCancel(id: string) {
    setBusy(true)
    setError('')
    try {
      await cancelTransfer(id)
      await refresh()
    } catch (e) {
      setError(errText(e))
    }
    setBusy(false)
  }

  return (
    <section id="transferir" aria-labelledby="transfer-title" className="scroll-mt-24">
      <h2 id="transfer-title" className="heading text-xl text-ink">Vendeu a moto?</h2>
      <p className="mt-1 max-w-prose text-sm text-muted">
        Transfira o passaporte para a conta do comprador. O histórico continua com a moto. Isso não substitui a transferência no DETRAN.
      </p>
      {error && !open && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}

      {pending && (
        <div className="mt-4 rounded-doc border border-stamp/60 bg-sheet p-4">
          <p className="text-sm font-semibold text-stamp">Transferência aguardando o comprador</p>
          <p className="mt-1 text-graphite">Enviada para <strong className="text-ink">{pending.to_email}</strong></p>
          <p className="text-sm text-muted">Vale até {formatDate(pending.expires_at, 'short')}. O comprador entra com esse e-mail e aceita no painel.</p>
          <div className="mt-3">
            <Button type="button" size="sm" variant="secondary" loading={busy} onClick={() => onCancel(pending.id)}>Cancelar transferência</Button>
          </div>
        </div>
      )}

      {!pending && !open && (
        <div className="mt-3">
          <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>Transferir passaporte</Button>
        </div>
      )}

      {!pending && open && (
        <form noValidate onSubmit={onSubmit} className="mt-4 flex max-w-xl flex-col gap-4 rounded-doc border border-rule bg-sheet p-4">
          <TextField label="E-mail da conta do comprador" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} error={fieldError}
            hint="Se o comprador ainda não tem conta, peça para criar uma com este e-mail." />
          <TextAreaField label="Mensagem (opcional)" rows={2} maxLength={280} value={message} onChange={(e) => setMessage(e.target.value)} />
          <div className="rounded-doc border border-rule bg-paper p-3 text-sm text-graphite">
            <p className="font-semibold text-ink">Quando o comprador aceitar:</p>
            <ul className="mt-1 list-disc pl-5">
              <li>ele passa a ser o titular, com todo o histórico, comprovantes e quilometragem;</li>
              <li>você deixa de ver e editar esta moto;</li>
              <li>todas as oficinas autorizadas, inclusive a Oficina de Origem, perdem o acesso;</li>
              <li>suas entradas privadas do diário continuam só suas; as compartilháveis seguem com a moto.</li>
            </ul>
          </div>
          <CheckboxField label="Entendi o que acontece na transferência." checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
          {error && <Notice tone="error">{error}</Notice>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={busy}>{busy ? 'Enviando…' : 'Enviar transferência'}</Button>
            <Button type="button" variant="quiet" disabled={busy} onClick={() => { setOpen(false); setError(''); setFieldError(undefined) }}>Cancelar</Button>
          </div>
        </form>
      )}

      {past.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink">Pedidos anteriores ({past.length})</summary>
          <ul className="mt-2 divide-y divide-rule text-sm">
            {past.map((t) => (
              <li key={t.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span className="text-graphite">{t.to_email}</span>
                <span className="text-muted">{TRANSFER_STATUS_LABEL[t.status as TransferStatus] ?? t.status} em {formatDate(t.decided_at ?? t.expires_at, 'short')}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
