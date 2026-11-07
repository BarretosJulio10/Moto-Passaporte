import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { formatDate, formatKm } from '@/core/shared/format'
import { CATEGORY_LABEL } from './labels'
import { applyFilters, EMPTY_FILTERS, fetchTimeline } from './api'

/** Últimos registros vigentes, no resumo da moto (PRD 5.3). */
export function RecentRecords({ motorcycleId }: { motorcycleId: string }) {
  const timeline = useQuery({ queryKey: ['timeline', motorcycleId], queryFn: () => fetchTimeline(motorcycleId) })
  const recent = applyFilters(timeline.data ?? [], EMPTY_FILTERS).slice(0, 3)

  return (
    <section aria-labelledby="recent-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="recent-title" className="font-semibold text-ink">Últimos registros</h2>
        <Link to={`/painel/motos/${motorcycleId}/historico`} className="text-sm font-semibold text-ink underline underline-offset-4">
          Ver histórico completo
        </Link>
      </div>
      {timeline.isSuccess && recent.length === 0 && (
        <p className="mt-2 text-muted">
          Nenhum serviço registrado.{' '}
          <Link to={`/painel/motos/${motorcycleId}/historico/novo`} className="font-semibold text-ink underline underline-offset-4">
            Adicionar o primeiro
          </Link>
        </p>
      )}
      {recent.length > 0 && (
        <ul className="mt-3 divide-y divide-rule border-y border-rule">
          {recent.map((e) => (
            <li key={e.id} className="grid gap-1 py-3 sm:grid-cols-[7rem_1fr_auto] sm:gap-4">
              <span className="text-sm text-muted">{formatDate(e.service_date, 'short')}</span>
              <span className="text-graphite">
                <span className="font-semibold text-ink">{e.title}</span>
                <span className="text-sm text-muted">, {CATEGORY_LABEL[e.category]}</span>
              </span>
              {e.mileage !== null && <span className="text-sm text-muted">{formatKm(e.mileage)}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
