import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { TextField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { translateDbError } from '@/core/shared/dbErrors'
import { formatDate, formatKm, formatPlate, todayISO } from '@/core/shared/format'
import { acceptTransfer, fetchIncomingTransfers, fetchPreviousMotorcycles, rejectTransfer, type IncomingTransfer } from './api'

const errText = (e: unknown) => translateDbError(e as { code?: string; message?: string })

/** Painel do comprador: passaportes enviados para o e-mail da conta (PRD 10). */
export function IncomingTransfers() {
  const incoming = useQuery({ queryKey: ['incoming-transfers'], queryFn: fetchIncomingTransfers })
  if (!incoming.data || incoming.data.length === 0) return null
  return (
    <section aria-labelledby="incoming-title" className="flex flex-col gap-3">
      <h2 id="incoming-title" className="heading text-xl text-ink">
        {incoming.data.length === 1 ? 'Um passaporte foi transferido para você' : 'Passaportes transferidos para você'}
      </h2>
      {incoming.data.map((t) => <IncomingCard key={t.id} transfer={t} />)}
    </section>
  )
}

function IncomingCard({ transfer: t }: { transfer: IncomingTransfer }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [date, setDate] = useState('')
  const [confirmReject, setConfirmReject] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['incoming-transfers'] }),
      queryClient.invalidateQueries({ queryKey: ['my-motorcycles'] }),
    ])
  }

  async function onAccept() {
    setBusy(true)
    setError('')
    try {
      const motoId = await acceptTransfer(t.id, date)
      await refresh()
      navigate(`/painel/motos/${motoId}`, { state: { transferred: true } })
    } catch (e) {
      setError(errText(e))
      setBusy(false)
    }
  }

  async function onReject() {
    setBusy(true)
    setError('')
    try {
      await rejectTransfer(t.id)
      await refresh()
    } catch (e) {
      setError(errText(e))
      setBusy(false)
    }
  }

  const title = [t.brand, t.model, t.version].filter(Boolean).join(' ')
  return (
    <article aria-label={`Transferência: ${title}`} className="rounded-doc border border-stamp/60 bg-sheet p-5">
      <p className="text-sm text-stamp">{t.from_name ? `${t.from_name} transferiu para você` : 'Transferido para você'}</p>
      <h3 className="heading mt-1 text-xl text-ink">{title}, {t.manufacturing_year}</h3>
      <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-sm">
        <div className="flex gap-1.5"><dt className="text-muted">Placa</dt><dd className="font-semibold text-ink">{t.plate ? formatPlate(t.plate) : '—'}</dd></div>
        <div className="flex gap-1.5"><dt className="text-muted">Última leitura</dt><dd className="font-semibold text-ink">{formatKm(t.latest_mileage)}</dd></div>
        <div className="flex gap-1.5"><dt className="text-muted">Registros no histórico</dt><dd className="font-semibold text-ink">{t.maintenance_count}</dd></div>
      </dl>
      {t.message && <p className="mt-3 text-graphite">“{t.message}”</p>}
      <p className="mt-2 text-xs text-muted">Vale até {formatDate(t.expires_at, 'short')}.</p>
      <p className="mt-3 max-w-prose text-sm text-muted">
        Ao aceitar, você passa a ser o titular do passaporte, com o histórico completo. Oficinas autorizadas pelo dono anterior perdem o acesso;
        você autoriza as suas. Isso não substitui a transferência no DETRAN.
      </p>
      <div className="mt-4 max-w-[14rem]">
        <TextField label="Data da compra (opcional)" type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {confirmReject ? (
          <>
            <span className="text-sm text-graphite">Recusar esta transferência?</span>
            <Button type="button" size="sm" loading={busy} onClick={onReject}>Recusar</Button>
            <Button type="button" size="sm" variant="quiet" disabled={busy} onClick={() => setConfirmReject(false)}>Voltar</Button>
          </>
        ) : (
          <>
            <Button type="button" loading={busy} onClick={onAccept}>{busy ? 'Aceitando…' : 'Aceitar e receber a moto'}</Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setConfirmReject(true)}>Recusar</Button>
          </>
        )}
      </div>
    </article>
  )
}

/** Painel: motos que já foram suas (acesso ao próprio diário). */
export function PreviousMotorcycles() {
  const previous = useQuery({ queryKey: ['previous-motorcycles'], queryFn: fetchPreviousMotorcycles })
  if (!previous.data || previous.data.length === 0) return null
  return (
    <section aria-labelledby="previous-title">
      <h2 id="previous-title" className="font-semibold text-ink">Motos anteriores</h2>
      <ul className="mt-3 divide-y divide-rule border-y border-rule">
        {previous.data.map((m) => (
          <li key={m.motorcycle_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="font-semibold text-graphite">{[m.brand, m.model, m.version].filter(Boolean).join(' ')}, {m.manufacturing_year}</p>
              <p className="text-sm text-muted">Sua até {formatDate(m.owned_until, 'short')}</p>
            </div>
            {m.my_diary_entries > 0 ? (
              <Link to={`/painel/motos-anteriores/${m.motorcycle_id}`} className="text-sm font-semibold text-ink underline underline-offset-4">
                Seu diário ({m.my_diary_entries})
              </Link>
            ) : (
              <span className="text-sm text-muted">Sem entradas no diário</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
