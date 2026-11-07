import { useQuery } from '@tanstack/react-query'
import { getSupabase } from '@/lib/supabase'
import { isSupabaseConfigured } from '@/core/config/env'

export type PublicSettings = {
  freePlanMaxMotorcycles: number | null
}

/** Lê parâmetros públicos (ex.: limite do plano gratuito). Nunca fixar esses valores no código. */
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
      return { freePlanMaxMotorcycles: typeof free === 'number' ? free : null }
    },
  })
}
