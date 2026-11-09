import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PLAY_PACKAGE, detectStoreApp, setStoreAppForTests, storeSafeText } from './storeApp'
import { PremiumLink } from '@/modules/plans/PremiumLink'
import { translateDbError } from '@/core/shared/dbErrors'

function mem() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) } }
}

afterEach(() => setStoreAppForTests(null))

describe('modo loja: detecção do app da Google Play (ADR-063)', () => {
  it('reconhece a abertura pela casca (?origem=play) e lembra na sessão', () => {
    const s = mem()
    expect(detectStoreApp('https://www.motopassaporte.com.br/painel?origem=play', '', s)).toBe(true)
    expect(detectStoreApp('https://www.motopassaporte.com.br/painel/motos', '', s)).toBe(true)
  })
  it('reconhece a abertura por link dentro do app (referrer android-app)', () => {
    expect(detectStoreApp('https://www.motopassaporte.com.br/p/abc', `android-app://${PLAY_PACKAGE}/`, mem())).toBe(true)
  })
  it('site e app instalado pelo navegador não são o app da loja', () => {
    expect(detectStoreApp('https://www.motopassaporte.com.br/painel?origem=app', 'https://www.google.com/', mem())).toBe(false)
    expect(detectStoreApp('https://www.motopassaporte.com.br/painel', 'android-app://com.outro.app/', mem())).toBe(false)
  })
  it('sem armazenamento, ainda reconhece pela abertura', () => {
    expect(detectStoreApp('https://www.motopassaporte.com.br/painel?origem=play', '', null)).toBe(true)
  })
})

describe('modo loja: nada de compra no app da Google Play', () => {
  it('link para planos some no app da loja e aparece no site', () => {
    setStoreAppForTests(true)
    const { unmount } = render(<MemoryRouter><p>Recurso do Premium. <PremiumLink>Conhecer o Premium</PremiumLink></p></MemoryRouter>)
    expect(screen.queryByRole('link', { name: 'Conhecer o Premium' })).toBeNull()
    unmount()
    setStoreAppForTests(false)
    render(<MemoryRouter><PremiumLink>Conhecer o Premium</PremiumLink></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Conhecer o Premium' })).toHaveAttribute('href', '/painel/plano')
  })

  it('mensagem do servidor perde a frase que manda comprar', () => {
    const msg = 'Esta moto passou do limite do seu plano e está só para leitura. Inclua uma moto extra em Meu plano para voltar a registrar.'
    setStoreAppForTests(false)
    expect(storeSafeText(msg)).toBe(msg)
    expect(translateDbError({ code: 'P0001', message: msg })).toBe(msg)
    setStoreAppForTests(true)
    expect(storeSafeText(msg)).toBe('Esta moto passou do limite do seu plano e está só para leitura.')
    expect(translateDbError({ code: 'P0001', message: msg })).toBe('Esta moto passou do limite do seu plano e está só para leitura.')
  })

  it('se toda a mensagem for de compra, fica um texto neutro', () => {
    setStoreAppForTests(true)
    expect(storeSafeText('Assine o Premium para continuar.')).toBe('Seu plano atual não permite esta ação.')
  })
})
