import { Suspense, useEffect, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Logo } from '@/components/Logo'
import { useAuth } from '@/core/auth/AuthProvider'
import { getSupabase } from '@/lib/supabase'
import { fetchUnreadCount } from '@/modules/notifications/api'
import { InstallBanner } from '@/core/pwa/PwaBanners'
import { WorkshopSideNav } from '@/modules/workshop/shared/WorkshopNav'
import { TermsGate } from '@/modules/account/TermsGate'
import { PendingAccessPopup } from '@/modules/workshop_access/PendingAccessPopup'

// Ícones simples (traço), herdam a cor do texto.
const I = {
  moto: 'M5 17a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm14 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8 14h6l3-5h-4l-2-3H8M14 9l2 5',
  shop: 'M3 10l1.5-5h15L21 10M4 10v10h16V10M3 10h18M9 20v-6h6v6',
  bell: 'M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10.3 21a1.94 1.94 0 0 0 3.4 0',
  plan: 'M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9L12 3Z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9a8 8 0 0 1 16 0',
  admin: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Zm-3 9l2 2 4-4',
  out: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11',
}
function Icon({ d, className = 'h-5 w-5' }: { d: string; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

const ADMIN_LINKS: [string, string][] = [
  ['/admin', 'Visão geral'],
  ['/admin/usuarios', 'Usuários'],
  ['/admin/oficinas', 'Oficinas'],
  ['/admin/verificacoes', 'Verificações de placa'],
  ['/admin/avaliacoes', 'Avaliações de oficinas'],
  ['/admin/assinaturas', 'Assinaturas e pagamentos'],
  ['/admin/planos', 'Planos'],
  ['/admin/pagamentos', 'Mercado Pago'],
  ['/admin/mensagens', 'E-mail e WhatsApp'],
  ['/admin/armazenamento', 'Armazenamento'],
  ['/admin/privacidade', 'Privacidade (LGPD)'],
  ['/admin/configuracoes', 'Configurações'],
  ['/admin/auditoria', 'Auditoria'],
]

function Badge({ count, className = '' }: { count: number; className?: string }) {
  if (count <= 0) return null
  return (
    <span className={`min-w-[1.15rem] rounded-full bg-danger px-1 text-center text-[0.68rem] font-bold leading-[1.15rem] text-white ${className}`}>
      {count > 99 ? '99+' : count}
    </span>
  )
}

/**
 * Layout da área autenticada (PRD 2.3; ADR-042). Computador: menu fixo à esquerda e conteúdo na
 * largura toda. Celular e app instalado: barra de abas embaixo. Mesmos dados nos dois.
 */
export function AppLayout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const qc = useQueryClient()
  const name = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? ''

  const roles = useQuery({
    queryKey: ['my-roles', user?.id],
    enabled: Boolean(user),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await getSupabase().from('user_roles').select('role')
      if (error) throw error
      return new Set(data.map((r) => r.role))
    },
  })
  const isAdmin = roles.data?.has('admin') ?? false
  const unread = useQuery({
    queryKey: ['notifications-unread', user?.id],
    enabled: Boolean(user),
    queryFn: fetchUnreadCount,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })
  const count = unread.data ?? 0

  // Aviso chegou no celular com o app aberto: atualiza o sino e a lista.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMsg = (e: MessageEvent) => {
      if ((e.data as { type?: string } | null)?.type === 'push-received') {
        void qc.invalidateQueries({ queryKey: ['notifications-unread'] })
        void qc.invalidateQueries({ queryKey: ['notifications'] })
      }
    }
    navigator.serviceWorker.addEventListener('message', onMsg)
    return () => navigator.serviceWorker.removeEventListener('message', onMsg)
  }, [qc])
  // Ao abrir o app, zera o número no ícone (os avisos continuam no sino).
  useEffect(() => {
    const nav = navigator as Navigator & { clearAppBadge?: () => Promise<void> }
    nav.clearAppBadge?.().catch(() => {})
  }, [])

  const logout = async () => {
    await signOut()
    navigate('/', { replace: true })
  }

  const isMotos = pathname === '/painel' || pathname.startsWith('/painel/motos') || pathname.startsWith('/painel/motos-anteriores')
  const items: { to: string; label: string; short: string; icon: string; active: boolean; badge?: number }[] = [
    { to: '/painel', label: 'Minhas motos', short: 'Motos', icon: I.moto, active: isMotos },
    { to: '/oficina', label: 'Minha oficina', short: 'Oficina', icon: I.shop, active: pathname.startsWith('/oficina') },
    { to: '/painel/notificacoes', label: 'Notificações', short: 'Avisos', icon: I.bell, active: pathname.startsWith('/painel/notificacoes'), badge: count },
    { to: '/painel/plano', label: 'Meu plano', short: 'Plano', icon: I.plan, active: pathname.startsWith('/painel/plano') },
    { to: '/painel/conta', label: 'Minha conta', short: 'Conta', icon: I.user, active: pathname.startsWith('/painel/conta') },
  ]
  const inAdmin = pathname.startsWith('/admin')

  const side = (it: (typeof items)[number]) => (
    <Link key={it.to} to={it.to} aria-current={it.active ? 'page' : undefined}
      className={`flex items-center gap-3 rounded-doc px-3 py-2.5 text-[0.95rem] font-semibold ${it.active ? 'bg-ink text-sheet' : 'text-graphite hover:bg-paper hover:text-ink'}`}>
      <Icon d={it.icon} />
      <span className="flex-1">{it.label}</span>
      {it.badge !== undefined && <Badge count={it.badge} />}
    </Link>
  )

  return (
    <div className="min-h-dvh lg:flex">
      <a href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-doc focus:bg-ink focus:px-4 focus:py-2 focus:text-sheet">
        Pular para o conteúdo
      </a>

      {/* Computador: menu lateral fixo */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-rule bg-sheet print:hidden lg:flex xl:w-72" aria-label="Menu">
        <div className="px-5 pb-4 pt-5"><Logo to="/painel" /></div>
        <nav aria-label="Áreas da conta" className="flex-1 overflow-y-auto px-3">
          <div className="space-y-1">
            {items.map((it) => (
              <div key={it.to}>
                {side(it)}
                {it.to === '/oficina' && it.active && <WorkshopSideNav />}
              </div>
            ))}
          </div>
          {isAdmin && (
            <div className="mt-6">
              <Link to="/admin" aria-current={inAdmin ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-doc px-3 py-2.5 text-[0.95rem] font-semibold ${inAdmin ? 'bg-ink text-sheet' : 'text-graphite hover:bg-paper hover:text-ink'}`}>
                <Icon d={I.admin} />
                <span>Administração</span>
              </Link>
              {inAdmin && (
                <div className="mt-1 space-y-0.5 border-l border-rule pl-3 ml-5">
                  {ADMIN_LINKS.map(([to, label]) => (
                    <NavLink key={to} to={to} end
                      className={({ isActive }) => `block rounded-doc px-3 py-1.5 text-sm ${isActive ? 'bg-paper font-semibold text-ink' : 'text-muted hover:text-ink'}`}>
                      {label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )}
        </nav>
        <div className="border-t border-rule px-5 py-4">
          <p className="truncate text-sm font-semibold text-ink" title={name}>{name}</p>
          <button type="button" onClick={logout} className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-ink">
            <Icon d={I.out} className="h-4 w-4" /> Sair
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Celular e tablet: topo compacto */}
        <header className="sticky top-0 z-30 border-b border-rule bg-sheet/95 backdrop-blur print:hidden lg:hidden"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="flex items-center justify-between gap-3 px-4 py-2.5">
            <Logo to="/painel" />
            <div className="flex items-center gap-1">
              {isAdmin && (
                <Link to="/admin" aria-label="Administração" className={`inline-flex h-10 items-center gap-1.5 rounded-doc border px-3 text-sm font-semibold ${inAdmin ? 'border-ink bg-ink text-sheet' : 'border-rule text-ink hover:bg-paper'}`}>
                  <Icon d={I.admin} className="h-4 w-4" />
                  Admin
                </Link>
              )}
              <button type="button" onClick={logout} className="rounded-doc px-3 py-2 text-sm font-semibold text-ink hover:bg-paper">Sair</button>
            </div>
          </div>
          {inAdmin && (
            <nav aria-label="Administração" className="flex gap-4 overflow-x-auto px-4 pb-2 text-sm">
              {ADMIN_LINKS.map(([to, label]) => (
                <NavLink key={to} to={to} end className={({ isActive }) => `whitespace-nowrap py-1 ${isActive ? 'border-b-2 border-ink font-semibold text-ink' : 'text-muted'}`}>{label}</NavLink>
              ))}
            </nav>
          )}
        </header>

        <main id="conteudo" className="flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10 2xl:px-14 print:p-0">
          <div className="mx-auto w-full max-w-[1680px] print:max-w-none">
            <InstallBanner />
            {user && <PendingAccessPopup userId={user.id} />}
            {user && <TermsGate userId={user.id} />}
            <Suspense fallback={<p className="text-muted" role="status">Carregando…</p>}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>

      {/* Celular: abas embaixo, ao alcance do polegar */}
      <nav aria-label="Navegação principal" className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-sheet/95 backdrop-blur print:hidden lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto grid max-w-xl grid-cols-5">
          {items.map((it) => (
            <Link key={it.to} to={it.to} aria-current={it.active ? 'page' : undefined}
              aria-label={it.badge ? `${it.label}: ${it.badge} não lida${it.badge > 1 ? 's' : ''}` : it.label}
              className={`relative flex flex-col items-center gap-0.5 px-1 pb-2 pt-2.5 text-[0.7rem] font-semibold ${it.active ? 'text-ink' : 'text-muted'}`}>
              {it.active && <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-ink" aria-hidden="true" />}
              <span className="relative">
                <Icon d={it.icon} className="h-6 w-6" />
                {it.badge !== undefined && <Badge count={it.badge} className="absolute -right-2.5 -top-1.5" />}
              </span>
              {it.short}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  )
}

export function PageHeader({ title, intro, actions }: { title: ReactNode; intro?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="heading text-3xl text-ink lg:text-4xl">{title}</h1>
        {intro && <div className="mt-1.5 max-w-3xl text-muted">{intro}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

