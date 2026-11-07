import { Suspense } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/Button'
import { useAuth } from '@/core/auth/AuthProvider'
import { getSupabase } from '@/lib/supabase'
import { fetchUnreadCount } from '@/modules/notifications/api'

/**
 * Layout da área autenticada. A mesma conta pode alternar entre contextos
 * (proprietário, oficina, administração) sem misturar dados — PRD 2.3.
 */
export function AppLayout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
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

  const tab = ({ isActive }: { isActive: boolean }) =>
    `whitespace-nowrap border-b-2 px-1 pb-2.5 pt-1 text-sm font-semibold ${
      isActive ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'
    }`

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-doc focus:bg-ink focus:px-4 focus:py-2 focus:text-sheet"
      >
        Pular para o conteúdo
      </a>
      <header className="border-b border-rule bg-sheet print:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 pt-3 sm:px-5">
          <Logo to="/painel" />
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted sm:inline">{name}</span>
            <Link
              to="/painel/notificacoes"
              className="relative inline-flex h-9 w-9 items-center justify-center rounded-doc text-ink hover:bg-paper focus-visible:bg-paper"
              aria-label={count > 0 ? `Notificações: ${count} não lida${count > 1 ? 's' : ''}` : 'Notificações'}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
              {count > 0 && (
                <span className="absolute -right-0.5 -top-0.5 min-w-[1.15rem] rounded-full bg-danger px-1 text-center text-[0.68rem] font-bold leading-[1.15rem] text-white">
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </Link>
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                await signOut()
                navigate('/', { replace: true })
              }}
            >
              Sair
            </Button>
          </div>
        </div>
        <nav aria-label="Áreas da conta" className="mx-auto mt-3 flex max-w-5xl gap-6 overflow-x-auto px-4 sm:px-5">
          <NavLink to="/painel" className={tab}>Minhas motos</NavLink>
          <NavLink to="/oficina" className={tab}>Minha oficina</NavLink>
          {isAdmin && <NavLink to="/admin" className={tab}>Administração</NavLink>}
        </nav>
      </header>
      <main id="conteudo" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-5 print:max-w-none print:p-0">
        <Suspense fallback={<p className="text-muted" role="status">Carregando…</p>}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}
