import { z } from 'zod'
import { todayISO } from '@/core/shared/format'
import { CATEGORIES } from './labels'

/** "1.250,50" | "1250,5" | "1250" → centavos. Vazio → undefined. Inválido → NaN. */
export function parseBRL(value: string): number | undefined {
  const v = value.trim().replace(/^R\$\s*/i, '')
  if (v === '') return undefined
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(v)) return Number.NaN
  const [int, dec = ''] = v.replace(/\./g, '').split(',')
  return Number(int) * 100 + Number(dec.padEnd(2, '0'))
}

export function formatBRL(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '—'
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label}: no máximo ${max} caracteres.`)
    .transform((v) => (v === '' ? undefined : v))
    .optional()

export const itemSchema = z.object({
  item_name: z.string().trim().min(1, 'Informe o nome da peça.').max(120, 'Nome da peça muito longo.'),
  brand: optionalText(80, 'Fabricante'),
  part_number: optionalText(60, 'Código'),
  quantity: z
    .string()
    .trim()
    .transform((v) => (v === '' ? '1' : v.replace(',', '.')))
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v) && Number(v) > 0 && Number(v) <= 10000, 'Quantidade inválida.')
    .transform(Number),
})

export type ItemInput = z.output<typeof itemSchema>

export const maintenanceSchema = z
  .object({
    category: z.enum(CATEGORIES as [string, ...string[]], { error: 'Escolha a categoria.' }),
    title: z.string().trim().min(2, 'Informe um título.').max(120, 'Título: no máximo 120 caracteres.'),
    serviceDate: z
      .string()
      .trim()
      .refine((v) => v !== '', 'Informe a data do serviço.')
      .refine((v) => v === '' || v <= todayISO(), 'A data não pode estar no futuro.'),
    mileage: z
      .string()
      .trim()
      .transform((v) => v.replace(/\./g, ''))
      .refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) <= 2_000_000), 'Quilometragem inválida.')
      .transform((v) => (v === '' ? undefined : Number(v)))
      .optional(),
    workshopName: optionalText(120, 'Oficina'),
    value: z
      .string()
      .transform(parseBRL)
      .refine((v) => v === undefined || (Number.isFinite(v) && v >= 0), 'Valor inválido. Exemplo: 250,00')
      .optional(),
    description: optionalText(4000, 'Descrição'),
    notes: optionalText(2000, 'Observações'),
    correctsRecordId: z
      .string()
      .transform((v) => (v === '' ? undefined : v))
      .optional(),
    correctionReason: optionalText(500, 'Motivo'),
  })
  .refine((v) => !v.correctsRecordId || (v.correctionReason?.length ?? 0) >= 3, {
    path: ['correctionReason'],
    message: 'Explique o motivo da correção.',
  })

export type MaintenanceInput = z.output<typeof maintenanceSchema>
