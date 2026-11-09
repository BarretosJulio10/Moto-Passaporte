import { storeSafeText } from '@/core/pwa/storeApp'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { TextField, TextAreaField } from '@/components/Field'
import { Button } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { validate, type FieldErrors } from '@/core/auth/schemas'
import { translateDbError } from '@/core/shared/dbErrors'
import { todayISO } from '@/core/shared/format'
import { registerMotorcycleSchema } from '@/modules/motorcycles/schemas'
import { registerMotorcycle } from '@/modules/motorcycles/api'
import { OIL_SUGGESTED_KM, setCare } from '@/modules/motorcycles/careApi'
import { useFipeSuggestions } from '@/components/Autofill'
import { PremiumLink } from '@/modules/plans/PremiumLink'
import { notifyMotorcycleLimit } from '@/modules/notifications/api'

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="border-t border-rule pt-6">
      <legend className="heading -mt-0.5 pr-3 text-lg text-ink">{title}</legend>
      <div className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </fieldset>
  )
}

export function RegisterMotorcyclePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [claimed, setClaimed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [brand, setBrand] = useState('')
  const fipe = useFipeSuggestions(brand)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    const form = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>
    const result = validate(registerMotorcycleSchema, form)
    if (!result.ok) {
      setErrors(result.errors)
      const first = Object.keys(result.errors)[0]
      if (first) (event.currentTarget.elements.namedItem(first) as HTMLElement | null)?.focus()
      return
    }
    setErrors({})
    setLoading(true)
    try {
      const outcome = await registerMotorcycle(result.data)
      await queryClient.invalidateQueries({ queryKey: ['my-motorcycles'] })
      if (outcome.status === 'created') {
        // Troca de óleo: o aviso sai 500 km antes (ADR-041). Falha aqui não impede o cadastro.
        await setCare(outcome.motorcycle_id, 'oil_change', result.data.oilIntervalKm, true, result.data.lastOilKm ?? null).catch(() => undefined)
        navigate(`/painel/motos/${outcome.motorcycle_id}`, { replace: true, state: { created: true } })
      } else {
        setClaimed(true)
      }
    } catch (error) {
      const message = translateDbError(error as { code?: string; message?: string })
      setFormError(message)
      // Limite do plano: avisa por e-mail/WhatsApp com o caminho para incluir mais motos (ADR-064).
      if (/limite/i.test((error as { message?: string })?.message ?? message)) void notifyMotorcycleLimit().catch(() => undefined)
    } finally {
      setLoading(false)
    }
  }

  if (claimed) {
    return (
      <div className="max-w-2xl">
        <h1 className="heading text-3xl text-ink">Placa já cadastrada</h1>
        <div className="mt-6">
          <Notice tone="info" title="Abrimos uma solicitação de verificação">
            Esta placa já possui um passaporte no Moto Passaporte. Nossa equipe vai analisar o caso; acompanhe e explique a situação pelo painel, em “Pedidos de verificação de placa”.
          </Notice>
        </div>
        <p className="mt-4 text-muted">
          Se você comprou a moto recentemente, o caminho mais rápido é pedir ao dono anterior que transfira o passaporte para a sua conta.
        </p>
        <Link to="/painel" className="mt-6 inline-block font-semibold text-ink underline underline-offset-4">Voltar ao painel</Link>
      </div>
    )
  }

  return (
    <div className="max-w-6xl">
      <Link to="/painel" className="text-sm text-ink underline underline-offset-4">Voltar ao painel</Link>
      <h1 className="heading mt-3 text-3xl text-ink">Cadastrar moto</h1>
      <p className="mt-2 max-w-xl text-muted">
        Com estes dados criamos o passaporte da moto. Ela ganha um código próprio, que não muda nem quando a placa muda.
      </p>

      <form onSubmit={onSubmit} noValidate className="mt-8 flex flex-col gap-8">
        {formError && <Notice tone="error">{storeSafeText(formError)}{/limite/i.test(formError) && (
          <> <PremiumLink className="font-semibold underline underline-offset-4">O Premium inclui 2 motos e cada moto a mais custa a partir de R$ 3,90 por mês.</PremiumLink></>
        )}</Notice>}

        <Group title="Identificação">
          {fipe.lists}
          <TextField label="Marca" name="brand" required autoComplete="off" placeholder="Ex.: Honda" error={errors.brand} list={fipe.brandListId}
            onChange={(e) => setBrand(e.target.value)} hint={errors.brand ? undefined : 'Comece a digitar e escolha na lista (Tabela FIPE).'} />
          <TextField label="Modelo" name="model" required autoComplete="off" placeholder="Ex.: CB 500F" error={errors.model} list={fipe.modelListId}
            hint={errors.model ? undefined : fipe.hasModels ? 'Escolha o modelo da lista ou digite.' : undefined} />
          <TextField label="Versão (opcional)" name="version" autoComplete="off" placeholder="Ex.: ABS" error={errors.version} />
          <TextField label="Cor (opcional)" name="color" autoComplete="off" error={errors.color} />
          <TextField label="Ano de fabricação" name="manufacturingYear" required inputMode="numeric" maxLength={4} placeholder="Ex.: 2022" error={errors.manufacturingYear} />
          <TextField label="Ano do modelo (opcional)" name="modelYear" inputMode="numeric" maxLength={4} placeholder="Ex.: 2023" error={errors.modelYear} />
          <TextField label="Cilindrada em cm³ (opcional)" name="displacementCc" inputMode="numeric" maxLength={5} placeholder="Ex.: 471" error={errors.displacementCc} />
        </Group>

        <Group title="Placa e chassi">
          <TextField
            label="Placa"
            name="plate"
            required
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="Ex.: ABC1D23"
            hint="Não aparece na página pública do passaporte."
            error={errors.plate}
          />
          <TextField
            label="Chassi (opcional)"
            name="chassis"
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={30}
            hint="Visível só para você."
            error={errors.chassis}
          />
        </Group>

        <Group title="Situação atual">
          <TextField label="Quilometragem atual" name="currentMileage" required inputMode="numeric" placeholder="Ex.: 12400" error={errors.currentMileage} />
          <TextField label="Data em que você comprou (opcional)" name="acquisitionDate" type="date" max={todayISO()} error={errors.acquisitionDate} />
          <TextAreaField
            label="Observações (opcional)"
            name="initialNotes"
            className="sm:col-span-2 xl:col-span-3"
            maxLength={2000}
            placeholder="Ex.: moto de segundo dono, revisões feitas na concessionária até 2023."
            error={errors.initialNotes}
          />
        </Group>

        <Group title="Troca de óleo">
          <TextField
            label="Trocar o óleo a cada (km)"
            name="oilIntervalKm"
            required
            inputMode="numeric"
            defaultValue={String(OIL_SUGGESTED_KM)}
            hint="Veja no manual da moto. Avisamos no celular 500 km antes."
            error={errors.oilIntervalKm}
          />
          <TextField
            label="Km da última troca (opcional)"
            name="lastOilKm"
            inputMode="numeric"
            placeholder="Ex.: 11800"
            hint="Se não souber, contamos a partir do km atual."
            error={errors.lastOilKm}
          />
        </Group>

        <div className="flex flex-wrap items-center gap-3 border-t border-rule pt-6">
          <Button type="submit" loading={loading}>{loading ? 'Criando passaporte…' : 'Criar passaporte'}</Button>
          <Link to="/painel" className="px-2 py-2 font-semibold text-ink underline-offset-4 hover:underline">Cancelar</Link>
        </div>
      </form>
    </div>
  )
}
