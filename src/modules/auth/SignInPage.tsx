import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthLayout } from './AuthLayout'
import { TextField } from '@/components/Field'
import { Button } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { signInSchema, validate, type FieldErrors } from '@/core/auth/schemas'
import { translateAuthError } from '@/core/auth/authErrors'
import { getSupabase } from '@/lib/supabase'
import { isSupabaseConfigured } from '@/core/config/env'
import { useAuth } from '@/core/auth/AuthProvider'

export function SignInPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [unconfirmed, setUnconfirmed] = useState<string | null>(null)
  const [resend, setResend] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  const from = (location.state as { from?: string } | null)?.from ?? '/painel'
  if (user) return <Navigate to={from} replace />

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    setUnconfirmed(null)
    setResend('idle')
    const form = new FormData(event.currentTarget)
    const result = validate(signInSchema, { email: form.get('email'), password: form.get('password') })
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    setLoading(true)
    const { error } = await getSupabase().auth.signInWithPassword(result.data)
    setLoading(false)
    if (error) {
      setFormError(translateAuthError(error))
      if ((error as { code?: string }).code === 'email_not_confirmed' || /email not confirmed/i.test(error.message)) {
        setUnconfirmed(result.data.email)
      }
      return
    }
    navigate(from, { replace: true })
  }

  async function resendConfirmation() {
    if (!unconfirmed) return
    setResend('sending')
    const { error } = await getSupabase().auth.resend({
      type: 'signup',
      email: unconfirmed,
      options: { emailRedirectTo: `${window.location.origin}/entrar?confirmado=1` },
    })
    setResend(error ? 'error' : 'sent')
  }

  return (
    <AuthLayout
      title="Entrar"
      footer={
        <>
          Ainda não tem conta? <Link to="/criar-conta" className="font-semibold text-ink underline underline-offset-4">Criar conta</Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        {params.get('confirmado') === '1' && (
          <Notice tone="success">E-mail confirmado. Entre com seu e-mail e senha.</Notice>
        )}
        {params.get('senha') === 'alterada' && (
          <Notice tone="success">Senha alterada. Entre com a nova senha.</Notice>
        )}
        {formError && <Notice tone="error">{formError}</Notice>}
        {unconfirmed && resend !== 'sent' && (
          <Button type="button" variant="secondary" loading={resend === 'sending'} onClick={() => void resendConfirmation()}>
            Reenviar e-mail de confirmação
          </Button>
        )}
        {resend === 'sent' && (
          <Notice tone="success">Enviamos um novo e-mail de confirmação para {unconfirmed}. Veja também a pasta de spam.</Notice>
        )}
        {resend === 'error' && (
          <Notice tone="error">Não foi possível reenviar agora. Aguarde um minuto e tente de novo.</Notice>
        )}
        <TextField label="E-mail" name="email" type="email" autoComplete="email" inputMode="email" required error={errors.email} />
        <TextField label="Senha" name="password" type="password" autoComplete="current-password" required error={errors.password} />
        <div className="-mt-2 text-right text-sm">
          <Link to="/recuperar-senha" className="text-ink underline underline-offset-4">Esqueci minha senha</Link>
        </div>
        <Button type="submit" loading={loading} disabled={!isSupabaseConfigured} className="w-full">
          {loading ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
    </AuthLayout>
  )
}
