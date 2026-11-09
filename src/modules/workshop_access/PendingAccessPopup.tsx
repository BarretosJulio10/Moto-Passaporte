import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { translateDbError } from '@/core/shared/dbErrors'
import { decideAccess, fetchPendingRequests, type PendingRequest } from './api'

/**
 * Pedido de acesso de oficina em destaque: janela que abre ao entrar no app e a cada troca de tela
 * enquanto houver pedido sem resposta. "Decidir depois" fecha até a próxima tela.
 */
export function PendingAccessPopup({ userId }: { userId: string }) {
  const { pathname } = useLocation()
  const qc = useQueryClient()
  const pending = useQuery({ queryKey: ['pending-access', userId], queryFn: fetchPendingRequests, staleTime: 20_000, retry: false })
  const [closedAt, setClosedAt] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void pending.refetch()
    setClosedAt((c) => (c === pathname ? c : null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  const list = pending.data ?? []
  if (list.length === 0 || closedAt === pathname) return null

  async function decide(r: PendingRequest, approve: boolean) {
    setBusy(r.id)
    setError(null)
    try {
      await decideAccess(r.id, approve, false)
      await qc.invalidateQueries({ queryKey: ['pending-access', userId] })
      await qc.invalidateQueries({ queryKey: ['moto-access', r.motorcycle_id] })
    } catch (err) {
      setError(translateDbError(err as { code?: string; message?: string }))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="pending-access-title">
      <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-sheet border-2 border-brass bg-sheet p-5 shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-brass">Precisa da sua resposta</p>
        <h2 id="pending-access-title" className="heading mt-1 text-2xl text-ink">
          {list.length === 1 ? 'Uma oficina pediu acesso à sua moto' : `${list.length} oficinas pediram acesso`}
        </h2>
        <p className="mt-2 text-sm text-graphite">
          Autorizando, a oficina pode ver o histórico desta moto e registrar os serviços que fizer nela. Você pode tirar o acesso quando quiser.
        </p>
        <ul className="mt-4 space-y-3">
          {list.map((r) => (
            <li key={r.id} className="rounded-doc border border-rule bg-paper p-4">
              <p className="text-lg font-semibold text-ink">{r.workshop_name}</p>
              <p className="text-sm text-muted">
                {[r.workshop_city, r.workshop_state].filter(Boolean).join(' / ') || 'Oficina'} · pediu acesso à <strong className="text-ink">{r.motorcycle_label}</strong>
                {' · '}{new Date(r.requested_at).toLocaleDateString('pt-BR')}
              </p>
              {r.message && <p className="mt-2 text-graphite">“{r.message}”</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button size="sm" loading={busy === r.id} disabled={Boolean(busy)} onClick={() => void decide(r, true)}>Autorizar</Button>
                <Button size="sm" variant="secondary" disabled={Boolean(busy)} onClick={() => void decide(r, false)}>Recusar</Button>
                <Link to={`/painel/motos/${r.motorcycle_id}#oficinas`} onClick={() => setClosedAt(`/painel/motos/${r.motorcycle_id}`)}
                  className="px-1 text-sm font-semibold text-ink underline underline-offset-4">Ver detalhes</Link>
              </div>
            </li>
          ))}
        </ul>
        {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={() => setClosedAt(pathname)} className="px-3 py-2 text-sm font-semibold text-muted underline underline-offset-4">
            Decidir depois
          </button>
        </div>
      </div>
    </div>
  )
}
