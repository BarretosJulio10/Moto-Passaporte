import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { IncomingTransfer, OutgoingTransfer, PreviousMotorcycle } from './api'
import type { DiaryEntry } from '@/modules/diary/api'

const calls: Array<{ fn: string; args: unknown[] }> = []
let outgoing: OutgoingTransfer[] = []
let incoming: IncomingTransfer[] = []
let previous: PreviousMotorcycle[] = []
let diary: DiaryEntry[] = []

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api')
  return {
    ...actual,
    fetchMotorcycleTransfers: async () => outgoing,
    fetchIncomingTransfers: async () => incoming,
    fetchPreviousMotorcycles: async () => previous,
    createTransfer: async (...args: unknown[]) => {
      calls.push({ fn: 'create', args })
      outgoing = [{ id: 't-new', to_email: String(args[1]), message: null, status: 'pending', created_at: '2026-11-07T10:00:00Z', expires_at: '2026-11-14T10:00:00Z', decided_at: null }]
      return 't-new'
    },
    cancelTransfer: async (...args: unknown[]) => {
      calls.push({ fn: 'cancel', args })
    },
    acceptTransfer: async (...args: unknown[]) => {
      calls.push({ fn: 'accept', args })
      return 'm1'
    },
    rejectTransfer: async (...args: unknown[]) => {
      calls.push({ fn: 'reject', args })
      incoming = []
    },
  }
})
vi.mock('@/modules/diary/api', async () => {
  const actual = await vi.importActual<typeof import('@/modules/diary/api')>('@/modules/diary/api')
  return {
    ...actual,
    fetchDiary: async () => diary,
    deleteDiaryEntry: async (...args: unknown[]) => {
      calls.push({ fn: 'deleteDiary', args })
    },
  }
})
vi.mock('@/modules/attachments/api', () => ({ signedUrls: async () => ({}) }))

import { TransferSection } from './TransferSection'
import { IncomingTransfers, PreviousMotorcycles } from './IncomingTransfers'
import { PreviousDiaryPage } from './PreviousDiaryPage'

function renderRoutes(path: string, element: React.ReactNode, routePath = '/') {
  const router = createMemoryRouter(
    [
      { path: routePath, element },
      { path: '/painel/motos/:id', element: <p>página da moto</p> },
    ],
    { initialEntries: [path] },
  )
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

const inc = (over: Partial<IncomingTransfer> = {}): IncomingTransfer => ({
  id: 't1', brand: 'Honda', model: 'CB 500F', version: 'ABS', manufacturing_year: 2022, plate: 'ABC1D23', from_name: 'Bruno Lima',
  message: 'Vendida no sábado', created_at: '2026-11-07T10:00:00Z', expires_at: '2026-11-14T10:00:00Z', maintenance_count: 12, latest_mileage: 30500, ...over,
})

beforeEach(() => {
  calls.length = 0
  outgoing = []
  incoming = []
  previous = []
  diary = []
})

describe('TransferSection (titular)', () => {
  it('exige e-mail e confirmação, explica as consequências e envia', async () => {
    renderRoutes('/', <TransferSection motorcycleId="m1" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Transferir passaporte' }))
    expect(screen.getByText(/todas as oficinas autorizadas, inclusive a Oficina de Origem, perdem o acesso/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Enviar transferência' }))
    expect(screen.getByText('Informe o e-mail da conta do comprador.')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('E-mail da conta do comprador'), 'Comprador@Email.com')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar transferência' }))
    expect(screen.getByText('Confirme que entendeu o que acontece na transferência.')).toBeInTheDocument()
    expect(calls).toHaveLength(0)
    await userEvent.click(screen.getByLabelText('Entendi o que acontece na transferência.'))
    await userEvent.click(screen.getByRole('button', { name: 'Enviar transferência' }))
    expect(calls).toContainEqual({ fn: 'create', args: ['m1', 'comprador@email.com', ''] })
    expect(await screen.findByText('Transferência aguardando o comprador')).toBeInTheDocument()
  })

  it('com pedido em aberto, mostra para quem e permite cancelar', async () => {
    outgoing = [
      { id: 't1', to_email: 'comprador@email.com', message: null, status: 'pending', created_at: '2026-11-07T10:00:00Z', expires_at: '2026-11-14T10:00:00Z', decided_at: null },
      { id: 't0', to_email: 'antigo@email.com', message: null, status: 'expired', created_at: '2026-10-01T10:00:00Z', expires_at: '2026-10-08T10:00:00Z', decided_at: null },
    ]
    renderRoutes('/', <TransferSection motorcycleId="m1" />)
    expect(await screen.findByText('comprador@email.com')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Transferir passaporte' })).toBeNull()
    expect(screen.getByText('Pedidos anteriores (1)')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar transferência' }))
    expect(calls).toContainEqual({ fn: 'cancel', args: ['t1'] })
  })
})

describe('IncomingTransfers (comprador)', () => {
  it('mostra o que vem com a moto e aceita com a data da compra', async () => {
    incoming = [inc()]
    const router = renderRoutes('/', <IncomingTransfers />)
    const card = await screen.findByRole('article', { name: 'Transferência: Honda CB 500F ABS' })
    expect(within(card).getByText('Bruno Lima transferiu para você')).toBeInTheDocument()
    expect(within(card).getByText('ABC1D23')).toBeInTheDocument()
    expect(within(card).getByText('12')).toBeInTheDocument()
    expect(within(card).getByText(/Isso não substitui a transferência no DETRAN/)).toBeInTheDocument()
    await userEvent.type(within(card).getByLabelText('Data da compra (opcional)'), '2026-11-05')
    await userEvent.click(within(card).getByRole('button', { name: 'Aceitar e receber a moto' }))
    expect(calls).toContainEqual({ fn: 'accept', args: ['t1', '2026-11-05'] })
    expect(router.state.location.pathname).toBe('/painel/motos/m1')
  })

  it('recusa com confirmação', async () => {
    incoming = [inc()]
    renderRoutes('/', <IncomingTransfers />)
    await userEvent.click(await screen.findByRole('button', { name: 'Recusar' }))
    expect(calls.some((c) => c.fn === 'reject')).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: 'Recusar' }))
    expect(calls).toContainEqual({ fn: 'reject', args: ['t1'] })
  })

  it('sem pedidos, não mostra nada', async () => {
    renderRoutes('/', <IncomingTransfers />)
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByRole('heading')).toBeNull()
  })
})

describe('Motos anteriores', () => {
  beforeEach(() => {
    previous = [{ motorcycle_id: 'm9', brand: 'Yamaha', model: 'MT-03', version: null, manufacturing_year: 2020, owned_from: '2024-01-01T00:00:00Z', owned_until: '2026-11-01T00:00:00Z', my_diary_entries: 2 }]
  })

  it('lista no painel com acesso ao diário', async () => {
    renderRoutes('/', <PreviousMotorcycles />)
    expect(await screen.findByText('Yamaha MT-03, 2020')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Seu diário (2)' })).toHaveAttribute('href', '/painel/motos-anteriores/m9')
  })

  it('diário da moto anterior: só leitura e exclusão', async () => {
    diary = [{
      id: 'd1', motorcycle_id: 'm9', category: 'trip', title: 'Viagem antiga', body: null, entry_date: '2025-05-01', location: null,
      visibility: 'private', created_at: '2025-05-01T10:00:00Z', updated_at: '2025-05-01T10:00:00Z', is_mine: true, photos: [],
    }]
    renderRoutes('/painel/motos-anteriores/m9', <PreviousDiaryPage />, '/painel/motos-anteriores/:id')
    const card = await screen.findByRole('article', { name: 'Viagem antiga' })
    expect(within(card).queryByRole('link', { name: 'Editar' })).toBeNull()
    await userEvent.click(within(card).getByRole('button', { name: 'Excluir' }))
    await userEvent.click(within(card).getByRole('button', { name: 'Excluir' }))
    expect(calls).toContainEqual({ fn: 'deleteDiary', args: ['d1'] })
  })
})
