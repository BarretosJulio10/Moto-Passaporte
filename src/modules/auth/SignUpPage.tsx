import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AuthLayout } from './AuthLayout'
import { TextField, CheckboxField } from '@/components/Field'
import { Button } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { signUpSchema, validate, type FieldErrors } from '@/core/auth/schemas'
import { translateAuthError } from '@/core/auth/authErrors'
import { getSupabase } from '@/lib/supabase'
import { isSupabaseConfigured, LEGAL_VERSIONS } from '@/core/config/env'

export function SignUpPage() {
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    const form = new FormData(event.currentTarget)
    const result = validate(signUpSchema, {
      fullName: form.get('fullName'),
      email: form.get('email'),
      password: form.get('password'),
      confirmPassword: form.get('confirmPassword'),
      acceptTerms: form.get('acceptTerms') === 'on',
    })
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    setLoading(true)
    const { fullName, email, password } = result.data
    // Metadados lidos pelo trigger handle_new_user (docs/API_DOCUMENTATION.md).
    const { error } = await getSupabase().auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/entrar?confirmado=1`,
        data: {
          full_name: fullName,
          terms_accepted: true,
          terms_version: LEGAL_VERSIONS.terms,
          privacy_version: LEGAL_VERSIONS.privacy,
        },
      },
    })
    setLoading(false)
    if (error) {
      setFormError(translateAuthError(error))
      return
    }
    setSentTo(email)
  }

  if (sentTo) {
    return (
      <AuthLayout title="Confirme seu e-mail">
        <Notice tone="success" title="Conta criada">
          Enviamos um link de confirmação para <strong>{sentTo}</strong>. Abra o e-mail e clique no link para ativar sua conta.
        </Notice>
        <p className="mt-4 text-sm text-muted">
          Não chegou? Confira a caixa de spam ou promoções. O link pode levar alguns minutos.
        </p>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Criar conta"
      intro="Crie o passaporte da sua moto. É grátis."
      footer={
        <>
          Já tem conta? <Link to="/entrar" className="font-semibold text-ink underline underline-offset-4">Entrar</Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        {formError && <Notice tone="error">{formError}</Notice>}
        <TextField label="Nome completo" name="fullName" autoComplete="name" required error={errors.fullName} />
        <TextField label="E-mail" name="email" type="email" autoComplete="email" inputMode="email" required error={errors.email} />
        <TextField
          label="Senha"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          hint="Pelo menos 8 caracteres, com letras e números."
          error={errors.password}
        />
        <TextField label="Confirme a senha" name="confirmPassword" type="password" autoComplete="new-password" required error={errors.confirmPassword} />
        <CheckboxField
          name="acceptTerms"
          error={errors.acceptTerms}
          label={
            <>
              Li e aceito os{' '}
              <Link to="/termos" target="_blank" className="font-semibold text-ink underline underline-offset-4">termos de uso</Link>{' '}
              e a{' '}
              <Link to="/privacidade" target="_blank" className="font-semibold text-ink underline underline-offset-4">política de privacidade</Link>.
            </>
          }
        />
        <Button type="submit" loading={loading} disabled={!isSupabaseConfigured} className="w-full">
          {loading ? 'Criando conta…' : 'Criar conta'}
        </Button>
      </form>
    </AuthLayout>
  )
}
