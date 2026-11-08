import { describe, expect, it } from 'vitest'
import { formatPlate, isValidPlate, maskChassis, normalizePlate, formatKm, formatDate } from '@/core/shared/format'
import { translateDbError } from '@/core/shared/dbErrors'
import { validate } from '@/core/auth/schemas'
import { registerMotorcycleSchema, mileageSchema, plateSchema } from './schemas'
import { publicPassportUrl } from './api'

describe('placa', () => {
  it('normaliza como o banco', () => {
    expect(normalizePlate(' abc-1d23 ')).toBe('ABC1D23')
  })
  it('aceita padrão antigo e Mercosul, recusa outros', () => {
    expect(isValidPlate('ABC-1234')).toBe(true)
    expect(isValidPlate('abc1d23')).toBe(true)
    expect(isValidPlate('AB12345')).toBe(false)
    expect(isValidPlate('ABCD123')).toBe(false)
  })
  it('formata para exibição', () => {
    expect(formatPlate('ABC1234')).toBe('ABC-1234')
    expect(formatPlate('ABC1D23')).toBe('ABC1D23')
  })
})

describe('formatação', () => {
  it('mascara o chassi mostrando só início e fim', () => {
    expect(maskChassis('9C2PC4500NR000001')).toBe('9C2••••••••••0001')
    expect(maskChassis(null)).toBe('—')
  })
  it('km e datas em pt-BR, sem deslocar o dia', () => {
    expect(formatKm(12400)).toBe('12.400 km')
    expect(formatKm(null)).toBe('—')
    expect(formatDate('2024-03-14')).toBe('14 de março de 2024')
  })
  it('link público usa o public_id', () => {
    expect(publicPassportUrl('abc', 'https://moto-passaporte.vercel.app')).toBe('https://moto-passaporte.vercel.app/p/abc')
  })
})

describe('translateDbError', () => {
  it('mostra mensagens de regra de negócio do banco', () => {
    expect(translateDbError({ code: 'P0001', message: 'Limite de motocicletas do seu plano atingido.' })).toBe(
      'Limite de motocicletas do seu plano atingido.',
    )
    expect(translateDbError({ code: '22023', message: 'Placa inválida. Use o formato ABC1234 ou ABC1D23.' })).toMatch(/Placa inválida/)
  })
  it('não expõe detalhes técnicos', () => {
    expect(translateDbError({ code: '42501', message: 'permission denied for table motorcycles' })).toBe(
      'Você não tem permissão para esta operação.',
    )
    expect(translateDbError({ code: 'XX000', message: 'internal' })).toMatch(/Não foi possível/)
  })
})

const base = {
  brand: 'Honda',
  model: 'CB 500F',
  version: '',
  manufacturingYear: '2022',
  modelYear: '2023',
  displacementCc: '471',
  color: 'Preta',
  plate: 'abc-1d23',
  chassis: '9c2pc4500nr000001',
  currentMileage: '12.400',
  acquisitionDate: '',
  initialNotes: '',
  oilIntervalKm: '1.000',
  lastOilKm: '',
}

describe('registerMotorcycleSchema', () => {
  it('converte o formulário para o formato do banco', () => {
    const r = validate(registerMotorcycleSchema, base)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data).toMatchObject({
      brand: 'Honda',
      plate: 'ABC1D23',
      chassis: '9C2PC4500NR000001',
      manufacturingYear: 2022,
      modelYear: 2023,
      displacementCc: 471,
      currentMileage: 12400,
    })
    expect(r.data.version).toBeUndefined()
    expect(r.data.acquisitionDate).toBeUndefined()
  })
  it('exige marca, modelo, ano, placa e km', () => {
    const r = validate(registerMotorcycleSchema, { ...base, brand: '', model: '', manufacturingYear: '', plate: '', currentMileage: '' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(Object.keys(r.errors).sort()).toEqual(['brand', 'currentMileage', 'manufacturingYear', 'model', 'plate'])
  })
  it('valida ano do modelo, placa e data futura', () => {
    const r = validate(registerMotorcycleSchema, { ...base, modelYear: '2025', plate: 'XX1', acquisitionDate: '2999-01-01' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors.modelYear).toMatch(/ano do modelo/i)
    expect(r.errors.plate).toMatch(/Placa inválida/)
    expect(r.errors.acquisitionDate).toMatch(/futuro/)
  })
})

describe('troca de óleo no cadastro (ADR-041)', () => {
  it('pede o intervalo, aceita a última troca e recusa valores fora da faixa', () => {
    const ok = validate(registerMotorcycleSchema, { ...base, lastOilKm: '11.800' })
    expect(ok.ok && ok.data.oilIntervalKm === 1000 && ok.data.lastOilKm === 11800).toBe(true)
    const r = validate(registerMotorcycleSchema, { ...base, oilIntervalKm: '100', lastOilKm: '13000' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors.oilIntervalKm).toMatch(/300 e 20.000/)
    const r2 = validate(registerMotorcycleSchema, { ...base, lastOilKm: '13000' })
    expect(!r2.ok && r2.errors.lastOilKm).toMatch(/maior que o atual/)
  })
})

describe('mileageSchema e plateSchema', () => {
  it('correção exige motivo', () => {
    const r = validate(mileageSchema, { mileage: '9000', recordedAt: '2024-01-01', note: '', correctsRecordId: 'abc' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.note).toMatch(/motivo/)
  })
  it('leitura simples é válida e km aceita ponto de milhar', () => {
    const r = validate(mileageSchema, { mileage: '15.200', recordedAt: '2024-01-01', note: '', correctsRecordId: '' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.mileage).toBe(15200)
  })
  it('nova placa é normalizada', () => {
    const r = validate(plateSchema, { plate: 'qwe-1234' })
    expect(r.ok && r.data.plate).toBe('QWE1234')
  })
})
