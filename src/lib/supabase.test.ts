import { describe, expect, it } from 'vitest'
import { PISTA_STORAGE_KEY, defaultStorageKey, isPistaPath, migratePistaSession } from './supabase'

function memoryStorage(): Storage {
  const m = new Map<string, string>()
  return {
    get length() { return m.size },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => { m.delete(k) },
    setItem: (k, v) => { m.set(k, v) },
  }
}

const session = (kind?: string) => JSON.stringify({ access_token: 'x', user: { id: 'u', app_metadata: kind ? { account_kind: kind } : {} } })

describe('sessão separada da pista (KI-048)', () => {
  it('reconhece só os caminhos da pista', () => {
    expect(isPistaPath('/pista')).toBe(true)
    expect(isPistaPath('/pista/ab12cd')).toBe(true)
    expect(isPistaPath('/pista/os/1')).toBe(true)
    expect(isPistaPath('/pistas')).toBe(false)
    expect(isPistaPath('/oficina/1/pista')).toBe(false)
  })

  it('usa a chave padrão do supabase-js para o painel', () => {
    expect(defaultStorageKey('https://ripgenhykaajcnzdxoid.supabase.co')).toBe('sb-ripgenhykaajcnzdxoid-auth-token')
  })

  it('move a sessão de mecânico para a chave da pista', () => {
    const s = memoryStorage()
    s.setItem('painel', session('pista'))
    migratePistaSession(s, 'painel')
    expect(s.getItem(PISTA_STORAGE_KEY)).toBe(session('pista'))
    expect(s.getItem('painel')).toBeNull()
  })

  it('não mexe na sessão do responsável', () => {
    const s = memoryStorage()
    s.setItem('painel', session())
    migratePistaSession(s, 'painel')
    expect(s.getItem(PISTA_STORAGE_KEY)).toBeNull()
    expect(s.getItem('painel')).toBe(session())
  })

  it('não sobrescreve uma sessão da pista que já existe', () => {
    const s = memoryStorage()
    s.setItem(PISTA_STORAGE_KEY, 'atual')
    s.setItem('painel', session('pista'))
    migratePistaSession(s, 'painel')
    expect(s.getItem(PISTA_STORAGE_KEY)).toBe('atual')
    expect(s.getItem('painel')).toBe(session('pista'))
  })

  it('ignora valor inválido', () => {
    const s = memoryStorage()
    s.setItem('painel', '{quebrado')
    expect(() => migratePistaSession(s, 'painel')).not.toThrow()
    expect(s.getItem(PISTA_STORAGE_KEY)).toBeNull()
  })
})
