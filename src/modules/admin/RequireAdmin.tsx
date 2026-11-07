import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getSupabase } from '@/lib/supabase'
import { useAuth } from '@/core/auth/AuthProvider'

/**
 * Esconde a área administrativa de quem não é admin.
 * A proteção real está no banco: sem o papel admin, as políticas RLS não liberam os dados.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const check = useQuery({
    queryKey: ['is-admin', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc('is_admin')
      if (error) throw error
      return data === true
    },
  })

  if (check.isLoading) return <p className="text-muted" role="status">Verificando acesso…</p>
  if (!check.data) {
    return (
      <div>
        <h1 className="heading text-3xl text-ink">Acesso restrito</h1>
        <p className="mt-2 text-muted">Esta área é exclusiva da equipe Moto Passaporte.</p>
        <Link to="/painel" className="mt-5 inline-block font-semibold text-ink underline underline-offset-4">Voltar ao painel</Link>
      </div>
    )
  }
  return <>{children}</>
}
