import { describe, expect, it } from 'vitest'
import { welcomeLabel } from './usePublicSettings'

describe('Premium de boas-vindas', () => {
  it('descreve o período em meses quando fecha em 30 dias', () => {
    expect(welcomeLabel(90)).toBe('3 meses')
    expect(welcomeLabel(30)).toBe('1 mês')
    expect(welcomeLabel(45)).toBe('45 dias')
  })
})
