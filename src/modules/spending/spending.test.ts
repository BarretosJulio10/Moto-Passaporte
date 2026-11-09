import { describe, expect, it } from 'vitest'
import { DEFAULT_FILTERS, buildSpendingCsv, categoryLabel, formatPerKm, filtersFromParams, filtersToParams, monthLabel, periodRange, timelineToSpendingQuery, timelineTotal } from './api'

describe('gastos — filtros', () => {
  it('padrão não suja o endereço e volta igual', () => {
    expect(filtersToParams(DEFAULT_FILTERS).toString()).toBe('')
    expect(filtersFromParams(new URLSearchParams())).toEqual(DEFAULT_FILTERS)
  })
  it('ida e volta com todos os campos', () => {
    const f = { ...DEFAULT_FILTERS, period: 'custom' as const, from: '2026-01-01', to: '2026-03-31', category: 'tires' as const,
      workshop: '__none__', source: 'document' as const, scope: 'all' as const, compare: true, kind: 'expense' as const }
    expect(filtersFromParams(filtersToParams(f))).toEqual(f)
  })
  it('valores inválidos caem no padrão', () => {
    const f = filtersFromParams(new URLSearchParams('periodo=xyz&origem=hack'))
    expect(f.period).toBe('this_year')
    expect(f.source).toBe('')
  })
  it('períodos', () => {
    const today = new Date(2026, 10, 8)
    expect(periodRange('this_year', today)).toEqual({ from: '2026-01-01', to: '2026-11-08' })
    expect(periodRange('last_year', today)).toEqual({ from: '2025-01-01', to: '2025-12-31' })
    expect(periodRange('all', today)).toEqual({ from: null, to: null })
  })
  it('linha do tempo → gastos com o mesmo recorte', () => {
    expect(timelineToSpendingQuery({ category: '', source: '', workshop: '', from: '', to: '' })).toBe('?periodo=all&escopo=tudo&tipo=servicos')
    expect(timelineToSpendingQuery({ category: 'brakes', source: 'workshop', workshop: 'Oficina X', from: '2026-01-01', to: '' }))
      .toBe('?periodo=custom&de=2026-01-01&categoria=brakes&oficina=Oficina+X&origem=workshop&escopo=tudo&tipo=servicos')
  })
})

describe('gastos — soma da linha do tempo', () => {
  it('conta só vigentes não anulados; sem valor fica à parte', () => {
    const t = timelineTotal([
      { status: 'current', is_void: false, service_value_cents: 45000 },
      { status: 'superseded', is_void: false, service_value_cents: 12000 },
      { status: 'current', is_void: false, service_value_cents: 15000 },
      { status: 'current', is_void: false, service_value_cents: null },
      { status: 'current', is_void: true, service_value_cents: 99900 },
    ])
    expect(t).toEqual({ cents: 60000, withValue: 2, missing: 1 })
  })
  it('rótulos de categoria de serviço e de despesa', () => {
    expect(categoryLabel('fuel')).toBe('Combustível')
    expect(categoryLabel('tires')).toBe('Pneus')
    expect(formatPerKm(57)).toMatch(/0,57\/km$/)
  })
  it('rótulo de mês', () => {
    expect(monthLabel('2026-03')).toBe('mar/26')
  })
})

describe('gastos — CSV', () => {
  it('separador ;, vírgula decimal, acentos com BOM, aspas escapadas e total no fim', () => {
    const csv = buildSpendingCsv([
      { kind: 'expense', id: '1', motorcycle_id: 'm', motorcycle: 'Honda CG', category: 'fuel', title: 'Posto "Ipiranga"; centro', date: '2026-11-05',
        workshop_name: null, mileage: 19430, value_cents: 8590, has_receipt: false, receipt_path: null, receipt_name: null },
      { kind: 'service', id: '2', motorcycle_id: 'm', motorcycle: 'Honda CG', category: 'tires', title: 'Pneu', date: '2026-03-01',
        workshop_name: 'Pneus Já', mileage: null, value_cents: 123456, has_receipt: true, receipt_path: null, receipt_name: null },
    ])
    expect(csv.startsWith('\uFEFFData;Tipo;Moto;Categoria;Descrição;Oficina;Km;Valor (R$)\r\n')).toBe(true)
    const lines = csv.trim().split('\r\n')
    expect(lines[1]).toBe('01/03/2026;Serviço;Honda CG;Pneus;Pneu;Pneus Já;;1234,56')
    expect(lines[2]).toBe('05/11/2026;Despesa avulsa;Honda CG;Combustível;"Posto ""Ipiranga""; centro";;19430;85,90')
    expect(lines[3]).toBe(';;;;Total;;;1320,46')
  })
})
