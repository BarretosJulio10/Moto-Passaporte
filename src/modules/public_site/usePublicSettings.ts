import { useQuery } from '@tanstack/react-query'
import { getSupabase } from '@/lib/supabase'
import { isSupabaseConfigured } from '@/core/config/env'
import { fetchPublicPlans, type PublicPlan } from '@/modules/plans/api'

export type PublicSettings = {
  freePlanMaxMotorcycles: number | null
  plans: PublicPlan[]
  billingEnabled: boolean
  supportEmail: string | null
  supportWhatsapp: string | null
  /** Dias de Premium grátis para contas novas (0 = sem bônus). */
  welcomePremiumDays: number
}

/** "3 meses", "1 mês" ou "45 dias". */
export function welcomeLabel(days: number): string {
  if (days > 0 && days % 30 === 0) return days === 30 ? '1 mês' : `${days / 30} meses`
  return `${days} dias`
}

const asText = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/** Lê parâmetros públicos (planos, canais de contato). Nunca fixar esses valores no código. */
export function usePublicSettings() {
  return useQuery({
    queryKey: ['public-settings'],
    enabled: isSupabaseConfigured,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PublicSettings> => {
      const [{ data, error }, plans] = await Promise.all([
        getSupabase().from('system_settings').select('key, value').eq('is_public', true),
        fetchPublicPlans().catch(() => [] as PublicPlan[]),
      ])
      if (error) throw error
      const map = new Map(data.map((row) => [row.key, row.value]))
      const free = plans.find((p) => p.kind === 'free')
      return {
        freePlanMaxMotorcycles: free ? free.max_motorcycles : null,
        plans,
        billingEnabled: map.get('billing_enabled') === true,
        supportEmail: asText(map.get('support_email')),
        supportWhatsapp: asText(map.get('support_whatsapp'))?.replace(/\D/g, '') || null,
        welcomePremiumDays: typeof map.get('welcome_premium_days') === 'number' ? Math.max(0, map.get('welcome_premium_days') as number) : 0,
      }
    },
  })
}
