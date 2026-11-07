import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/core/auth/AuthProvider'
import { fetchMyPlan } from './api'

/** Plano vigente do usuário (limites e recursos). Mesma chave usada em "Meu plano". */
export function useMyPlan() {
  const { user } = useAuth()
  return useQuery({ queryKey: ['my-plan', user?.id], enabled: Boolean(user), queryFn: fetchMyPlan })
}
