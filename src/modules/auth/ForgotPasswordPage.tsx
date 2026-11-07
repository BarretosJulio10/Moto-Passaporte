import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AuthLayout } from './AuthLayout'
import { TextField } from '@/components/Field'
import { Button } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { forgotPasswordSchema, validate, type FieldErrors } from '@/core/auth/schemas'
import { translateAuthError } from '@/core/auth/authErrors'
import { getSupabase } from '@/lib/supabase'
import { isSupabaseConfigured } from '@/core/config/env'

export function ForgotPasswordPage() {
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    const form = new FormData(event.currentTarget)
    const result = validate(forgotPasswordSchema, { email: form.get('email') })
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    setLoading(true)
    const { error } = await getSupabase().auth.resetPasswordForEmail(result.data.email, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    })
    setLoading(false)
    // Só erros de limite/conexão são mostrados: não revelamos se o e-mail tem conta.
    if (error && (error.status === 429 || /fetch|network/i.test(error.message))) {
      setFormError(translateAuthError(error))
      return
    }
    setSent(true)
  }

  return (
    <AuthLayout
      title="Recuperar senha"
      intro="Informe o e-mail da sua conta. Enviaremos um link para criar uma nova senha."
      footer={<Link to="/entrar" className="font-semibold text-ink underline underline-offset-4">Voltar para entrar</Link>}
    >
      {sent ? (
        <Notice tone="success" title="Verifique seu e-mail">
          Se houver uma conta com esse e-mail, você vai receber o link em alguns minutos. Confira também a caixa de spam.
        </Notice>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
          {formError && <Notice tone="error">{formError}</Notice>}
          <TextField label="E-mail" name="email" type="email" autoComplete="email" inputMode="email" required error={errors.email} />
          <Button type="submit" loading={loading} disabled={!isSupabaseConfigured} className="w-full">
            {loading ? 'Enviando…' : 'Enviar link'}
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
