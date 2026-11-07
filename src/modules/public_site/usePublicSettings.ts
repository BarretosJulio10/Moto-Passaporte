import { useQuery } from '@tanstack/react-query'
import { getSupabase } from '@/lib/supabase'
import { isSupabaseConfigured } from '@/core/config/env'

export type PublicSettings = {
  freePlanMaxMotorcycles: number | null
  supportEmail: string | null
  supportWhatsapp: string | null
}

const asText = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/** Lê parâmetros públicos (limite do plano, canais de contato). Nunca fixar esses valores no código. */
export function usePublicSettings() {
  return useQuery({
    queryKey: ['public-settings'],
    enabled: isSupabaseConfigured,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PublicSettings> => {
      const { data, error } = await getSupabase()
        .from('system_settings')
        .select('key, value')
        .eq('is_public', true)
      if (error) throw error
      const map = new Map(data.map((row) => [row.key, row.value]))
      const free = map.get('free_plan_max_motorcycles')
      return {
        freePlanMaxMotorcycles: typeof free === 'number' ? free : null,
        supportEmail: asText(map.get('support_email')),
        supportWhatsapp: asText(map.get('support_whatsapp'))?.replace(/\D/g, '') || null,
      }
    },
  })
}
