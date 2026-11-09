import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, Link, Outlet } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const decided: Array<[string, boolean, boolean]> = []
let pending = [{ id: 'a1', motorcycle_id: 'm1', motorcycle_label: 'Kawasaki Versys 1000', workshop_name: 'Hyeper tracker moto',
  workshop_city: 'Barretos', workshop_state: 'SP', message: 'Revisão de 20 mil', requested_at: '2026-11-09T10:00:00Z' }]

vi.mock('./api', () => ({
  fetchPendingRequests: async () => pending,
  decideAccess: async (id: string, approve: boolean, asOrigin: boolean) => { decided.push([id, approve, asOrigin]); pending = [] },
}))

async function setup() {
  const { PendingAccessPopup } = await import('./PendingAccessPopup')
  const Layout = () => (<><PendingAccessPopup userId="u1" /><Link to="/outra">ir</Link><Outlet /></>)
  const router = createMemoryRouter([{ element: <Layout />, children: [{ path: '/painel', element: <p>painel</p> }, { path: '/outra', element: <p>outra</p> }] }], { initialEntries: ['/painel'] })
  render(<QueryClientProvider client={new QueryClient()}><RouterProvider router={router} /></QueryClientProvider>)
}

describe('pedido de acesso de oficina em destaque', () => {
  it('abre ao entrar, fecha em "Decidir depois" e volta ao trocar de tela', async () => {
    await setup()
    expect(await screen.findByRole('dialog', { name: /Uma oficina pediu acesso/ })).toBeInTheDocument()
    expect(screen.getByText('Kawasaki Versys 1000')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Decidir depois' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'ir' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('autoriza direto pela janela', async () => {
    await setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Autorizar' }))
    expect(decided.at(-1)).toEqual(['a1', true, false])
  })
})
