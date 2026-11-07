import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import { env, isSupabaseConfigured } from '@/core/config/env'

let client: SupabaseClient<Database> | null = null

/** Cliente Supabase tipado. Lança erro claro se o ambiente não estiver configurado. */
export function getSupabase(): SupabaseClient<Database> {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase não configurado: defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.',
    )
  }
  if (!client) {
    client = createClient<Database>(env.supabaseUrl!, env.supabasePublishableKey!, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return client
}
