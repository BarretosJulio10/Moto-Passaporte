import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const getPublicPassport = vi.fn()
vi.mock('@/modules/motorcycles/api', () => ({ getPublicPassport: (...a: unknown[]) => getPublicPassport(...a) }))

import { PublicPassportPage } from './PublicPassportPage'

const PUBLIC_ID = '7f3a9c2e81d04b6a9e1f22c3d4b5a6c7'

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/p/:publicId" element={<PublicPassportPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('PublicPassportPage', () => {
  beforeEach(() => getPublicPassport.mockReset())

  it('mostra só os campos públicos padrão', async () => {
    getPublicPassport.mockResolvedValue({
      public_id: PUBLIC_ID,
      brand: 'Honda',
      model: 'CB 500F',
      version: null,
      manufacturing_year: 2022,
      model_year: 2023,
      displacement_cc: 471,
      color: 'Preta',
      passport_created_at: '2024-03-14T10:00:00Z',
    })
    renderAt(`/p/${PUBLIC_ID}`)
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Honda CB 500F')
    expect(screen.getByText('2022/2023')).toBeInTheDocument()
    expect(screen.getByText('471 cm³')).toBeInTheDocument()
    expect(screen.queryByText(/placa/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/chassi/i)).not.toBeInTheDocument()
    expect(screen.getByText(/Não é laudo/)).toBeInTheDocument()
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow')
  })

  it('link inexistente mostra mensagem única, sem dizer o motivo', async () => {
    getPublicPassport.mockResolvedValue(null)
    renderAt(`/p/${PUBLIC_ID}`)
    expect(await screen.findByRole('heading', { name: /não encontrado ou indisponível/ })).toBeInTheDocument()
  })

  it('formato inválido nem consulta o banco', () => {
    renderAt('/p/nao-e-um-id')
    expect(getPublicPassport).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: /não encontrado ou indisponível/ })).toBeInTheDocument()
  })
})
