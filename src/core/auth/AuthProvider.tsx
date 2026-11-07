import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { getSupabase } from '@/lib/supabase'
import { isSupabaseConfigured } from '@/core/config/env'

type AuthState = {
  session: Session | null
  user: User | null
  loading: boolean
  /** true quando a sessão veio de um link de recuperação de senha */
  recovering: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [recovering, setRecovering] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    const supabase = getSupabase()
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
    })

    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      if (event === 'SIGNED_OUT') setRecovering(false)
      setSession(next)
      setLoading(false)
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      recovering,
      signOut: async () => {
        if (!isSupabaseConfigured) return
        await getSupabase().auth.signOut()
      },
    }),
    [session, loading, recovering],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>.')
  return ctx
}
