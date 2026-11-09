import { describe, expect, it } from 'vitest'
import { entryPhoneProblem, entryPlateProblem } from './entryValidation'

describe('Nova entrada: validação antes de salvar', () => {
  it('WhatsApp é opcional, mas com DDD quando informado', () => {
    expect(entryPhoneProblem('')).toBeNull()
    expect(entryPhoneProblem('(17) 99999-9999')).toBeNull()
    expect(entryPhoneProblem('+55 17 99999-9999')).toBeNull()
    expect(entryPhoneProblem('99999-9999')).toMatch(/DDD/)
    expect(entryPhoneProblem('55 17 99999-9999 123')).toMatch(/a mais/)
  })
  it('placa opcional, com 7 letras e números', () => {
    expect(entryPlateProblem('')).toBeNull()
    expect(entryPlateProblem('abc-1d23')).toBeNull()
    expect(entryPlateProblem('ABC1234')).toBeNull()
    expect(entryPlateProblem('ABC12')).toMatch(/7 letras/)
  })
})
