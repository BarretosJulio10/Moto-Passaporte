import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { TextField, TextAreaField, CheckboxField } from '@/components/Field'
import { validate, type FieldErrors } from '@/core/auth/schemas'
import { translateDbError } from '@/core/shared/dbErrors'
import { SPECIALTIES, workshopProfileSchema } from './schemas'
import { fetchWorkshop, updateWorkshop } from './api'
import { WorkshopBasicFields } from './WorkshopForm'

export function WorkshopProfilePage() {
  const { orgId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const shop = useQuery({ queryKey: ['workshop', orgId], queryFn: () => fetchWorkshop(orgId), enabled: Boolean(orgId) })

  if (shop.isLoading) return <p className="text-muted" role="status">Carregando…</p>
  if (shop.isError || !shop.data) {
    return <Notice tone="error">Não foi possível carregar o perfil desta oficina.</Notice>
  }
  const w = shop.data

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    const fd = new FormData(event.currentTarget)
    const raw = {
      ...(Object.fromEntries(fd) as Record<string, string>),
      specialties: fd.getAll('specialties'),
      isPublic: fd.get('isPublic') === 'on',
    }
    const result = validate(workshopProfileSchema, raw)
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    setLoading(true)
    try {
      await updateWorkshop(orgId, result.data)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workshop', orgId] }),
        queryClient.invalidateQueries({ queryKey: ['my-workshops'] }),
      ])
      navigate(`/oficina/${orgId}`)
    } catch (error) {
      const e = error as { code?: string; message?: string }
      if (e.code === '23505') setErrors({ publicSlug: 'Este endereço já está em uso. Escolha outro.' })
      else setFormError(translateDbError(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <Link to={`/oficina/${orgId}`} className="text-sm text-ink underline underline-offset-4">Voltar ao painel da oficina</Link>
      <h1 className="heading mt-3 text-3xl text-ink">Perfil da oficina</h1>
      <form onSubmit={onSubmit} noValidate className="mt-8 flex flex-col gap-6">
        {formError && <Notice tone="error">{formError}</Notice>}
        <WorkshopBasicFields
          errors={errors}
          origin={window.location.origin}
          defaults={{
            businessName: w.business_name,
            publicSlug: w.public_slug,
            city: w.city ?? '',
            state: w.state ?? '',
            phone: w.phone ?? '',
            whatsapp: w.whatsapp ?? '',
            email: w.email ?? '',
            cnpj: w.cnpj ?? '',
            legalName: w.legal_name ?? '',
          }}
        >
          <TextField label="Responsável (opcional)" name="responsibleName" defaultValue={w.responsible_name ?? ''} error={errors.responsibleName} />
          <TextField label="Endereço (opcional)" name="address" defaultValue={w.address ?? ''} autoComplete="street-address" error={errors.address} />
          <TextField
            label="Horário de funcionamento (opcional)"
            name="openingHours"
            defaultValue={w.opening_hours ?? ''}
            placeholder="Ex.: seg a sex, 8h às 18h; sáb, 8h às 12h"
            className="sm:col-span-2"
            error={errors.openingHours}
          />
          <TextAreaField
            label="Sobre a oficina (opcional)"
            name="description"
            defaultValue={w.description ?? ''}
            maxLength={2000}
            rows={4}
            className="sm:col-span-2"
            error={errors.description}
          />
        </WorkshopBasicFields>

        <fieldset className="border-t border-rule pt-5">
          <legend className="pr-3 font-semibold text-ink">Especialidades</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {SPECIALTIES.map((s) => (
              <CheckboxField key={s} name="specialties" value={s} defaultChecked={w.specialties.includes(s)} label={s} />
            ))}
          </div>
        </fieldset>

        <div className="border-t border-rule pt-5">
          <CheckboxField
            name="isPublic"
            defaultChecked={w.is_public}
            label="Mostrar o perfil da oficina na rede Moto Passaporte. CNPJ e razão social nunca aparecem no perfil público."
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-rule pt-6">
          <Button type="submit" loading={loading}>{loading ? 'Salvando…' : 'Salvar perfil'}</Button>
          <Link to={`/oficina/${orgId}`} className="px-2 py-2 font-semibold text-ink underline-offset-4 hover:underline">Cancelar</Link>
        </div>
      </form>
    </div>
  )
}
