import { useState, type FormEvent } from 'react'
import { Button } from '@/components/Button'
import { SelectField, TextAreaField, TextField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { translateDbError } from '@/core/shared/dbErrors'
import { formatPlate, isValidPlate } from '@/core/shared/format'
import { CUSTOMER_SOURCES, SOURCE_LABEL, type CustomerInput, type CustomerSource, type Vehicle, type VehicleInput } from './api'
import { onlyDigits } from '../shared/rpc'
import { CepField, useFipeSuggestions } from '@/components/Autofill'
import { formatAddressLine } from '@/lib/brasil'

type Errors = Partial<Record<string, string>>

export function validateCustomer(v: CustomerInput): Errors {
  const e: Errors = {}
  if (v.full_name.trim().length < 2) e.full_name = 'Informe o nome do cliente.'
  for (const k of ['phone', 'whatsapp'] as const) {
    const d = onlyDigits(v[k])
    if (d && (d.length < 10 || d.length > 13)) e[k] = 'Use DDD + número.'
  }
  if (v.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email.trim())) e.email = 'E-mail inválido.'
  if (v.cpf && onlyDigits(v.cpf).length !== 11) e.cpf = 'O CPF tem 11 números.'
  return e
}

export function validateVehicle(v: VehicleInput): Errors {
  const e: Errors = {}
  if (!v.brand.trim()) e.brand = 'Informe a marca.'
  if (!v.model.trim()) e.model = 'Informe o modelo.'
  if (v.plate && !isValidPlate(v.plate)) e.plate = 'Placa inválida (ex.: ABC1D23).'
  const year = Number(v.year)
  if (v.year && (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear() + 1)) e.year = 'Ano inválido.'
  if (v.displacement_cc && !/^\d{1,5}$/.test(v.displacement_cc)) e.displacement_cc = 'Só números.'
  if (v.km && !/^\d{1,7}$/.test(onlyDigits(v.km))) e.km = 'Só números.'
  return e
}

export function CustomerFields({ value, onChange, errors, compact = false }: {
  value: CustomerInput
  onChange: (v: CustomerInput) => void
  errors: Errors
  compact?: boolean
}) {
  const set = (k: keyof CustomerInput) => (ev: { target: { value: string } }) => onChange({ ...value, [k]: ev.target.value })
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField label="Nome completo" value={value.full_name} onChange={set('full_name')} error={errors.full_name} required autoComplete="off" className="sm:col-span-2" />
      <TextField label="WhatsApp" value={value.whatsapp ?? ''} onChange={set('whatsapp')} error={errors.whatsapp} inputMode="tel" placeholder="(17) 99999-1234" />
      <TextField label="Telefone" value={value.phone ?? ''} onChange={set('phone')} error={errors.phone} inputMode="tel" />
      {!compact && (
        <>
          <TextField label="E-mail" type="email" value={value.email ?? ''} onChange={set('email')} error={errors.email} />
          <TextField label="CPF (opcional)" value={value.cpf ?? ''} onChange={set('cpf')} error={errors.cpf} inputMode="numeric"
            hint="Fica visível só para a equipe da oficina." />
          <CepField onFound={(a) => onChange({ ...value, address: formatAddressLine(a) })} />
          <TextField label="Endereço (opcional)" value={value.address ?? ''} onChange={set('address')} autoComplete="street-address"
            hint="Pelo CEP, rua, bairro e cidade vêm prontos; acrescente o número." />
          <TextField label="Data de nascimento (opcional)" type="date" value={value.birth_date ?? ''} onChange={set('birth_date')} />
          <TextField label="Primeiro atendimento" type="date" value={value.first_visit_at ?? ''} onChange={set('first_visit_at')} />
          <SelectField label="Como chegou à oficina" value={value.source ?? 'balcao'} options={CUSTOMER_SOURCES}
            optionLabel={(o) => SOURCE_LABEL[o as CustomerSource]} onChange={(e) => onChange({ ...value, source: e.target.value as CustomerSource })} />
          <TextAreaField label="Observações internas" value={value.notes ?? ''} onChange={set('notes')} className="sm:col-span-2"
            hint="Só a equipe vê. O cliente nunca vê estas anotações." />
        </>
      )}
    </div>
  )
}

export function VehicleFields({ value, onChange, errors }: { value: VehicleInput; onChange: (v: VehicleInput) => void; errors: Errors }) {
  const set = (k: keyof VehicleInput) => (ev: { target: { value: string } }) => onChange({ ...value, [k]: ev.target.value })
  const fipe = useFipeSuggestions(value.brand)
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {fipe.lists}
      <TextField label="Marca" value={value.brand} onChange={set('brand')} error={errors.brand} required placeholder="Honda" list={fipe.brandListId} autoComplete="off" />
      <TextField label="Modelo" value={value.model} onChange={set('model')} error={errors.model} required placeholder="CG 160" list={fipe.modelListId} autoComplete="off"
        hint={errors.model ? undefined : fipe.hasModels ? 'Escolha da lista FIPE ou digite.' : undefined} />
      <TextField label="Versão" value={value.version ?? ''} onChange={set('version')} placeholder="Titan" />
      <TextField label="Ano" value={value.year ?? ''} onChange={set('year')} error={errors.year} inputMode="numeric" />
      <TextField label="Placa" value={value.plate ?? ''} onChange={set('plate')} error={errors.plate} placeholder="ABC1D23"
        onBlur={() => value.plate && onChange({ ...value, plate: formatPlate(value.plate) })} />
      <TextField label="Cilindrada (cc)" value={value.displacement_cc ?? ''} onChange={set('displacement_cc')} error={errors.displacement_cc} inputMode="numeric" />
      <TextField label="Quilometragem" value={value.km ?? ''} onChange={set('km')} error={errors.km} inputMode="numeric" />
      <TextField label="Cor" value={value.color ?? ''} onChange={set('color')} />
      <TextAreaField label="Observações" value={value.notes ?? ''} onChange={set('notes')} className="sm:col-span-2 lg:col-span-4" rows={2} />
    </div>
  )
}

export const emptyVehicle = (): VehicleInput => ({ brand: '', model: '', version: '', year: '', displacement_cc: '', plate: '', km: '', color: '', notes: '' })

export function vehicleToInput(v: Vehicle): VehicleInput {
  return {
    brand: v.brand, model: v.model, version: v.version ?? '', year: v.year?.toString() ?? '',
    displacement_cc: v.displacement_cc?.toString() ?? '', plate: v.plate ? formatPlate(v.plate) : '', km: v.km?.toString() ?? '',
    color: v.color ?? '', notes: v.notes ?? '', status: v.status,
  }
}

/** Formulário de moto com salvar/cancelar (usado na página do cliente). */
export function VehicleForm({ initial, onSave, onCancel }: {
  initial: VehicleInput
  onSave: (v: VehicleInput) => Promise<unknown>
  onCancel: () => void
}) {
  const [value, setValue] = useState(initial)
  const [errors, setErrors] = useState<Errors>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    const errs = validateVehicle(value)
    setErrors(errs)
    if (Object.keys(errs).length) return
    setSaving(true)
    setError(null)
    try {
      await onSave({ ...value, km: onlyDigits(value.km) })
    } catch (err) {
      setError(translateDbError(err as { code?: string; message?: string }))
    } finally {
      setSaving(false)
    }
  }
  return (
    <form onSubmit={submit} className="rounded-doc border border-rule bg-paper/60 p-4" noValidate>
      <VehicleFields value={value} onChange={setValue} errors={errors} />
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="submit" size="sm" loading={saving}>Salvar moto</Button>
        <Button type="button" size="sm" variant="secondary" onClick={onCancel}>Cancelar</Button>
      </div>
    </form>
  )
}
