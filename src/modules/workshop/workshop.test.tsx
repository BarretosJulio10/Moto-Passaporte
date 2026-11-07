import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { isValidCnpj, slugify, workshopSchema } from './schemas'
import { validate } from '@/core/auth/schemas'

// Stubs sem vi.fn para rejeições (Vitest 5 marca rejeições de espiões como falha).
const created: unknown[] = []
let createImpl: (input: unknown) => Promise<string> = async () => 'org-1'
let publicImpl: (slug: string) => Promise<unknown> = async () => null
vi.mock('./api', () => ({
  createWorkshop: (input: unknown) => {
    created.push(input)
    return createImpl(input)
  },
  fetchPublicWorkshop: (slug: string) => publicImpl(slug),
}))

import { CreateWorkshopPage } from './CreateWorkshopPage'
import { PublicWorkshopPage } from './PublicWorkshopPage'

const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })

describe('regras da oficina', () => {
  it('gera endereço público sem acentos', () => {
    expect(slugify('Oficina do Zé — Motos & Peças')).toBe('oficina-do-ze-motos-pecas')
  })
  it('valida CNPJ pelos dígitos verificadores', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true)
    expect(isValidCnpj('11.222.333/0001-82')).toBe(false)
    expect(isValidCnpj('11111111111111')).toBe(false)
  })
  it('normaliza telefone, UF e CNPJ', () => {
    const r = validate(workshopSchema, {
      businessName: 'Oficina do Zé',
      publicSlug: 'oficina-do-ze',
      city: 'Barretos',
      state: 'sp',
      phone: '(17) 3322-1100',
      whatsapp: '',
      email: '',
      cnpj: '11.222.333/0001-81',
      legalName: '',
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data).toMatchObject({ state: 'SP', phone: '1733221100', cnpj: '11222333000181' })
      expect(r.data.whatsapp).toBeUndefined()
    }
  })
  it('recusa endereço com acento ou espaço e telefone sem DDD', () => {
    const r = validate(workshopSchema, { businessName: 'X Moto', publicSlug: 'oficina zé', phone: '33221100' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors.publicSlug).toMatch(/minúsculas/)
      expect(r.errors.phone).toMatch(/DDD/)
    }
  })
})

function renderCreate() {
  const router = createMemoryRouter(
    [
      { path: '/oficina/nova', element: <CreateWorkshopPage /> },
      { path: '/oficina/:orgId', element: <p>Painel da oficina</p> },
    ],
    { initialEntries: ['/oficina/nova'] },
  )
  render(
    <QueryClientProvider client={qc()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

describe('CreateWorkshopPage', () => {
  beforeEach(() => {
    created.length = 0
    createImpl = async () => 'org-1'
  })

  it('sugere o endereço a partir do nome e cria a oficina', async () => {
    const user = userEvent.setup()
    const router = renderCreate()
    await user.type(screen.getByLabelText('Nome da oficina'), 'Oficina do Zé')
    expect(screen.getByLabelText('Endereço do perfil público')).toHaveValue('oficina-do-ze')
    await user.click(screen.getByRole('button', { name: 'Cadastrar oficina' }))
    expect(created[0]).toMatchObject({ businessName: 'Oficina do Zé', publicSlug: 'oficina-do-ze' })
    expect(await screen.findByText('Painel da oficina')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/oficina/org-1')
  })

  it('endereço já usado aparece no campo certo', async () => {
    createImpl = () => Promise.reject({ code: '23505', message: 'duplicate key' })
    const user = userEvent.setup()
    renderCreate()
    await user.type(screen.getByLabelText('Nome da oficina'), 'Oficina do Zé')
    await user.click(screen.getByRole('button', { name: 'Cadastrar oficina' }))
    expect(await screen.findByText('Este endereço já está em uso. Escolha outro.')).toBeInTheDocument()
  })
})

describe('PublicWorkshopPage', () => {
  it('mostra o perfil sem dados internos e sem prometer certificação', async () => {
    publicImpl = async () => ({
      business_name: 'Oficina do Zé',
      public_slug: 'oficina-do-ze',
      city: 'Barretos',
      state: 'SP',
      specialties: ['Suspensão'],
      description: 'Especialistas em motos de média cilindrada.',
      opening_hours: 'seg a sex, 8h às 18h',
      phone: '17991234567',
      whatsapp: '17991234567',
      email: null,
      address: null,
      verification_status: 'unverified',
    })
    render(
      <QueryClientProvider client={qc()}>
        <MemoryRouter initialEntries={['/oficinas/oficina-do-ze']}>
          <Routes>
            <Route path="/oficinas/:slug" element={<PublicWorkshopPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Oficina do Zé')
    expect(screen.getByText('Suspensão')).toBeInTheDocument()
    expect(screen.getByText('(17) 99123-4567')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir conversa' })).toHaveAttribute('href', 'https://wa.me/5517991234567')
    expect(screen.queryByText(/CNPJ/)).not.toBeInTheDocument()
    expect(screen.getByText(/Não é certificação técnica/)).toBeInTheDocument()
  })
})
