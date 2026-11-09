import { useTouchMode } from '../flow/touch'
import { useEffect, useRef, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useParams } from 'react-router-dom'
import { useMyWorkshops } from '../WorkshopIndexPage'
import type { WorkshopPermissions } from '../customers/api'
import type { MyWorkshop } from '../api'
import { WORKSHOP_NAV, navHref, useWorkshopPermissions, visibleNav } from './WorkshopNav'

export { useWorkshopPermissions }

export type WorkshopContext = { orgId: string; shop: MyWorkshop; perms: WorkshopPermissions }

/** Cabeçalho e abas da oficina; entrega oficina e permissões para a página. */
export function WorkshopShell({ children }: { children: (ctx: WorkshopContext) => ReactNode }) {
  const { orgId = '' } = useParams()
  const workshops = useMyWorkshops()
  const perms = useWorkshopPermissions(orgId)
  const [touch, setTouch] = useTouchMode()
  const { pathname } = useLocation()
  const onEsteira = pathname === `/oficina/${orgId}`

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
  return (
    <div className={touch ? 'touch-mode' : undefined}>
      <MobileWorkshopNav orgId={orgId} shop={shop} perms={perms.data} />
      {touch && !onEsteira && (
        <div className="sticky top-0 z-30 -mx-1 mb-4 flex items-center justify-between gap-2 rounded-doc bg-ink px-3 py-2 text-sheet print:hidden">
          <Link to={`/oficina/${orgId}`} className="flex h-12 items-center rounded-doc bg-sheet px-4 font-bold text-ink">‹ Esteira</Link>
          <span className="text-sm font-semibold">Modo toque</span>
          <button type="button" onClick={() => setTouch(false)} className="h-12 rounded-doc border border-sheet/40 px-3 text-sm font-semibold">Sair do modo toque</button>
        </div>
      )}
      <div className="print:mt-0">{children({ orgId, shop, perms: perms.data })}</div>
    </div>
  )
}

/**
 * Celular e tablet (sem menu lateral): nome da oficina, atalhos do dia a dia e o menu completo
 * agrupado num painel que abre e fecha. No computador o menu fica no lado esquerdo (WorkshopSideNav).
 */
function MobileWorkshopNav({ orgId, shop, perms }: { orgId: string; shop: MyWorkshop; perms: WorkshopPermissions }) {
  const { pathname } = useLocation()
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => { if (ref.current) ref.current.open = false }, [pathname])
  const groups = visibleNav(perms, shop)
  const current = groups.flatMap((g) => g.items).filter((i) => {
    const href = navHref(orgId, i.to)
    return i.end ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
  }).sort((a, b) => b.to.length - a.to.length)[0]
  const quick = WORKSHOP_NAV[0]!.items
  return (
    <div className="mb-5 print:hidden lg:hidden">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">Oficina</p>
      <p className="heading truncate text-lg text-ink">{shop.business_name}</p>
      <nav aria-label="Dia a dia da oficina" className="-mx-1 mt-2 overflow-x-auto">
        <ul className="flex min-w-max gap-1.5 px-1">
          {quick.map((i) => (
            <li key={i.label}>
              <NavLink to={navHref(orgId, i.to)} end={i.end}
                className={({ isActive }) => `inline-block rounded-full border px-3 py-1.5 text-sm font-semibold ${isActive ? 'border-ink bg-ink text-sheet' : 'border-rule bg-sheet text-ink'}`}>
                {i.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <details ref={ref} className="group mt-2 rounded-sheet border border-rule bg-sheet">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 text-sm font-semibold text-ink">
          <span>Menu da oficina{current && !quick.includes(current) ? <span className="font-normal text-muted"> · {current.label}</span> : ''}</span>
          <span aria-hidden="true" className="text-muted transition group-open:rotate-180">▾</span>
        </summary>
        <nav aria-label="Áreas da oficina" className="grid gap-4 border-t border-rule px-4 py-3 sm:grid-cols-2">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted">{g.label}</p>
              <ul className="mt-1">
                {g.items.map((i) => (
                  <li key={i.label}>
                    <NavLink to={navHref(orgId, i.to)} end={i.end}
                      className={({ isActive }) => `block rounded-doc px-2 py-2 text-sm ${isActive ? 'bg-paper font-semibold text-ink' : 'text-graphite'}`}>
                      {i.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </details>
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
