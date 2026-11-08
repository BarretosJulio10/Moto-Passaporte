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
