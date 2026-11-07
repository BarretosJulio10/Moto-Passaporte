import { Link, Outlet } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { ButtonLink } from '@/components/Button'
import { useAuth } from '@/core/auth/AuthProvider'

export function PublicLayout() {
  const { user } = useAuth()
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-doc focus:bg-ink focus:px-4 focus:py-2 focus:text-sheet"
      >
        Pular para o conteúdo
      </a>
      <header className="border-b border-rule bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
          <Logo />
          <nav aria-label="Principal" className="hidden items-center gap-6 text-sm font-medium text-ink md:flex">
            <a href="/#como-funciona" className="hover:underline underline-offset-4">Como funciona</a>
            <a href="/#oficinas" className="hover:underline underline-offset-4">Para oficinas</a>
            <a href="/#planos" className="hover:underline underline-offset-4">Planos</a>
          </nav>
          <div className="flex items-center gap-1 sm:gap-2">
            {user ? (
              <ButtonLink to="/painel" size="sm">Meu painel</ButtonLink>
            ) : (
              <>
                <ButtonLink to="/entrar" variant="quiet">Entrar</ButtonLink>
                <ButtonLink to="/criar-conta" size="sm">Criar conta</ButtonLink>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="conteudo" className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-sm text-muted md:flex-row md:items-center md:justify-between">
          <p>Moto Passaporte. A identidade digital e o histórico de vida da sua motocicleta.</p>
          <nav aria-label="Documentos" className="flex gap-5">
            <Link to="/termos" className="hover:text-ink hover:underline underline-offset-4">Termos de uso</Link>
            <Link to="/privacidade" className="hover:text-ink hover:underline underline-offset-4">Política de privacidade</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
