import { z } from 'zod'
import { isValidPlate, normalizePlate, todayISO } from '@/core/shared/format'

const currentYear = () => new Date().getFullYear()

/** Campo opcional de texto: vazio vira undefined. */
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label}: no máximo ${max} caracteres.`)
    .transform((v) => (v === '' ? undefined : v))
    .optional()

/** Campo opcional numérico vindo de input de texto. */
const optionalInt = (min: number, max: number, message: string) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/\./g, ''))
    .refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) >= min && Number(v) <= max), message)
    .transform((v) => (v === '' ? undefined : Number(v)))
    .optional()

const requiredInt = (min: number, max: number, empty: string, invalid: string) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/\./g, ''))
    .refine((v) => v !== '', empty)
    .refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) >= min && Number(v) <= max), invalid)
    .transform((v) => Number(v))

export const registerMotorcycleSchema = z
  .object({
    brand: z.string().trim().min(1, 'Informe a marca.').max(60, 'Marca: no máximo 60 caracteres.'),
    model: z.string().trim().min(1, 'Informe o modelo.').max(80, 'Modelo: no máximo 80 caracteres.'),
    version: optionalText(80, 'Versão'),
    manufacturingYear: requiredInt(1885, currentYear() + 1, 'Informe o ano de fabricação.', 'Ano de fabricação inválido.'),
    modelYear: optionalInt(1885, currentYear() + 2, 'Ano do modelo inválido.'),
    displacementCc: optionalInt(1, 10000, 'Cilindrada inválida. Use só números, em cm³.'),
    color: optionalText(40, 'Cor'),
    plate: z
      .string()
      .trim()
      .refine((v) => v !== '', 'Informe a placa.')
      .refine((v) => v === '' || isValidPlate(v), 'Placa inválida. Use o formato ABC1234 ou ABC1D23.')
      .transform(normalizePlate),
    chassis: z
      .string()
      .trim()
      .transform(normalizePlate)
      .refine((v) => v === '' || /^[A-Z0-9]{5,30}$/.test(v), 'Chassi inválido. Use só letras e números.')
      .transform((v) => (v === '' ? undefined : v))
      .optional(),
    currentMileage: requiredInt(0, 2_000_000, 'Informe a quilometragem atual.', 'Quilometragem inválida.'),
    acquisitionDate: z
      .string()
      .trim()
      .refine((v) => v === '' || v <= todayISO(), 'A data de aquisição não pode estar no futuro.')
      .transform((v) => (v === '' ? undefined : v))
      .optional(),
    initialNotes: optionalText(2000, 'Observações'),
    oilIntervalKm: requiredInt(300, 20000, 'Informe de quantos em quantos km você troca o óleo.', 'Use um intervalo entre 300 e 20.000 km.'),
    lastOilKm: optionalInt(0, 2_000_000, 'Km da última troca inválido.'),
  })
  .refine((v) => v.lastOilKm === undefined || !(v.currentMileage >= 0) || v.lastOilKm <= v.currentMileage, {
    path: ['lastOilKm'],
    message: 'A última troca não pode ter km maior que o atual.',
  })
  .refine(
    (v) =>
      v.modelYear === undefined ||
      !(v.manufacturingYear >= 1885) ||
      (v.modelYear >= v.manufacturingYear && v.modelYear <= v.manufacturingYear + 1),
    { path: ['modelYear'], message: 'O ano do modelo deve ser igual ao de fabricação ou o seguinte.' },
  )

export type RegisterMotorcycleInput = z.output<typeof registerMotorcycleSchema>

export const mileageSchema = z
  .object({
    mileage: requiredInt(0, 2_000_000, 'Informe a quilometragem.', 'Quilometragem inválida.'),
    recordedAt: z
      .string()
      .trim()
      .refine((v) => v !== '', 'Informe a data da leitura.')
      .refine((v) => v === '' || v <= todayISO(), 'A data não pode estar no futuro.'),
    note: optionalText(500, 'Observação'),
    correctsRecordId: z
      .string()
      .transform((v) => (v === '' ? undefined : v))
      .optional(),
  })
  .refine((v) => !v.correctsRecordId || Boolean(v.note), {
    path: ['note'],
    message: 'Explique o motivo da correção.',
  })

export type MileageInput = z.output<typeof mileageSchema>

export const plateSchema = z.object({
  plate: z
    .string()
    .trim()
    .refine((v) => v !== '', 'Informe a nova placa.')
    .refine((v) => v === '' || isValidPlate(v), 'Placa inválida. Use o formato ABC1234 ou ABC1D23.')
    .transform(normalizePlate),
})
