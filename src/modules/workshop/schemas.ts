import { z } from 'zod'

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const

// Especialidades do PRD 2.2.
export const SPECIALTIES = [
  'Mecânica geral',
  'Revisões',
  'Suspensão',
  'Pneus',
  'Elétrica e injeção eletrônica',
  'Acessórios e preparação',
] as const

/** Gera endereço público a partir do nome: "Oficina do Zé" → "oficina-do-ze". */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
}

/** Valida CNPJ (14 dígitos e dígitos verificadores). */
export function isValidCnpj(value: string): boolean {
  const d = value.replace(/\D/g, '')
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const sum = weights.reduce((acc, w, i) => acc + Number(d[i]) * w, 0)
    const rest = sum % 11
    return rest < 2 ? 0 : 11 - rest
  }
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13])
}

const optional = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label}: no máximo ${max} caracteres.`)
    .transform((v) => (v === '' ? undefined : v))
    .optional()

const phone = (label: string) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => v === '' || (v.length >= 10 && v.length <= 13), `${label} inválido. Inclua o DDD.`)
    .transform((v) => (v === '' ? undefined : v))
    .optional()

export const workshopSchema = z.object({
  businessName: z.string().trim().min(2, 'Informe o nome da oficina.').max(120, 'Nome: no máximo 120 caracteres.'),
  publicSlug: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => v.length >= 3 && v.length <= 60, 'O endereço precisa ter de 3 a 60 caracteres.')
    .refine((v) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v), 'Use só letras minúsculas, números e hífens, sem acentos.'),
  city: optional(80, 'Cidade'),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === '' || (UFS as readonly string[]).includes(v), 'Escolha um estado.')
    .transform((v) => (v === '' ? undefined : v))
    .optional(),
  phone: phone('Telefone'),
  whatsapp: phone('WhatsApp'),
  email: z
    .string()
    .trim()
    .refine((v) => v === '' || z.email().safeParse(v).success, 'Informe um e-mail válido.')
    .transform((v) => (v === '' ? undefined : v))
    .optional(),
  cnpj: z
    .string()
    .trim()
    .refine((v) => v === '' || isValidCnpj(v), 'CNPJ inválido.')
    .transform((v) => (v === '' ? undefined : v.replace(/\D/g, '')))
    .optional(),
  legalName: optional(160, 'Razão social'),
})

export const workshopProfileSchema = workshopSchema.extend({
  responsibleName: optional(120, 'Responsável'),
  address: optional(200, 'Endereço'),
  description: optional(2000, 'Descrição'),
  openingHours: optional(300, 'Horário'),
  specialties: z.array(z.enum(SPECIALTIES)).default([]),
  isPublic: z.boolean(),
})

export type WorkshopInput = z.output<typeof workshopSchema>
export type WorkshopProfileInput = z.output<typeof workshopProfileSchema>
