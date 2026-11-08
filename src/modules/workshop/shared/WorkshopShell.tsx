import type { ReactNode } from 'react'
import { Link, NavLink, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useMyWorkshops } from '../WorkshopIndexPage'
import { fetchMyPermissions, type WorkshopPermissions } from '../customers/api'
import type { MyWorkshop } from '../api'

/** Abas do módulo Oficina (PRD 2.1 §22.1). Itens das próximas fases entram quando existirem. */
type Tab = { to: string; label: string; end?: boolean; show?: (p: WorkshopPermissions) => boolean }
const TABS: Tab[] = [
  { to: '', label: 'Visão geral', end: true },
  { to: 'agenda', label: 'Agenda' },
  { to: 'orcamentos', label: 'Orçamentos' },
  { to: 'os', label: 'Ordens de serviço' },
  { to: 'clientes', label: 'Clientes' },
  { to: 'relacionamento', label: 'Relacionamento' },
  { to: 'motos', label: 'Motos' },
  { to: 'servicos', label: 'Serviços e preços' },
  { to: 'pecas', label: 'Peças' },
  { to: 'financeiro', label: 'Financeiro', show: (p) => p.manage_finance },
  { to: 'relatorios', label: 'Relatórios', show: (p) => p.manage_quotes || p.manage_finance },
  { to: 'equipe', label: 'Equipe' },
  { to: 'perfil', label: 'Perfil da oficina' },
]

export type WorkshopContext = { orgId: string; shop: MyWorkshop; perms: WorkshopPermissions }

export function useWorkshopPermissions(orgId: string) {
  return useQuery({ queryKey: ['workshop-perms', orgId], queryFn: () => fetchMyPermissions(orgId), enabled: Boolean(orgId), staleTime: 60_000 })
}

/** Cabeçalho e abas da oficina; entrega oficina e permissões para a página. */
export function WorkshopShell({ children }: { children: (ctx: WorkshopContext) => ReactNode }) {
  const { orgId = '' } = useParams()
  const workshops = useMyWorkshops()
  const perms = useWorkshopPermissions(orgId)

  if (workshops.isLoading || perms.isLoading) return <p className="text-muted" role="status">Carregando…</p>
  const shop = workshops.data?.find((w) => w.organization_id === orgId)
  if (!shop || !perms.data) {
    return (
      <div>
        <h1 className="heading text-3xl text-ink">Oficina não encontrada</h1>
        <p className="mt-2 text-muted">Ela não existe ou você não faz parte da equipe.</p>
        <Link to="/oficina" className="mt-5 inline-block font-semibold text-ink underline underline-offset-4">Voltar</Link>
      </div>
    )
  }
  const tabs = TABS.filter((t) => (t.to !== 'perfil' || shop.role === 'responsible') && (!t.show || t.show(perms.data)))

  return (
    <div>
      <div className="print:hidden">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Moto Passaporte Oficina</p>
        <p className="heading text-lg text-ink">{shop.business_name}</p>
        <nav aria-label="Áreas da oficina" className="-mx-1 mt-3 overflow-x-auto border-b border-rule">
          <ul className="flex min-w-max gap-1 px-1">
            {tabs.map((t) => (
              <li key={t.label}>
                <NavLink to={t.to ? `/oficina/${orgId}/${t.to}` : `/oficina/${orgId}`} end={t.end}
                  className={({ isActive }) =>
                    `-mb-px inline-block border-b-2 px-3 py-2.5 text-sm font-semibold ${isActive ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
                  {t.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="mt-6 print:mt-0">{children({ orgId, shop, perms: perms.data })}</div>
    </div>
  )
}

export function StatusChip({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${className}`}>{children}</span>
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-sheet border border-dashed border-rule bg-sheet px-6 py-10 text-center">
      <p className="heading text-lg text-ink">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-muted">{children}</div>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  )
}

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-sheet border border-rule bg-sheet p-4 sm:p-5 ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="heading text-lg text-ink">{title}</h2>}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

/** Para páginas antigas da oficina (equipe, perfil): mesmas abas, sem mudar a página. */
export function ShellRoute({ children }: { children: ReactNode }) {
  return <WorkshopShell>{() => children}</WorkshopShell>
}
