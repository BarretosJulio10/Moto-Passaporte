import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { translateDbError } from '@/core/shared/dbErrors'
import { formatDate } from '@/core/shared/format'
import { decideAccess, fetchMotorcycleAccess, revokeAccess, STATUS_LABEL, type OwnerAccess } from './api'

/** Titular aprova, recusa e revoga oficinas (PRD 6.4 passo 6 e 6.6). */
export function OwnerAccessSection({ motorcycleId }: { motorcycleId: string }) {
  const queryClient = useQueryClient()
  const access = useQuery({ queryKey: ['moto-access', motorcycleId], queryFn: () => fetchMotorcycleAccess(motorcycleId) })
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function run(id: string, action: () => Promise<void>) {
    setBusy(id)
    setError('')
    try {
      await action()
      setConfirmRevoke(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['moto-access', motorcycleId] }),
        queryClient.invalidateQueries({ queryKey: ['pending-access'] }),
      ])
    } catch (err) {
      setError(translateDbError(err as { code?: string; message?: string }))
    }
    setBusy(null)
  }

  const all = access.data ?? []
  const pending = all.filter((a) => a.status === 'pending')
  const approved = all.filter((a) => a.status === 'approved')
  const closed = all.filter((a) => a.status !== 'pending' && a.status !== 'approved')

  const place = (a: OwnerAccess) => [a.workshop_city, a.workshop_state].filter(Boolean).join(', ')
  const name = (a: OwnerAccess) =>
    a.workshop_slug ? (
      <Link to={`/oficinas/${a.workshop_slug}`} className="font-semibold text-ink underline underline-offset-4">{a.workshop_name}</Link>
    ) : (
      <span className="font-semibold text-ink">{a.workshop_name}</span>
    )

  return (
    <section id="oficinas" aria-labelledby="owner-access-title" className="scroll-mt-24">
      <h2 id="owner-access-title" className="heading text-xl text-ink">Oficinas com acesso</h2>
      <p className="mt-1 max-w-prose text-sm text-muted">
        Oficina autorizada vê a identificação da moto, a placa atual e a última quilometragem. Você pode revogar a qualquer momento.
      </p>

      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      {access.isLoading && <p className="mt-3 text-muted" role="status">Carregando…</p>}
      {access.isError && <div className="mt-3"><Notice tone="error">Não foi possível carregar as oficinas.</Notice></div>}

      {pending.map((a) => (
        <div key={a.id} className="mt-4 rounded-doc border border-stamp/60 bg-sheet p-4">
          <p className="text-sm font-semibold text-stamp">Pedido de acesso</p>
          <p className="mt-1">{name(a)}{place(a) && <span className="text-muted">, {place(a)}</span>}</p>
          {a.workshop_verified && <p className="text-sm text-muted">Cadastro verificado pela equipe</p>}
          {a.message && <p className="mt-2 text-graphite">“{a.message}”</p>}
          <p className="mt-1 text-xs text-muted">Pedido em {formatDate(a.requested_at, 'short')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" loading={busy === a.id} disabled={!a.workshop_active} onClick={() => run(a.id, () => decideAccess(a.id, true))}>
              Autorizar
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={busy === a.id} onClick={() => run(a.id, () => decideAccess(a.id, false))}>
              Recusar
            </Button>
          </div>
          {!a.workshop_active && <p className="mt-2 text-sm text-danger">Esta oficina está suspensa na plataforma.</p>}
        </div>
      ))}

      {approved.length > 0 && (
        <ul className="mt-4 divide-y divide-rule border-y border-rule">
          {approved.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p>{name(a)}{place(a) && <span className="text-muted">, {place(a)}</span>}</p>
                <p className="text-sm text-muted">Autorizada em {formatDate(a.decided_at, 'short')}</p>
              </div>
              {confirmRevoke === a.id ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-graphite">Revogar o acesso?</span>
                  <Button type="button" size="sm" loading={busy === a.id} onClick={() => run(a.id, () => revokeAccess(a.id))}>Revogar</Button>
                  <Button type="button" size="sm" variant="quiet" onClick={() => setConfirmRevoke(null)}>Manter</Button>
                </div>
              ) : (
                <Button type="button" size="sm" variant="quiet" onClick={() => setConfirmRevoke(a.id)}>Revogar acesso</Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {access.isSuccess && pending.length === 0 && approved.length === 0 && (
        <p className="mt-3 text-muted">Nenhuma oficina autorizada. Quando uma oficina pedir acesso, o pedido aparece aqui.</p>
      )}

      {closed.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink">Histórico de autorizações ({closed.length})</summary>
          <ul className="mt-2 divide-y divide-rule text-sm">
            {closed.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span className="text-graphite">{a.workshop_name}</span>
                <span className="text-muted">{STATUS_LABEL[a.status]} em {formatDate(a.ended_at ?? a.decided_at ?? a.requested_at, 'short')}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

/** Aviso no painel: pedidos de acesso pendentes em todas as motos. */
export function PendingRequestsNotice({ requests }: { requests: Array<{ id: string; motorcycle_id: string; motorcycle_label: string; workshop_name: string }> }) {
  if (requests.length === 0) return null
  return (
    <Notice tone="info" title={requests.length === 1 ? 'Uma oficina pediu acesso' : `${requests.length} pedidos de acesso de oficinas`}>
      <ul className="mt-1 flex flex-col gap-1">
        {requests.map((r) => (
          <li key={r.id}>
            {r.workshop_name} pediu acesso à{' '}
            <Link to={`/painel/motos/${r.motorcycle_id}#oficinas`} className="font-semibold underline underline-offset-4">{r.motorcycle_label}</Link>
          </li>
        ))}
      </ul>
    </Notice>
  )
}
