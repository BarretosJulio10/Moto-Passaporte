import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ReactElement } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { computeTotals, quoteWhatsappText, waNumber, whatsappUrl } from './api'
import { centsToInput, parseMoney } from '../shared/rpc'
import { approvedTotal, type PublicQuote, type PublicQuoteResult } from '../quote-approval/api'

vi.mock('@/modules/sharing/qr', () => ({ qrSvg: async () => '<svg></svg>' }))

let publicResult: PublicQuoteResult = { state: 'not_found' }
const decideCalls: unknown[][] = []
vi.mock('../quote-approval/api', async () => {
  const actual = await vi.importActual<typeof import('../quote-approval/api')>('../quote-approval/api')
  return {
    ...actual,
    fetchPublicQuote: async () => publicResult,
    decideQuote: async (...args: unknown[]) => {
      decideCalls.push(args)
      const positions = args[1] as number[]
      const p = publicResult as PublicQuote
      return {
        ...p, state: 'decided',
        decision: {
          decision: positions.length === 0 ? 'rejected' : positions.length === p.items.length ? 'approved' : 'partial',
          approved_positions: positions, rejected_positions: p.items.map((i) => i.position).filter((x) => !positions.includes(x)),
          approved_total_cents: actual.approvedTotal(p, positions), signer_name: String(args[2]), reason: null, receipt_code: 'ABC123DEF0',
          created_at: '2026-11-08T15:00:00Z', terms_version: 'orcamento-v1',
        },
      } satisfies PublicQuote
    },
  }
})

const quote: PublicQuote = {
  state: 'open', terms_version: 'orcamento-v1', number: 12, version_no: 2, status: 'viewed', is_complement: false,
  complement_reason: null, parent_number: null, issued_at: '2026-11-08T12:00:00Z', valid_until: '2026-11-15', km: 18200,
  problem: 'Barulho na corrente', diagnosis: 'Relação gasta', notes: null, payment_terms: 'Pix', estimated_days: 2,
  subtotal_cents: 38500, discount_type: 'percent', discount_value: 10, discount_cents: 3850, total_cents: 34650,
  customer_name: 'João da Silva', vehicle: { brand: 'Honda', model: 'CG 160', version: null, year: 2022, plate: 'ABC1D23', color: null },
  workshop: { business_name: 'Oficina do Carlos', cnpj: null, phone: null, whatsapp: '17999991234', email: null, address: null, city: 'Barretos', state: 'SP', logo_url: null, public_slug: null },
  items: [
    { position: 1, kind: 'labor', description: 'Troca de óleo', quantity: 1, unit_price_cents: 5500, subtotal_cents: 5500, notes: null },
    { position: 2, kind: 'part', description: 'Kit relação', quantity: 1, unit_price_cents: 25000, subtotal_cents: 25000, notes: null },
    { position: 3, kind: 'labor', description: 'Revisão de freios', quantity: 1, unit_price_cents: 8000, subtotal_cents: 8000, notes: null },
  ],
  decision: null,
}

describe('cálculo do orçamento', () => {
  it('soma itens e aplica desconto em % ou em R$ igual ao servidor', () => {
    const items = [{ quantity: 1, unit_price_cents: 5500 }, { quantity: 2, unit_price_cents: 12500 }, { quantity: 1.5, unit_price_cents: 3333 }]
    expect(computeTotals(items, 'none', 0)).toEqual({ subtotal_cents: 35500, discount_cents: 0, total_cents: 35500 })
    expect(computeTotals(items, 'percent', 10)).toEqual({ subtotal_cents: 35500, discount_cents: 3550, total_cents: 31950 })
    expect(computeTotals(items, 'amount', 50)).toEqual({ subtotal_cents: 35500, discount_cents: 5000, total_cents: 30500 })
    expect(computeTotals(items, 'amount', 9999).total_cents).toBe(0)
  })

  it('aprovação parcial recalcula com desconto proporcional', () => {
    expect(approvedTotal(quote, [1, 2])).toBe(27450)
    expect(approvedTotal(quote, [1, 2, 3])).toBe(34650)
    expect(approvedTotal({ ...quote, discount_type: 'amount', discount_value: 38.5, discount_cents: 3850 }, [3])).toBe(7200)
  })

  it('lê valores em reais no formato brasileiro', () => {
    expect(parseMoney('1.234,56')).toBe(123456)
    expect(parseMoney('R$ 85')).toBe(8500)
    expect(parseMoney('12.5')).toBe(1250)
    expect(parseMoney('abc')).toBeNull()
    expect(parseMoney('')).toBeNull()
    expect(centsToInput(123456)).toBe('1234,56')
  })

  it('mensagem do WhatsApp leva o link e não expõe dados internos', () => {
    const text = quoteWhatsappText({ customerName: 'João da Silva', workshopName: 'Oficina do Carlos', number: 12, vehicle: 'Honda CG 160 2022',
      totalCents: 34650, validUntil: '2026-11-15', link: 'https://x/orcamento/tok' })
    expect(text).toContain('Olá, João!')
    expect(text).toContain('nº 12')
    expect(text).toContain('https://x/orcamento/tok')
    expect(text).toMatch(/R\$\s?346,50/)
    expect(waNumber('17999991234')).toBe('5517999991234')
    expect(whatsappUrl('', 'oi')).toBe('https://wa.me/?text=oi')
  })
})

function renderApproval() {
  const router = createMemoryRouter([{ path: '/orcamento/:token', element: <Page /> }], { initialEntries: ['/orcamento/abc'] })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)
}
let Page: () => ReactElement

describe('página de aprovação do cliente', () => {
  beforeEach(async () => {
    decideCalls.length = 0
    Page = (await import('../quote-approval/QuoteApprovalPage')).QuoteApprovalPage
  })

  it('aprova só parte dos itens com nome e confirmação, e mostra o comprovante', async () => {
    publicResult = quote
    const user = userEvent.setup()
    renderApproval()
    expect(await screen.findByRole('heading', { name: 'Orçamento nº 12' })).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: /3\. Revisão de freios/ }))
    expect(screen.getByRole('button', { name: 'Aprovar 2 itens' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Aprovar 2 itens' }))
    expect(await screen.findByText('Escreva o seu nome completo.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Seu nome completo'), 'João da Silva')
    await user.click(screen.getByRole('button', { name: 'Aprovar 2 itens' }))
    expect(await screen.findByText('Marque a confirmação para continuar.')).toBeInTheDocument()
    await user.click(screen.getByLabelText(/Autorizo somente os itens marcados/))
    await user.click(screen.getByRole('button', { name: 'Aprovar 2 itens' }))
    expect(await screen.findByText('Resposta registrada')).toBeInTheDocument()
    expect(decideCalls[0]?.slice(0, 4)).toEqual(['abc', [1, 2], 'João da Silva', true])
    expect(screen.getAllByText(/ABC123DEF0/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Recusado pelo cliente').length).toBeGreaterThan(0)
  })

  it('link substituído ou inexistente não mostra o orçamento', async () => {
    publicResult = { state: 'replaced', workshop: 'Oficina do Carlos' }
    renderApproval()
    expect(await screen.findByText('Este link foi substituído')).toBeInTheDocument()
    expect(screen.queryByText('Troca de óleo')).not.toBeInTheDocument()
  })

  it('orçamento vencido não pode ser aprovado', async () => {
    publicResult = { ...quote, state: 'expired' }
    renderApproval()
    expect(await screen.findByText('O prazo deste orçamento terminou')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Aprovar/ })).not.toBeInTheDocument()
  })
})
