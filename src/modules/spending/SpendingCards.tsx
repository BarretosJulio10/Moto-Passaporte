import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { formatBRL } from '@/modules/maintenance/schemas'
import { fetchSpendingSnapshot } from './api'

/** "Gastos este ano" na página da moto (RF-10). */
export function MotoSpendingCard({ motorcycleId }: { motorcycleId: string }) {
  const q = useQuery({ queryKey: ['spending-snapshot', motorcycleId], queryFn: () => fetchSpendingSnapshot(motorcycleId) })
  if (!q.data) return null
  const s = q.data
  return (
    <section aria-labelledby="gastos-moto" className="rounded-sheet border border-rule bg-sheet p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="gastos-moto" className="heading text-xl text-ink">Gastos</h2>
        <Link to={`/painel/motos/${motorcycleId}/gastos`} className="text-sm font-semibold text-ink underline underline-offset-4">Ver gastos</Link>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-4">
        <div><dt className="text-sm text-muted">Este ano</dt><dd className="heading text-2xl tabular-nums text-ink">{formatBRL(s.year_cents)}</dd></div>
        <div><dt className="text-sm text-muted">Este mês</dt><dd className="heading text-2xl tabular-nums text-ink">{formatBRL(s.month_cents)}</dd></div>
      </dl>
      <p className="mt-2 text-xs text-muted">
        {s.year_entries} serviço{s.year_entries === 1 ? '' : 's'} com valor no ano
        {s.year_missing > 0 ? ` · ${s.year_missing} sem valor (fora da soma)` : ''}
      </p>
    </section>
  )
}

/** Resumo de todas as motos no painel (RF-10). Some quando não há nada no ano. */
export function DashboardSpendingCard() {
  const q = useQuery({ queryKey: ['spending-snapshot', 'all'], queryFn: () => fetchSpendingSnapshot(null) })
  const s = q.data
  if (!s || (s.year_cents === 0 && s.year_missing === 0)) return null
  return (
    <section aria-labelledby="gastos-painel" className="rounded-sheet border border-rule bg-sheet p-5">
      <h2 id="gastos-painel" className="heading text-lg text-ink">Gastos com as motos</h2>
      <dl className="mt-2 grid grid-cols-2 gap-4">
        <div><dt className="text-sm text-muted">Este mês</dt><dd className="heading text-xl tabular-nums text-ink">{formatBRL(s.month_cents)}</dd></div>
        <div><dt className="text-sm text-muted">Este ano</dt><dd className="heading text-xl tabular-nums text-ink">{formatBRL(s.year_cents)}</dd></div>
      </dl>
      {s.year_missing > 0 && <p className="mt-2 text-xs text-muted">{s.year_missing} serviço{s.year_missing === 1 ? '' : 's'} sem valor fora da soma.</p>}
    </section>
  )
}
