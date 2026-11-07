import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { translateDbError } from '@/core/shared/dbErrors'
import { formatDate, formatKm, formatPlate } from '@/core/shared/format'
import { cancelRequest, fetchWorkshopAccess, ORIGIN_LABEL, splitWorkshopAccess, STATUS_LABEL, type WorkshopAccess } from './api'

/** Motos autorizadas, pedidos pendentes e histórico da oficina (PRD 6.3). */
export function WorkshopAccessList({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient()
  const list = useQuery({ queryKey: ['workshop-access', organizationId], queryFn: () => fetchWorkshopAccess(organizationId) })
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function onCancel(id: string) {
    setBusy(id)
    setError('')
    try {
      await cancelRequest(id)
      await queryClient.invalidateQueries({ queryKey: ['workshop-access', organizationId] })
    } catch (err) {
      setError(translateDbError(err as { code?: string; message?: string }))
    }
    setBusy(null)
  }

  if (list.isLoading) return <p className="text-muted" role="status">Carregando motos…</p>
  if (list.isError) return <Notice tone="error">Não foi possível carregar as motos da oficina.</Notice>
  const { approved, pending, closed } = splitWorkshopAccess(list.data ?? [])
  const label = (a: WorkshopAccess) => `${a.brand} ${a.model}, ${a.manufacturing_year}`

  return (
    <div className="flex flex-col gap-8">
      {error && <Notice tone="error">{error}</Notice>}

      <section aria-labelledby="approved-title">
        <h2 id="approved-title" className="heading text-xl text-ink">Motos autorizadas ({approved.length})</h2>
        {approved.length === 0 ? (
          <p className="mt-2 text-muted">Nenhuma ainda. Pesquise a placa do cliente e peça acesso.</p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {approved.map((a) => (
              <li key={a.id} className="rounded-doc border border-rule bg-sheet p-4">
                <p className="heading text-lg text-ink">{label(a)}</p>
                {a.access_type === 'origin' && <OriginBadge />}
                <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-muted">Placa</dt>
                    <dd className="font-semibold text-ink">{a.plate ? formatPlate(a.plate) : '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Última leitura</dt>
                    <dd className="font-semibold text-ink">{formatKm(a.latest_mileage)}</dd>
                  </div>
                </dl>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted">Autorizada em {formatDate(a.decided_at, 'short')}</p>
                  {a.motorcycle_id && (
                    <Link
                      to={`/oficina/${organizationId}/motos/${a.motorcycle_id}`}
                      className="text-sm font-semibold text-ink underline underline-offset-4"
                      aria-label={`Abrir ${label(a)}`}
                    >
                      Abrir histórico
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pending.length > 0 && (
        <section aria-labelledby="pending-title">
          <h2 id="pending-title" className="heading text-xl text-ink">Aguardando o titular ({pending.length})</h2>
          <ul className="mt-3 divide-y divide-rule border-y border-rule">
            {pending.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold text-ink">{label(a)}</p>
                  {a.access_type === 'origin' && <p className="text-sm text-stamp">Com pedido de reconhecimento como {ORIGIN_LABEL}</p>}
                  <p className="text-sm text-muted">Pedido em {formatDate(a.requested_at, 'short')}</p>
                </div>
                <Button type="button" variant="quiet" size="sm" loading={busy === a.id} onClick={() => onCancel(a.id)}>
                  Cancelar pedido
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {closed.length > 0 && (
        <details className="rounded-doc border border-rule bg-sheet p-4">
          <summary className="cursor-pointer font-semibold text-ink">Histórico de pedidos ({closed.length})</summary>
          <ul className="mt-3 divide-y divide-rule">
            {closed.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                <span className="text-graphite">{label(a)}</span>
                <span className="text-muted">
                  {STATUS_LABEL[a.status]} em {formatDate(a.ended_at ?? a.decided_at ?? a.requested_at, 'short')}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

export function OriginBadge() {
  return (
    <span className="mt-1 inline-block rounded-[0.35rem] border border-stamp px-2 py-0.5 text-xs font-semibold text-stamp">
      {ORIGIN_LABEL}
    </span>
  )
}
