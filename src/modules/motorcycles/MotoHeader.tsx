import { Link, NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { formatDate } from '@/core/shared/format'
import { fetchMotorcycle } from './api'

/** Cabeçalho comum das páginas de uma moto, com as abas Resumo e Histórico. */
export function MotoHeader({ motorcycleId }: { motorcycleId: string }) {
  const moto = useQuery({ queryKey: ['motorcycle', motorcycleId], queryFn: () => fetchMotorcycle(motorcycleId) })
  const m = moto.data
  const title = m ? [m.brand, m.model, m.version].filter(Boolean).join(' ') : ''
  const tab = ({ isActive }: { isActive: boolean }) =>
    `border-b-2 px-1 pb-2 text-sm font-semibold ${isActive ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'}`

  return (
    <div>
      <Link to="/painel" className="text-sm text-ink underline underline-offset-4">Voltar ao painel</Link>
      <div className="mt-4 flex flex-col gap-1">
        <h1 className="heading min-h-[2.5rem] text-3xl text-ink sm:text-4xl">{title}</h1>
        {m && <p className="text-muted">Passaporte criado em {formatDate(m.passport_created_at)}</p>}
      </div>
      <nav aria-label="Seções da moto" className="mt-6 flex gap-6 border-b border-rule">
        <NavLink end to={`/painel/motos/${motorcycleId}`} className={tab}>Resumo</NavLink>
        <NavLink to={`/painel/motos/${motorcycleId}/historico`} className={tab}>Histórico</NavLink>
      </nav>
    </div>
  )
}
