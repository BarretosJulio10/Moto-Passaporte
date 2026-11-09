import { normalizePlate } from '@/core/shared/format'
import { onlyDigits } from '../shared/rpc'

/** WhatsApp opcional; se vier, precisa de DDD + número (10 a 13 dígitos), como o banco exige. */
export function entryPhoneProblem(value: string): string | null {
  const d = onlyDigits(value)
  if (!d) return null
  if (d.length < 10) return 'Confira o WhatsApp: coloque o DDD e o número, ex.: (17) 99999-9999.'
  if (d.length > 13) return 'Confira o WhatsApp: tem dígitos a mais.'
  return null
}

/** Placa opcional; se vier, 7 letras e números (ABC1D23 ou ABC1234). */
export function entryPlateProblem(value: string): string | null {
  const p = normalizePlate(value)
  if (!p) return null
  return /^[A-Z0-9]{7}$/.test(p) ? null : 'Confira a placa: são 7 letras e números, ex.: ABC1D23.'
}
