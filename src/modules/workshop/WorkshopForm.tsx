import { useRef, useState, type ReactNode } from 'react'
import { TextField, SelectField } from '@/components/Field'
import { CepField, useCnpjLookup } from '@/components/Autofill'
import { formatAddressLine, type CepAddress } from '@/lib/brasil'
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
export function WorkshopBasicFields({ errors, defaults = {}, origin, children, address }: {
  errors: FieldErrors; defaults?: Defaults; origin: string; children?: ReactNode
  /** Campo de endereço (só no perfil; o cadastro inicial não tem). */
  address?: { defaultValue: string; error?: string }
}) {
  const [slug, setSlug] = useState(defaults.publicSlug ?? '')
  const [slugTouched, setSlugTouched] = useState(Boolean(defaults.publicSlug))
  const root = useRef<HTMLDivElement>(null)
  const cnpj = useCnpjLookup()

  // Campos sem estado próprio: preenche direto no formulário (só nome/endereço; nada é enviado sem o usuário salvar).
  const field = (name: string) => root.current?.closest('form')?.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null
  const put = (name: string, value: string, onlyIfEmpty: boolean) => {
    const el = field(name)
    if (!el || !value || (onlyIfEmpty && el.value.trim())) return
    el.value = value
  }
  const onCep = (a: CepAddress) => {
    put('city', a.city, false)
    put('state', a.state, false)
    put('address', formatAddressLine(a), false)
  }

  return (
    <div ref={root} className="flex flex-col gap-8">
      <Section title="Empresa">
        <TextField label="CNPJ (opcional)" name="cnpj" defaultValue={defaults.cnpj} inputMode="numeric" error={errors.cnpj}
          hint={errors.cnpj ? undefined : cnpj.hint}
          onBlur={async (e) => {
            const d = await cnpj.lookup(e.target.value)
            if (!d) return
            put('legalName', d.legalName, true)
            if (d.tradeName || d.legalName) {
              const before = field('businessName')?.value.trim()
              put('businessName', d.tradeName || d.legalName, true)
              if (!before && !slugTouched) setSlug(slugify(d.tradeName || d.legalName))
            }
            put('city', d.city, true)
            put('state', d.state, true)
            if (d.phone) put('phone', d.phone, true)
            if (d.email) put('email', d.email, true)
            if (d.city) put('address', formatAddressLine({ cep: d.cep, street: d.street, neighborhood: d.neighborhood, city: d.city, state: d.state }, [d.number, d.complement].filter(Boolean).join(' ')), true)
          }} />
        <TextField label="Razão social (opcional)" name="legalName" defaultValue={defaults.legalName} error={errors.legalName} className="xl:col-span-2" />
        <TextField
          label="Nome da oficina"
          name="businessName"
          defaultValue={defaults.businessName}
          required
          autoComplete="organization"
          className="sm:col-span-2 xl:col-span-1"
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
      </Section>
      <Section title="Endereço">
        <CepField onFound={onCep} />
        <TextField label="Cidade (opcional)" name="city" defaultValue={defaults.city} autoComplete="address-level2" error={errors.city} />
        <SelectField label="Estado (opcional)" name="state" defaultValue={defaults.state ?? ''} options={UFS} placeholder="Escolha" error={errors.state} />
        {address && (
          <TextField label="Endereço (opcional)" name="address" defaultValue={address.defaultValue} autoComplete="street-address" error={address.error}
            hint="Confira e acrescente o número." className="sm:col-span-2 xl:col-span-3" />
        )}
      </Section>
      <Section title="Contato">
        <TextField label="Telefone (opcional)" name="phone" type="tel" defaultValue={defaults.phone} autoComplete="tel" inputMode="tel" error={errors.phone} />
        <TextField label="WhatsApp (opcional)" name="whatsapp" type="tel" defaultValue={defaults.whatsapp} inputMode="tel" error={errors.whatsapp} />
        <TextField label="E-mail da oficina (opcional)" name="email" type="email" defaultValue={defaults.email} autoComplete="email" error={errors.email} className="sm:col-span-2 xl:col-span-1" />
      </Section>
      {children && <Section title="Sobre a oficina">{children}</Section>}
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-sheet border border-rule bg-sheet p-4 sm:p-5">
      <legend className="sr-only">{title}</legend>
      <h2 aria-hidden="true" className="heading text-lg text-ink">{title}</h2>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </fieldset>
  )
}
