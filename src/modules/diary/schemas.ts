import { z } from 'zod'
import { todayISO } from '@/core/shared/format'
import type { Database } from '@/types/supabase'

export type DiaryCategory = Database['public']['Enums']['diary_category']
export type DiaryVisibility = Database['public']['Enums']['diary_visibility']

/** Categorias do PRD 5.7, na ordem dos formulários. */
export const DIARY_CATEGORY_LABEL: Record<DiaryCategory, string> = {
  trip: 'Viagem',
  first_ride: 'Primeiro passeio',
  meetup: 'Encontro',
  accessory: 'Acessório',
  customization: 'Personalização',
  photo: 'Fotos',
  other: 'Outro acontecimento',
}
export const DIARY_CATEGORIES = Object.keys(DIARY_CATEGORY_LABEL) as DiaryCategory[]

export const VISIBILITY_LABEL: Record<DiaryVisibility, string> = {
  private: 'Privado',
  shareable: 'Compartilhável',
}

export const VISIBILITY_HINT: Record<DiaryVisibility, string> = {
  private: 'Só você vê. Continua só seu mesmo se vender a moto.',
  shareable: 'Acompanha a moto: um próximo dono poderá ver, sem saber quem escreveu. Poderá entrar no passaporte público quando o compartilhamento estiver disponível.',
}

/** Máximo de fotos por entrada (o banco também limita). */
export const MAX_DIARY_PHOTOS = 10

export const diarySchema = z.object({
  category: z.enum(DIARY_CATEGORIES as [string, ...string[]], { error: 'Escolha o tipo.' }),
  title: z.string().trim().min(1, 'Informe um título.').max(120, 'Título: no máximo 120 caracteres.'),
  entryDate: z
    .string()
    .trim()
    .refine((v) => v !== '', 'Informe a data.')
    .refine((v) => v === '' || v <= todayISO(), 'A data não pode estar no futuro.')
    .refine((v) => v === '' || v >= '1885-01-01', 'Data inválida.'),
  body: z
    .string()
    .trim()
    .max(5000, 'Texto: no máximo 5.000 caracteres.')
    .transform((v) => (v === '' ? undefined : v)),
  location: z
    .string()
    .trim()
    .max(120, 'Local: no máximo 120 caracteres.')
    .transform((v) => (v === '' ? undefined : v)),
  visibility: z.enum(['private', 'shareable']),
})

export type DiaryInput = z.output<typeof diarySchema>
