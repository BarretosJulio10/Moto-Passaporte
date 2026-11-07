import { z } from 'zod'

const email = z
  .string()
  .trim()
  .min(1, 'Informe seu e-mail.')
  .email('Informe um e-mail válido.')
  .max(160, 'E-mail muito longo.')

const password = z
  .string()
  .min(8, 'A senha precisa ter pelo menos 8 caracteres.')
  .max(72, 'A senha pode ter no máximo 72 caracteres.')
  .regex(/[A-Za-z]/, 'Inclua pelo menos uma letra.')
  .regex(/[0-9]/, 'Inclua pelo menos um número.')

export const signUpSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Informe seu nome.').max(120, 'Nome muito longo.'),
    email,
    password,
    confirmPassword: z.string(),
    acceptTerms: z.literal(true, { error: 'Aceite os termos de uso e a política de privacidade para continuar.' }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'As senhas não conferem.',
  })

export const signInSchema = z.object({
  email,
  password: z.string().min(1, 'Informe sua senha.'),
})

export const forgotPasswordSchema = z.object({ email })

export const resetPasswordSchema = z
  .object({ password, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'As senhas não conferem.',
  })

export type FieldErrors = Partial<Record<string, string>>

/** Valida e devolve dados ou erros por campo (primeira mensagem de cada campo). */
export function validate<T>(
  schema: z.ZodType<T>,
  input: unknown,
): { ok: true; data: T } | { ok: false; errors: FieldErrors } {
  const result = schema.safeParse(input)
  if (result.success) return { ok: true, data: result.data }
  const errors: FieldErrors = {}
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? 'form')
    if (!errors[key]) errors[key] = issue.message
  }
  return { ok: false, errors }
}
