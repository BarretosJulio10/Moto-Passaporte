import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/core/auth/AuthProvider'
import { describeDue, fetchDueReminders } from './api'

/** Painel: lembretes vencidos ou próximos de todas as motos. */
export function DueReminders() {
  const { user } = useAuth()
  const due = useQuery({ queryKey: ['due-reminders', user?.id], enabled: Boolean(user), queryFn: fetchDueReminders })
  const items = due.data ?? []
  if (items.length === 0) return null
  return (
    <section aria-labelledby="due-title" className="mt-6 rounded-doc border border-rule bg-sheet p-4">
      <h2 id="due-title" className="font-semibold text-ink">Lembretes de manutenção</h2>
      <ul className="mt-2 space-y-1.5 text-sm">
        {items.slice(0, 6).map((r) => (
          <li key={r.id}>
            <Link to={`/painel/motos/${r.motorcycle_id}`} className="font-semibold text-ink underline underline-offset-4">
              {r.title}
            </Link>{' '}
            <span className={r.status === 'due' ? 'text-danger' : 'text-muted'}>
              {r.motorcycle_name ? `· ${r.motorcycle_name} ` : ''}· {r.status === 'due' ? 'vencido' : 'em breve'}
              {describeDue(r) ? ` (${describeDue(r)})` : ''}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
