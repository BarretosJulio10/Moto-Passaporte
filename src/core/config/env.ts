// Configuração por ambiente. Apenas valores PÚBLICOS chegam ao frontend.
// Nunca adicionar aqui a service role do Supabase ou tokens do Mercado Pago.

export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabasePublishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined,
}

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabasePublishableKey)

// Versões dos documentos legais aceitos no cadastro (registradas no perfil).
export const LEGAL_VERSIONS = {
  terms: '0.3',
  privacy: '0.2',
} as const
