import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatAddressLine, formatCep, lookupCep, lookupCnpj, prettyBrand } from './brasil'

const json = (body: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response)

afterEach(() => vi.unstubAllGlobals())

describe('CEP', () => {
  it('usa a BrasilAPI e cai para o ViaCEP quando ela falha', async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => json({}, false))
      .mockImplementationOnce(() => json({ logradouro: 'Av. 43', bairro: 'Centro', localidade: 'Barretos', uf: 'SP' }))
    vi.stubGlobal('fetch', fetchMock)
    const a = await lookupCep('14780-000')
    expect(a).toEqual({ cep: '14780000', street: 'Av. 43', neighborhood: 'Centro', city: 'Barretos', state: 'SP' })
    expect(fetchMock.mock.calls[0]?.[0]).toContain('brasilapi.com.br/api/cep/v2/14780000')
    expect(fetchMock.mock.calls[1]?.[0]).toContain('viacep.com.br/ws/14780000/json/')
    expect(formatAddressLine(a!)).toBe('Av. 43 · Centro · Barretos/SP · CEP 14780-000')
  })
  it('CEP inválido nem consulta', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await lookupCep('123')).toBeNull()
    expect(await lookupCep('00000000')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('serviços fora do ar: devolve null sem quebrar', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
    expect(await lookupCep('01001-001')).toBeNull()
  })
  it('máscara', () => {
    expect(formatCep('14780000')).toBe('14780-000')
    expect(formatCep('147')).toBe('147')
  })
})

describe('CNPJ', () => {
  it('converte os dados da Receita', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json({
      razao_social: 'ZE MOTOS LTDA', nome_fantasia: 'OFICINA DO ZE', descricao_tipo_de_logradouro: 'AVENIDA', logradouro: '43',
      numero: '900', complemento: '', bairro: 'CENTRO', municipio: 'BARRETOS', uf: 'SP', cep: '14780000', ddd_telefone_1: '1733221100', email: 'ZE@MOTOS.COM',
    })))
    const d = await lookupCnpj('12.345.678/0001-90')
    expect(d).toMatchObject({ legalName: 'ZE MOTOS LTDA', tradeName: 'OFICINA DO ZE', street: 'Avenida 43', city: 'Barretos', state: 'SP', phone: '1733221100', email: 'ze@motos.com' })
  })
})

describe('FIPE', () => {
  it('nomes de marca legíveis', () => {
    expect(prettyBrand('HONDA')).toBe('Honda')
    expect(prettyBrand('BMW')).toBe('BMW')
    expect(prettyBrand('HARLEY-DAVIDSON')).toBe('Harley-Davidson')
  })
})
