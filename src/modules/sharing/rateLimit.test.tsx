import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { isRateLimited } from '@/core/shared/rateLimit'

const passport = vi.fn()
const shared = vi.fn()
vi.mock('@/modules/motorcycles/api', () => ({ getPublicPassport: (...a: unknown[]) => passport(...a) }))
vi.mock('./sharesApi', async () => {
  const actual = await vi.importActual<typeof import('./sharesApi')>('./sharesApi')
  return { ...actual, fetchSharedPassport: (...a: unknown[]) => shared(...a) }
})

import { PublicPassportPage } from './PublicPassportPage'
import { SharedPassportPage } from './SharedPassportPage'

const limited = () => Object.assign(new Error('Muitas consultas a partir desta conexão.'), { code: 'P0001', hint: 'rate_limited' })

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/p/:publicId" element={<PublicPassportPage />} />
          <Route path="/c/:token" element={<SharedPassportPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('limite de consultas anônimas (ADR-035)', () => {
  it('reconhece o erro do limite e só ele', () => {
    expect(isRateLimited(limited())).toBe(true)
    expect(isRateLimited({ message: 'Muitas consultas seguidas' })).toBe(true)
    expect(isRateLimited(new Error('permission denied'))).toBe(false)
    expect(isRateLimited(null)).toBe(false)
  })

  it('passaporte público: pede para aguardar, sem dizer que não existe', async () => {
    passport.mockImplementation(async () => {
      throw limited()
    })
    renderAt('/p/7f3a9c2e81d04b6a9e1f22c3d4b5a6c7')
    expect(await screen.findByRole('heading', { name: 'Muitas consultas seguidas' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /não encontrado/ })).toBeNull()
  })

  it('passaporte compartilhado: pede para aguardar, sem dizer que o link caiu', async () => {
    shared.mockImplementation(async () => {
      throw limited()
    })
    renderAt('/c/' + 'c'.repeat(48))
    expect(await screen.findByRole('heading', { name: 'Muitas consultas seguidas' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Link indisponível' })).toBeNull()
  })
})
