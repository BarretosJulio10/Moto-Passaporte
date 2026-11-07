import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Implementação trocável (sem vi.fn: o Vitest 5 marca como falha a rejeição de um espião,
// mesmo quando o componente a trata).
const calls: unknown[] = []
let impl: (input: unknown) => Promise<unknown> = async () => ({})
vi.mock('@/modules/motorcycles/api', () => ({
  registerMotorcycle: (input: unknown) => {
    calls.push(input)
    return impl(input)
  },
}))

import { RegisterMotorcyclePage } from './RegisterMotorcyclePage'

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: '/painel/motos/nova', element: <RegisterMotorcyclePage /> },
      { path: '/painel/motos/:id', element: <p>Página da moto</p> },
      { path: '/painel', element: <p>Painel</p> },
    ],
    { initialEntries: ['/painel/motos/nova'] },
  )
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

async function fillRequired(user: ReturnType<typeof userEvent.setup>, plate = 'ABC1D23') {
  await user.type(screen.getByLabelText('Marca'), 'Honda')
  await user.type(screen.getByLabelText('Modelo'), 'CB 500F')
  await user.type(screen.getByLabelText('Ano de fabricação'), '2022')
  await user.type(screen.getByLabelText('Placa'), plate)
  await user.type(screen.getByLabelText('Quilometragem atual'), '12400')
}

describe('RegisterMotorcyclePage', () => {
  beforeEach(() => {
    calls.length = 0
    impl = async () => ({})
  })

  it('não envia com campos obrigatórios vazios e mostra os motivos', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Criar passaporte' }))
    expect(calls).toHaveLength(0)
    expect(screen.getByText('Informe a marca.')).toBeInTheDocument()
    expect(screen.getByText('Informe a placa.')).toBeInTheDocument()
    expect(screen.getByLabelText('Marca')).toHaveFocus()
  })

  it('cria o passaporte e abre a página da moto', async () => {
    impl = async () => ({ status: 'created', motorcycle_id: 'm1', public_id: 'p1' })
    const user = userEvent.setup()
    const router = renderPage()
    await fillRequired(user, 'abc-1d23')
    await user.click(screen.getByRole('button', { name: 'Criar passaporte' }))
    expect(calls[0]).toMatchObject({ brand: 'Honda', plate: 'ABC1D23', manufacturingYear: 2022, currentMileage: 12400 })
    expect(await screen.findByText('Página da moto')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/painel/motos/m1')
  })

  it('placa já cadastrada: explica a verificação sem mostrar dados da outra moto', async () => {
    impl = async () => ({ status: 'verification_required', claim_id: 'c1' })
    const user = userEvent.setup()
    renderPage()
    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Criar passaporte' }))
    expect(await screen.findByRole('heading', { name: 'Placa já cadastrada' })).toBeInTheDocument()
    expect(screen.getByText(/solicitação de verificação/)).toBeInTheDocument()
  })

  it('mostra a mensagem do banco quando o limite do plano é atingido', async () => {
    impl = () => Promise.reject({ code: 'P0001', message: 'Limite de motocicletas do seu plano atingido.' })
    const user = userEvent.setup()
    renderPage()
    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Criar passaporte' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Limite de motocicletas do seu plano atingido.')
  })
})
