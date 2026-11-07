import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'

/**
 * Protege rotas da área autenticada na interface.
 * A segurança real está no banco (RLS); isto apenas evita telas vazias.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-muted" role="status">
        Carregando…
      </div>
    )
  }
  if (!user) {
    return <Navigate to="/entrar" replace state={{ from: location.pathname }} />
  }
  return <>{children}</>
}
