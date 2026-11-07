import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from './AuthLayout'
import { TextField } from '@/components/Field'
import { Button } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { resetPasswordSchema, validate, type FieldErrors } from '@/core/auth/schemas'
import { translateAuthError } from '@/core/auth/authErrors'
import { getSupabase } from '@/lib/supabase'
import { useAuth } from '@/core/auth/AuthProvider'

export function ResetPasswordPage() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    const form = new FormData(event.currentTarget)
    const result = validate(resetPasswordSchema, {
      password: form.get('password'),
      confirmPassword: form.get('confirmPassword'),
    })
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    setLoading(true)
    const supabase = getSupabase()
    const { error } = await supabase.auth.updateUser({ password: result.data.password })
    if (error) {
      setLoading(false)
      setFormError(translateAuthError(error))
      return
    }
    await supabase.auth.signOut()
    navigate('/entrar?senha=alterada', { replace: true })
  }

  if (authLoading) {
    return (
      <AuthLayout title="Nova senha">
        <p className="text-muted" role="status">Validando o link…</p>
      </AuthLayout>
    )
  }

  if (!user) {
    return (
      <AuthLayout title="Link inválido ou expirado">
        <Notice tone="error">Este link de recuperação não é mais válido. Peça um novo link.</Notice>
        <Link to="/recuperar-senha" className="mt-5 inline-block font-semibold text-ink underline underline-offset-4">
          Pedir novo link
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Nova senha" intro="Escolha uma nova senha para a sua conta.">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        {formError && <Notice tone="error">{formError}</Notice>}
        <TextField
          label="Nova senha"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          hint="Pelo menos 8 caracteres, com letras e números."
          error={errors.password}
        />
        <TextField label="Confirme a nova senha" name="confirmPassword" type="password" autoComplete="new-password" required error={errors.confirmPassword} />
        <Button type="submit" loading={loading} className="w-full">
          {loading ? 'Salvando…' : 'Salvar nova senha'}
        </Button>
      </form>
    </AuthLayout>
  )
}
