import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/core/auth/AuthProvider'
import { Notice } from '@/components/Notice'
import { ButtonLink } from '@/components/Button'
import { formatKm, formatPlate } from '@/core/shared/format'
import { fetchMyMotorcycles } from '@/modules/motorcycles/api'
import { fetchPendingRequests } from '@/modules/workshop_access/api'
import { PendingRequestsNotice } from '@/modules/workshop_access/OwnerAccessSection'
import { IncomingTransfers, PreviousMotorcycles } from '@/modules/transfers/IncomingTransfers'
import { PlanSummary } from '@/modules/plans/MyPlanPage'

export function DashboardPage() {
  const { user } = useAuth()
  const firstName = ((user?.user_metadata?.full_name as string | undefined) ?? '').split(' ')[0]

  const motorcycles = useQuery({
    queryKey: ['my-motorcycles', user?.id],
    enabled: Boolean(user),
    queryFn: fetchMyMotorcycles,
  })

  const pending = useQuery({ queryKey: ['pending-access', user?.id], enabled: Boolean(user), queryFn: fetchPendingRequests })

  const hasMotos = Boolean(motorcycles.data && motorcycles.data.length > 0)

  return (
    <div>
      <h1 className="heading text-3xl text-ink">{firstName ? `Olá, ${firstName}` : 'Seu painel'}</h1>
      {pending.data && pending.data.length > 0 && (
        <div className="mt-6">
          <PendingRequestsNotice requests={pending.data} />
        </div>
      )}
      <div className="mt-6">
        <IncomingTransfers />
      </div>

      <div className="mt-10 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-semibold text-ink">Minhas motos</h2>
        {hasMotos && <ButtonLink to="/painel/motos/nova" variant="secondary" size="sm">Cadastrar moto</ButtonLink>}
      </div>
      <div className="mt-1">
        <PlanSummary />
      </div>

      <div className="mt-4">
        {motorcycles.isLoading && <p className="text-muted" role="status">Carregando suas motos…</p>}
        {motorcycles.isError && (
          <Notice tone="error">Não foi possível carregar suas motos. Recarregue a página para tentar de novo.</Notice>
        )}
        {motorcycles.data && motorcycles.data.length === 0 && (
          <div className="rounded-sheet border border-dashed border-rule bg-sheet p-8">
            <p className="font-semibold text-ink">Você ainda não cadastrou nenhuma moto.</p>
            <p className="mt-1 text-muted">Cadastre sua moto para criar o passaporte e começar o histórico.</p>
            <ButtonLink to="/painel/motos/nova" className="mt-5">Cadastrar moto</ButtonLink>
          </div>
        )}
        {hasMotos && (
          <ul className="divide-y divide-rule border-y border-rule">
            {motorcycles.data!.map((m) => (
              <li key={m.id}>
                <Link
                  to={`/painel/motos/${m.id}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 py-4 hover:bg-sheet focus-visible:bg-sheet"
                >
                  <div>
                    <p className="font-semibold text-ink">
                      {[m.brand, m.model, m.version].filter(Boolean).join(' ')}
                    </p>
                    <p className="text-sm text-muted">
                      {m.manufacturing_year}
                      {m.model_year ? `/${m.model_year}` : ''}, placa {formatPlate(m.current_plate)}
                    </p>
                  </div>
                  <p className="text-sm text-graphite">{formatKm(m.latest_mileage)}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-10">
        <PreviousMotorcycles />
      </div>
    </div>
  )
}
