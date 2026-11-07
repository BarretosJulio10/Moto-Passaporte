import { getSupabase } from '@/lib/supabase'

/** Registra a geração (benefício Premium, conferido no servidor) e devolve a referência impressa. */
export async function registerReport(motorcycleId: string): Promise<{ reference: string; generated_at: string }> {
  const { data, error } = await getSupabase().rpc('register_motorcycle_report', { p_motorcycle_id: motorcycleId })
  if (error) throw error
  return data as unknown as { reference: string; generated_at: string }
}
