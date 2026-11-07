import { Link, Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/core/auth/AuthProvider'
import { ButtonLink } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { fetchMyWorkshops } from './api'

export function useMyWorkshops() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['my-workshops', user?.id],
    enabled: Boolean(user),
    queryFn: () => fetchMyWorkshops(user!.id),
  })
}

/** /oficina — sem oficina: convite ao cadastro; uma: abre o painel; várias: lista. */
export function WorkshopIndexPage() {
  const workshops = useMyWorkshops()

  if (workshops.isLoading) return <p className="text-muted" role="status">Carregando…</p>
  if (workshops.isError) return <Notice tone="error">Não foi possível carregar suas oficinas. Recarregue a página.</Notice>

  const list = workshops.data ?? []
  if (list.length === 1) return <Navigate to={`/oficina/${list[0]!.organization_id}`} replace />

  if (list.length === 0) {
    return (
      <div className="max-w-2xl">
        <h1 className="heading text-3xl text-ink">Você tem uma oficina?</h1>
        <p className="mt-3 text-muted">
          Cadastre sua oficina de graça. Ela ganha um perfil público na rede Moto Passaporte e, em breve, poderá registrar os serviços direto no passaporte das motos dos clientes, com autorização de cada dono.
        </p>
        <ButtonLink to="/oficina/nova" className="mt-6">Cadastrar oficina</ButtonLink>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="heading text-3xl text-ink">Minhas oficinas</h1>
        <ButtonLink to="/oficina/nova" variant="secondary" size="sm">Cadastrar outra</ButtonLink>
      </div>
      <ul className="mt-6 divide-y divide-rule border-y border-rule">
        {list.map((w) => (
          <li key={w.organization_id}>
            <Link to={`/oficina/${w.organization_id}`} className="flex justify-between gap-3 py-4 hover:bg-sheet">
              <span className="font-semibold text-ink">{w.business_name}</span>
              <span className="text-sm text-muted">{[w.city, w.state].filter(Boolean).join(', ')}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
