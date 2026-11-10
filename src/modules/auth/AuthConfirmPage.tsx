import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { EmailOtpType } from '@supabase/supabase-js'
import { AuthLayout } from './AuthLayout'
import { Notice } from '@/components/Notice'
import { getSupabase } from '@/lib/supabase'

/** Tipos de link enviados pelo e-mail de login (ADR-065). */
const TYPES: readonly EmailOtpType[] = ['signup', 'recovery', 'invite', 'magiclink', 'email_change', 'email']

/** Para onde cada link leva depois de confirmado. */
export function destinationFor(type: EmailOtpType): string {
  if (type === 'recovery') return '/redefinir-senha'
  if (type === 'email_change') return '/painel/conta?email=alterado'
  return '/painel?confirmado=1'
}

/**
 * Abre o link do e-mail (confirmação de cadastro, nova senha…). Confirma com o token_hash,
 * então funciona em qualquer aparelho, mesmo diferente do que pediu o e-mail.
 */
export function AuthConfirmPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [failed, setFailed] = useState(false)
  const started = useRef(false)
  const tokenHash = params.get('token_hash') ?? ''
  const rawType = params.get('type') ?? ''
  const type = (TYPES as readonly string[]).includes(rawType) ? (rawType as EmailOtpType) : null

  useEffect(() => {
    // O link só vale uma vez: não repetir a confirmação (StrictMode roda o efeito duas vezes).
    if (started.current) return
    started.current = true
    if (!tokenHash || !type) {
      setFailed(true)
      return
    }
    void getSupabase()
      .auth.verifyOtp({ token_hash: tokenHash, type })
      .then(({ error }) => {
        if (error) setFailed(true)
        else navigate(destinationFor(type), { replace: true })
      })
  }, [tokenHash, type, navigate])

  if (failed) {
    const isRecovery = type === 'recovery'
    return (
      <AuthLayout title="Link inválido ou expirado">
        <Notice tone="error">
          {isRecovery
            ? 'Este link de nova senha já foi usado ou expirou. Peça um novo.'
            : 'Este link já foi usado ou expirou. Se você já confirmou o e-mail, é só entrar.'}
        </Notice>
        <div className="mt-5 flex flex-col gap-3">
          <Link to={isRecovery ? '/recuperar-senha' : '/entrar'} className="font-semibold text-ink underline underline-offset-4">
            {isRecovery ? 'Pedir novo link' : 'Entrar'}
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Confirmando…">
      <p className="text-muted" role="status">Só um instante, estamos validando o link.</p>
    </AuthLayout>
  )
}
