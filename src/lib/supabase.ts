import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import { env, isSupabaseConfigured } from '@/core/config/env'

let client: SupabaseClient<Database> | null = null

/** Chave da sessão do App da Pista: separada do painel para um login não derrubar o outro (KI-048). */
export const PISTA_STORAGE_KEY = 'mp-pista-auth'

export function isPistaPath(pathname: string): boolean {
  return pathname === '/pista' || pathname.startsWith('/pista/')
}

/** Chave padrão do supabase-js (a que o painel sempre usou). */
export function defaultStorageKey(url: string): string {
  return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`
}

/**
 * Antes da separação, o mecânico ficava logado na chave do painel. Ao abrir a pista,
 * move essa sessão para a chave da pista, mas só se for uma conta da pista.
 */
export function migratePistaSession(storage: Storage, fromKey: string, toKey = PISTA_STORAGE_KEY) {
  try {
    if (storage.getItem(toKey)) return
    const raw = storage.getItem(fromKey)
    if (!raw) return
    const kind = (JSON.parse(raw) as { user?: { app_metadata?: { account_kind?: string } } })?.user?.app_metadata?.account_kind
    if (kind !== 'pista') return
    storage.setItem(toKey, raw)
    storage.removeItem(fromKey)
  } catch {
    // Armazenamento indisponível ou valor inválido: segue sem migrar.
  }
}

/** Cliente Supabase tipado. Lança erro claro se o ambiente não estiver configurado. */
export function getSupabase(): SupabaseClient<Database> {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase não configurado: defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.',
    )
  }
  if (!client) {
    const pista = typeof window !== 'undefined' && isPistaPath(window.location.pathname)
    if (pista) migratePistaSession(window.localStorage, defaultStorageKey(env.supabaseUrl!))
    client = createClient<Database>(env.supabaseUrl!, env.supabasePublishableKey!, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        ...(pista ? { storageKey: PISTA_STORAGE_KEY } : {}),
      },
    })
  }
  return client
}
