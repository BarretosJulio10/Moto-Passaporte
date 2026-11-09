import { NavLink, useMatch } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/core/auth/AuthProvider'
import { fetchMyWorkshops } from '../api'
import { fetchMyPermissions, type WorkshopPermissions } from '../customers/api'
import type { MyWorkshop } from '../api'

/**
 * Menu da oficina agrupado por tarefa (ADR-053): dia a dia em cima, cadastros e crescimento no meio,
 * gestão e configuração embaixo. Computador: dentro do menu lateral; celular: menu recolhível.
 */
export type NavItem = { to: string; label: string; end?: boolean; show?: (p: WorkshopPermissions, shop: MyWorkshop) => boolean }
export type NavGroup = { label: string; items: NavItem[] }

export const WORKSHOP_NAV: NavGroup[] = [
  {
    // Na ordem em que a moto anda na oficina (plano do fluxo, Fase A).
    label: 'Trabalho',
    items: [
      { to: '', label: 'Esteira', end: true },
      { to: 'entrada/nova', label: '+ Nova entrada', show: (p) => p.manage_quotes },
      { to: 'agenda', label: 'Agenda' },
      { to: 'orcamentos', label: 'Orçamentos' },
      { to: 'os', label: 'Ordens de serviço' },
      { to: 'caixa', label: 'Caixa' },
    ],
  },
  {
    label: 'Clientes',
    items: [
      { to: 'clientes', label: 'Clientes' },
      { to: 'motos', label: 'Motos' },
      { to: 'relacionamento', label: 'Relacionamento' },
      { to: 'campanhas', label: 'Campanhas' },
      { to: 'avaliacoes', label: 'Avaliações' },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { to: 'resultados', label: 'Resultados' },
      { to: 'financeiro', label: 'Financeiro', show: (p) => p.manage_finance },
      { to: 'relatorios', label: 'Relatórios', show: (p) => p.manage_quotes || p.manage_finance },
      { to: 'servicos', label: 'Serviços e preços' },
      { to: 'pecas', label: 'Peças' },
    ],
  },
  {
    label: 'Oficina',
    items: [
      { to: 'equipe', label: 'Equipe' },
      { to: 'pista', label: 'App da Pista' },
      { to: 'perfil', label: 'Perfil da oficina', show: (_p, shop) => shop.role === 'responsible' },
    ],
  },
]

export function useWorkshopPermissions(orgId: string) {
  return useQuery({ queryKey: ['workshop-perms', orgId], queryFn: () => fetchMyPermissions(orgId), enabled: Boolean(orgId), staleTime: 60_000 })
}

export function visibleNav(perms: WorkshopPermissions, shop: MyWorkshop): NavGroup[] {
  return WORKSHOP_NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.show || i.show(perms, shop)) })).filter((g) => g.items.length > 0)
}

export const navHref = (orgId: string, to: string) => (to ? `/oficina/${orgId}/${to}` : `/oficina/${orgId}`)

/** Mesma consulta de useMyWorkshops (WorkshopIndexPage), sem importar a página no menu. */
function useMyWorkshopsLite() {
  const { user } = useAuth()
  return useQuery({ queryKey: ['my-workshops', user?.id], enabled: Boolean(user), queryFn: () => fetchMyWorkshops(user!.id) })
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Sub-menu da oficina no menu lateral do computador (só aparece dentro de /oficina/:id). */
export function WorkshopSideNav() {
  const match = useMatch('/oficina/:orgId/*')
  const orgId = match?.params.orgId ?? ''
  const valid = UUID.test(orgId)
  const workshops = useMyWorkshopsLite()
  const perms = useWorkshopPermissions(valid ? orgId : '')
  const shop = workshops.data?.find((w) => w.organization_id === orgId)
  if (!valid || !shop || !perms.data) return null
  const many = (workshops.data?.length ?? 0) > 1
  return (
    <div className="ml-5 mt-1 border-l border-rule pl-3">
      <p className="truncate px-3 pb-1 pt-1 text-xs font-semibold text-ink" title={shop.business_name}>{shop.business_name}</p>
      {visibleNav(perms.data, shop).map((g) => (
        <div key={g.label} className="mt-2">
          <p className="px-3 pb-0.5 text-[0.7rem] font-semibold uppercase tracking-wider text-muted">{g.label}</p>
          {g.items.map((i) => (
            <NavLink key={i.label} to={navHref(orgId, i.to)} end={i.end}
              className={({ isActive }) => `block rounded-doc px-3 py-1.5 text-sm ${isActive ? 'bg-paper font-semibold text-ink' : 'text-graphite hover:text-ink'}`}>
              {i.label}
            </NavLink>
          ))}
        </div>
      ))}
      {many && <NavLink to="/oficina" end className="mt-2 block px-3 py-1.5 text-xs font-semibold text-muted underline underline-offset-4 hover:text-ink">Trocar de oficina</NavLink>}
    </div>
  )
}
