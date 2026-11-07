import { Outlet, useNavigate } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/Button'
import { useAuth } from '@/core/auth/AuthProvider'

export function OwnerLayout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const name = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? ''

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-rule bg-sheet">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-3">
          <Logo to="/painel" />
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted sm:inline">{name}</span>
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
      </header>
      <main id="conteudo" className="mx-auto w-full max-w-5xl flex-1 px-5 py-10">
        <Outlet />
      </main>
    </div>
  )
}
