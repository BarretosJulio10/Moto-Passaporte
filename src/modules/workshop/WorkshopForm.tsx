import { useState, type ReactNode } from 'react'
import { TextField, SelectField } from '@/components/Field'
import { UFS, slugify } from './schemas'
import type { FieldErrors } from '@/core/auth/schemas'

type Defaults = Partial<{
  businessName: string
  publicSlug: string
  city: string
  state: string
  phone: string
  whatsapp: string
  email: string
  cnpj: string
  legalName: string
}>

/** Campos básicos da oficina, usados no cadastro e na edição do perfil. */
export function WorkshopBasicFields({ errors, defaults = {}, origin, children }: { errors: FieldErrors; defaults?: Defaults; origin: string; children?: ReactNode }) {
  const [slug, setSlug] = useState(defaults.publicSlug ?? '')
  const [slugTouched, setSlugTouched] = useState(Boolean(defaults.publicSlug))

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <TextField
        label="Nome da oficina"
        name="businessName"
        defaultValue={defaults.businessName}
        required
        autoComplete="organization"
        className="sm:col-span-2"
        onChange={(e) => {
          if (!slugTouched) setSlug(slugify(e.target.value))
        }}
        error={errors.businessName}
      />
      <TextField
        label="Endereço do perfil público"
        name="publicSlug"
        value={slug}
        required
        autoComplete="off"
        className="sm:col-span-2"
        onChange={(e) => {
          setSlugTouched(true)
          setSlug(e.target.value.toLowerCase())
        }}
        hint={`${origin}/oficinas/${slug || 'nome-da-oficina'}`}
        error={errors.publicSlug}
      />
      <TextField label="Cidade (opcional)" name="city" defaultValue={defaults.city} autoComplete="address-level2" error={errors.city} />
      <SelectField label="Estado (opcional)" name="state" defaultValue={defaults.state ?? ''} options={UFS} placeholder="Escolha" error={errors.state} />
      <TextField label="Telefone (opcional)" name="phone" type="tel" defaultValue={defaults.phone} autoComplete="tel" inputMode="tel" error={errors.phone} />
      <TextField label="WhatsApp (opcional)" name="whatsapp" type="tel" defaultValue={defaults.whatsapp} inputMode="tel" error={errors.whatsapp} />
      <TextField label="E-mail da oficina (opcional)" name="email" type="email" defaultValue={defaults.email} autoComplete="email" className="sm:col-span-2" error={errors.email} />
      <TextField label="CNPJ (opcional)" name="cnpj" defaultValue={defaults.cnpj} inputMode="numeric" error={errors.cnpj} />
      <TextField label="Razão social (opcional)" name="legalName" defaultValue={defaults.legalName} error={errors.legalName} />
      {children}
    </div>
  )
}
