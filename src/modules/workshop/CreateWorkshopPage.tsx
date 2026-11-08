import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { validate, type FieldErrors } from '@/core/auth/schemas'
import { translateDbError } from '@/core/shared/dbErrors'
import { workshopSchema } from './schemas'
import { createWorkshop } from './api'
import { WorkshopBasicFields } from './WorkshopForm'

export function CreateWorkshopPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    const form = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>
    const result = validate(workshopSchema, form)
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    setLoading(true)
    try {
      const orgId = await createWorkshop(result.data)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['my-workshops'] }),
        queryClient.invalidateQueries({ queryKey: ['my-roles'] }),
      ])
      navigate(`/oficina/${orgId}`, { replace: true, state: { created: true } })
    } catch (error) {
      const e = error as { code?: string; message?: string }
      if (e.code === '23505') setErrors({ publicSlug: 'Este endereço já está em uso. Escolha outro.' })
      else setFormError(translateDbError(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl">
      <h1 className="heading text-3xl text-ink">Cadastrar oficina</h1>
      <p className="mt-2 text-muted">
        Grátis, sem mensalidade e sem cobrança por moto atendida. Você será o responsável pela oficina e poderá adicionar funcionários depois.
      </p>
      <form onSubmit={onSubmit} noValidate className="mt-8 flex flex-col gap-6">
        {formError && <Notice tone="error">{formError}</Notice>}
        <WorkshopBasicFields errors={errors} origin={window.location.origin} />
        <div className="flex flex-wrap items-center gap-3 border-t border-rule pt-6">
          <Button type="submit" loading={loading}>{loading ? 'Cadastrando…' : 'Cadastrar oficina'}</Button>
          <Link to="/oficina" className="px-2 py-2 font-semibold text-ink underline-offset-4 hover:underline">Cancelar</Link>
        </div>
      </form>
    </div>
  )
}
