import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { itemNet, orderLink } from './api'
import { toReceipt } from './OrderPage'
import type { Order } from './api'

const calls: { fn: string; args: Record<string, unknown> | undefined }[] = []
let result: unknown = { state: 'not_found' }
vi.mock('../shared/rpc', async () => {
  const actual = await vi.importActual<typeof import('../shared/rpc')>('../shared/rpc')
  return {
    ...actual,
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      calls.push({ fn, args })
      if (fn === 'ack_service_order_entry') {
        const r = result as { entry: Record<string, unknown> }
        return { ...r, entry: { ...r.entry, customer_ack_at: '2026-11-08T15:20:00Z', customer_ack_name: args?.p_name } }
      }
      return result
    },
  }
})

const entryPub = {
  state: 'open', purpose: 'entry_ack', number: 7, status: 'awaiting_execution', opened_at: '2026-11-08T15:00:00Z', km_in: 18210, km_out: null,
  completed_at: null, delivered_at: null, delivered_to_name: null, receipt_code: null, completion_notes: null, final_total_cents: null,
  adjustment_cents: null, adjustment_reason: null, customer_name: 'João da Silva',
  vehicle: { brand: 'Honda', model: 'CG 160', version: null, year: 2022, plate: 'ABC1D23', color: null },
  workshop: { business_name: 'Oficina do Carlos', cnpj: null, phone: null, whatsapp: null, email: null, address: null, city: null, state: null, logo_url: null },
  entry: { items: { carenagem: { state: 'avaria', note: 'Risco no tanque' }, pneus: { state: 'ok' } }, fuel_level: '1/2', keys_count: 1, km: 18210, notes: null,
    recorded_at: '2026-11-08T15:05:00Z', customer_ack_at: null, customer_ack_name: null },
  exit: null, photos_count: 2, items: null,
}

async function renderPublic() {
  const { OrderPublicPage } = await import('./OrderPublicPage')
  const router = createMemoryRouter([{ path: '/os/:token', element: <OrderPublicPage /> }], { initialEntries: ['/os/tok'] })
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>)
}

describe('ordem de serviço', () => {
  beforeEach(() => { calls.length = 0 })

  it('valor do item já desconta a parte do desconto do orçamento', () => {
    expect(itemNet({ subtotal_cents: 5500, discount_cents: 550 })).toBe(4950)
    expect(orderLink('abc', 'https://x')).toBe('https://x/os/abc')
  })

  it('comprovante separa executados de não executados e mostra a origem da autorização', () => {
    const order = {
      number: 7, created_at: '2026-11-08T15:00:00Z', completed_at: '2026-11-09T16:00:00Z', delivered_at: null, delivered_to_name: null,
      receipt_code: 'A1B2', customer: { full_name: 'João' }, vehicle: null, km_in: 1, km_out: 2, adjustment_cents: 0, adjustment_reason: null,
      final_total_cents: 5950, completion_notes: null, photos: [], inspections: {}, workshop: { business_name: 'X' },
      items: [
        { position: 1, kind: 'labor', description: 'Óleo', quantity: 1, subtotal_cents: 5500, discount_cents: 550, status: 'done', source: 'quote', quote_number: 12, auth_method: null, auth_by_name: null, part_brand: null, part_code: null, notes: null },
        { position: 2, kind: 'part', description: 'Parafuso', quantity: 4, subtotal_cents: 1000, discount_cents: 0, status: 'done', source: 'manual', quote_number: null, auth_method: 'telefone', auth_by_name: 'João', part_brand: null, part_code: null, notes: null },
      ],
    } as unknown as Order
    const r = toReceipt(order)
    expect(r.items.map((i) => i.net_cents)).toEqual([4950, 1000])
    expect(r.items[0]?.origin).toBe('Orçamento nº 12')
    expect(r.items[1]?.origin).toBe('Autorizado por telefone por João')
  })

  it('cliente confere o checklist de entrada e dá ciência com nome e confirmação', async () => {
    result = entryPub
    const user = userEvent.setup()
    await renderPublic()
    expect(await screen.findByRole('heading', { name: 'Estado da moto na entrada' })).toBeInTheDocument()
    expect(screen.getByText('Risco no tanque')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirmar ciência' }))
    expect(await screen.findByText('Escreva o seu nome completo.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Seu nome completo'), 'João da Silva')
    await user.click(screen.getByLabelText(/Conferi e estou ciente/))
    await user.click(screen.getByRole('button', { name: 'Confirmar ciência' }))
    expect(await screen.findByText('Ciência registrada')).toBeInTheDocument()
    expect(calls.find((c) => c.fn === 'ack_service_order_entry')?.args).toEqual({ p_token: 'tok', p_name: 'João da Silva', p_confirmed: true })
  })

  it('link desativado não mostra dados', async () => {
    result = { state: 'inactive', workshop: 'Oficina do Carlos' }
    await renderPublic()
    expect(await screen.findByText('Este link não está mais ativo')).toBeInTheDocument()
  })
})

describe('histórico da moto na OS', () => {
  const base = {
    motorcycle_id: 'm1', record_id: null, published_at: null, suggested_category: 'oil_change', suggested_title: 'Troca de óleo',
    done_items: 1, record: null, photos_in_history: 0, photo_ids_in_history: [], vehicle_label: 'Honda CG 160',
  }
  const order = { id: 'os1', number: 7, photos: [] } as unknown as Order

  async function renderCard(history: Record<string, unknown>) {
    const { HistoryCard } = await import('./HistoryCard')
    const router = createMemoryRouter([{ path: '/', element: <HistoryCard orgId="org" order={order} history={history as never} canManage onChanged={async () => undefined} /> }])
    render(<RouterProvider router={router} />)
  }

  it('moto sem passaporte explica que o atendimento fica só na oficina', async () => {
    await renderCard({ ...base, state: 'not_linked', motorcycle_id: null })
    expect(screen.getByText(/não está vinculada a um passaporte/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Registrar no histórico' })).not.toBeInTheDocument()
  })

  it('registrada: mostra o registro, link para o histórico e correção (sem apagar o original)', async () => {
    await renderCard({ ...base, state: 'published', record_id: 'r1', published_at: '2026-11-09T16:00:00Z',
      record: { id: 'r1', title: 'Troca de óleo', category: 'oil_change', service_date: '2026-11-09', mileage: 18240, superseded: false } })
    expect(screen.getByRole('link', { name: 'Ver no histórico' })).toHaveAttribute('href', '/oficina/org/motos/m1')
    expect(screen.getByRole('link', { name: 'Corrigir registro' })).toHaveAttribute('href', '/oficina/org/motos/m1/servico?corrigir=r1')
    expect(screen.getByText(/o original fica preservado/)).toBeInTheDocument()
  })

  it('pronta para registrar: envia categoria, título e valor escolhidos', async () => {
    const user = userEvent.setup()
    await renderCard({ ...base, state: 'ready' })
    await user.click(screen.getByLabelText('Mostrar o valor do serviço ao titular'))
    await user.click(screen.getByRole('button', { name: 'Registrar no histórico' }))
    const call = calls.find((c) => c.fn === 'workshop_publish_order_to_history')
    expect(call?.args).toEqual({ p_org: 'org', p_order: 'os1', p_category: 'oil_change', p_title: 'Troca de óleo', p_include_value: false })
  })
})
