import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchMyRecords } from './api'

const OPEN = ['open', 'awaiting_diagnosis', 'awaiting_approval', 'awaiting_parts', 'awaiting_execution', 'in_progress', 'paused', 'awaiting_complement', 'completed', 'awaiting_pickup']

/** No painel do dono: atalho para Meus atendimentos quando há oficina ligada. Some quando não há. */
export function MyWorkshopsCard() {
  const q = useQuery({ queryKey: ['my-workshop-records'], queryFn: fetchMyRecords, staleTime: 60_000 })
  if (!q.data || q.data.length === 0) return null
  const open = q.data.reduce((n, r) => n + r.orders.filter((o) => OPEN.includes(o.status)).length, 0)
  const ready = q.data.reduce((n, r) => n + r.orders.filter((o) => o.status === 'awaiting_pickup').length, 0)
  return (
    <Link to="/painel/atendimentos" className="block rounded-sheet border border-rule bg-sheet p-4 hover:border-ink/50">
      <p className="heading text-lg text-ink">Meus atendimentos</p>
      <p className="mt-1 text-sm text-muted">
        {q.data.length} oficina{q.data.length === 1 ? '' : 's'} ligada{q.data.length === 1 ? '' : 's'}
        {open > 0 ? ` · ${open} serviço${open === 1 ? '' : 's'} em andamento` : ''}
        {ready > 0 ? ` · ${ready} pronta${ready === 1 ? '' : 's'} para retirada` : ''}
      </p>
    </Link>
  )
}
