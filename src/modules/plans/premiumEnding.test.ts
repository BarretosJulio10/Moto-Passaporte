import { describe, expect, it } from 'vitest'
import { premiumEndingSoon, type MotorcycleSlots } from './billingApi'

const now = new Date('2026-11-09T12:00:00Z')
const base: MotorcycleSlots = {
  mode: 'grant', max: 2, used: 2, extras: 0, extra_cents: 390, billing_period: null,
  pass_until: null, pass_months_left: null, grant_until: '2026-11-19T12:00:00Z', free_max: 1, over_limit: [],
}

describe('aviso antes do Premium acabar (KI-052)', () => {
  it('avisa quando faltam até 15 dias e há moto além do grátis', () => {
    expect(premiumEndingSoon(base, now)).toEqual({ days: 10, extraMotos: 1 })
  })
  it('não avisa com só uma moto', () => {
    expect(premiumEndingSoon({ ...base, used: 1 }, now)).toBeNull()
  })
  it('não avisa com prazo longe', () => {
    expect(premiumEndingSoon({ ...base, grant_until: '2027-01-30T12:00:00Z' }, now)).toBeNull()
  })
  it('assinatura no cartão renova sozinha: sem aviso', () => {
    expect(premiumEndingSoon({ ...base, mode: 'subscription', grant_until: null }, now)).toBeNull()
  })
  it('período no Pix também avisa', () => {
    expect(premiumEndingSoon({ ...base, mode: 'pass', grant_until: null, pass_until: '2026-11-12T12:00:00Z', used: 3 }, now)).toEqual({ days: 3, extraMotos: 2 })
  })
})
