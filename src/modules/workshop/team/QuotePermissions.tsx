import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Notice } from '@/components/Notice'
import { translateDbError } from '@/core/shared/dbErrors'
import { fetchMembers } from '../teamApi'
import { rpc } from '../shared/rpc'

type Extra = { member_id: string; can_manage_quotes: boolean; can_manage_prices: boolean; can_execute_orders: boolean; can_manage_finance: boolean }

const OPTIONS: [keyof Omit<Extra, 'member_id'>, string][] = [
  ['can_manage_quotes', 'Clientes, agenda, orçamentos e OS'],
  ['can_manage_prices', 'Serviços, peças e preços'],
  ['can_execute_orders', 'Executar serviços (mecânico)'],
  ['can_manage_finance', 'Financeiro'],
]

/** Papéis de atendente e de preços (PRD 2.1 §16): o responsável libera por funcionário. */
export function QuotePermissions({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient()
  const members = useQuery({ queryKey: ['org-members', organizationId], queryFn: () => fetchMembers(organizationId) })
  const extra = useQuery({ queryKey: ['org-extra-perms', organizationId], queryFn: () => rpc<Extra[]>('get_org_member_extra_permissions', { p_org: organizationId }) })
  const [error, setError] = useState<string | null>(null)
  const staff = (members.data ?? []).filter((m) => m.role === 'staff')
  if (!members.data || !extra.data || staff.length === 0) return null

  async function set(memberId: string, next: Omit<Extra, 'member_id'>) {
    setError(null)
    try {
      await rpc<void>('set_org_member_extra_permissions', {
        p_member: memberId, p_manage_quotes: next.can_manage_quotes, p_manage_prices: next.can_manage_prices,
        p_execute_orders: next.can_execute_orders, p_manage_finance: next.can_manage_finance,
      })
      await queryClient.invalidateQueries({ queryKey: ['org-extra-perms', organizationId] })
    } catch (err) {
      setError(translateDbError(err as { code?: string; message?: string }))
    }
  }

  return (
    <section aria-labelledby="perm-quotes">
      <h2 id="perm-quotes" className="heading text-xl text-ink">Orçamentos, preços e oficina</h2>
      <p className="mt-1 max-w-prose text-muted">Atendente: clientes, orçamentos e ordens de serviço. Mecânico: executa os serviços, preenche checklist e fotos das OS designadas. Preços e financeiro (recebimentos e relatórios de valores) ficam só com quem você escolher.</p>
      <ul className="mt-4 divide-y divide-rule rounded-sheet border border-rule bg-sheet">
        {staff.map((m) => {
          const e = extra.data.find((x) => x.member_id === m.id)
          if (!e) return null
          return (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <span className="font-semibold text-ink">{m.full_name || m.email || 'Funcionário'}</span>
              <span className="flex flex-wrap gap-4 text-sm">
                {OPTIONS.map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2">
                    <input type="checkbox" className="h-4 w-4 accent-ink" checked={e[key]} onChange={(ev) => set(m.id, { ...e, [key]: ev.target.checked })} />
                    {label}
                  </label>
                ))}
              </span>
            </li>
          )
        })}
      </ul>
      {error && <div className="mt-3 max-w-xl"><Notice tone="error">{error}</Notice></div>}
    </section>
  )
}
