import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { MySubscription } from './billingApi'
import type { PublicPlan } from './api'

const calls: string[] = []
let sub: MySubscription | null = null
let billingEnabled = true
let passes: unknown[] = []

vi.mock('./billingApi', async () => {
  const actual = await vi.importActual<typeof import('./billingApi')>('./billingApi')
  return {
    ...actual,
    fetchMySubscription: async () => sub,
    fetchMyPayments: async () =>
      sub ? [{ id: 'p1', status: 'approved', amount_cents: 990, currency: 'BRL', paid_at: '2026-11-07T12:00:00Z', created_at: '2026-11-07T12:00:00Z', plan_name: 'Premium mensal' }] : [],
    fetchMyInvoices: async () =>
      sub
        ? [
            { id: 'i2', number: 'MP-2026-000002', plan_name: 'Premium mensal', period_start: '2026-12-07T12:00:00Z', period_end: '2027-01-07T12:00:00Z', amount_cents: 990, currency: 'BRL', due_date: '2026-12-07', status: 'failed', attempts: 1, paid_at: null },
            { id: 'i1', number: 'MP-2026-000001', plan_name: 'Premium mensal', period_start: '2026-11-07T12:00:00Z', period_end: '2026-12-07T12:00:00Z', amount_cents: 990, currency: 'BRL', due_date: '2026-11-07', status: 'paid', attempts: 0, paid_at: '2026-11-07T12:00:00Z' },
          ]
        : [],
    fetchInvoiceReceipt: async () => ({
      number: 'MP-2026-000001', status: 'paid', plan_name: 'Premium mensal', billing_period: 'monthly', period_start: '2026-11-07T12:00:00Z',
      period_end: '2026-12-07T12:00:00Z', amount_cents: 990, currency: 'BRL', paid_at: '2026-11-07T12:00:00Z', environment: 'test',
      payment_reference: 'ap:123', customer_name: 'Ana Souza', customer_email: 'ana@exemplo.com',
    }),
    fetchMyPasses: async () => passes,
    startPassPayment: async (code: string) => {
      calls.push(`pass:${code}`)
      return 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=x'
    },
    syncPassPayments: async () => {
      calls.push('sync_pass')
      return { ok: true }
    },
    startSubscription: async (code: string) => {
      calls.push(`subscribe:${code}`)
      return 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=x'
    },
    cancelSubscription: async () => {
      calls.push('cancel')
      return { ok: true }
    },
    syncSubscription: async () => {
      calls.push('sync')
      return { ok: true }
    },
    reconcileSubscriptions: async () => {
      calls.push('reconcile')
      return { ok: true, checked: 2, synced: 2, failures: [] }
    },
  }
})
const FREE_PLAN = { code: 'gratuito', kind: 'free', name: 'Gratuito', billing_period: 'none', max_motorcycles: 1, storage_quota_mb: 100, motorcycles_used: 1, features: [], entitlements: [], max_share_links: 3 }
let myPlan: Record<string, unknown> = FREE_PLAN
vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api')
  return {
    ...actual,
    fetchMyPlan: async () => myPlan,
  }
})
vi.mock('@/modules/attachments/api', () => ({ getStorageUsage: async () => ({ used_bytes: 0, quota_bytes: 104857600, max_file_bytes: 1 }) }))
vi.mock('@/core/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'u1', user_metadata: {} } }) }))
const PLANS: PublicPlan[] = [
  { code: 'gratuito', kind: 'free', billing_period: 'none', name: 'Gratuito', description: null, price_cents: 0, currency: 'BRL', price_note: null, max_motorcycles: 1, storage_quota_mb: 100, features: [], trial_days: 0, cancellation_text: null, entitlements: [], max_share_links: 3 },
  { code: 'premium_mensal', kind: 'premium', billing_period: 'monthly', name: 'Premium mensal', description: null, price_cents: 990, currency: 'BRL', price_note: null, max_motorcycles: 3, storage_quota_mb: 500, features: [], trial_days: 0, cancellation_text: null, entitlements: ['pdf_reports', 'maintenance_reminders'], max_share_links: 10 },
]
vi.mock('@/modules/public_site/usePublicSettings', () => ({
  usePublicSettings: () => ({ data: { plans: PLANS, billingEnabled, freePlanMaxMotorcycles: 1, supportEmail: null, supportWhatsapp: null } }),
}))
vi.mock('@/modules/admin/paymentsApi', async () => {
  const actual = await vi.importActual<typeof import('@/modules/admin/paymentsApi')>('@/modules/admin/paymentsApi')
  return {
    ...actual,
    adminListSubscriptions: async () => [{ id: 's1', user_name: 'Ana Souza', plan_name: 'Premium mensal', billing_period: 'monthly', price_cents: 990, status: 'active', provider_status: 'authorized', environment: 'test', current_period_end: '2026-12-07T12:00:00Z', created_at: '', last_synced_at: null, payments_approved: 1 }],
    adminListInvoices: async () => [{ id: 'i1', number: 'MP-2026-000001', user_name: 'Ana Souza', plan_name: 'Premium mensal', period_start: '2026-11-07T12:00:00Z', period_end: '2026-12-07T12:00:00Z', amount_cents: 990, due_date: '2026-11-07', status: 'paid', attempts: 0, paid_at: '2026-11-07T12:00:00Z', environment: 'test' }],
    adminListPaymentEvents: async () => [{ id: 1, provider: 'mercadopago', event_type: 'payment', action: null, resource_id: '123', request_id: 'r', signature_valid: false, result: 'invalid_signature', detail: null, received_at: '2026-11-07T12:00:00Z', processed_at: null }],
  }
})

import { MyPlanPage, PaidUntil } from './MyPlanPage'
import { daysLeft } from './billingApi'
import { PlansGrid } from './PlansGrid'
import { AdminSubscriptionsPage } from '@/modules/admin/AdminSubscriptionsPage'
import { ReceiptPage } from './ReceiptPage'
import { Route, Routes } from 'react-router-dom'

function wrap(node: React.ReactNode, path = '/painel/plano') {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>
    </QueryClientProvider>,
  )
}

const active = (over: Partial<MySubscription> = {}): MySubscription => ({
  id: 's1', plan_name: 'Premium mensal', billing_period: 'monthly', price_cents: 990, status: 'active',
  current_period_end: '2026-12-07T12:00:00Z', started_at: '2026-11-07T12:00:00Z', canceled_at: null, past_due_since: null,
  grace_until: null, has_access: true, environment: 'production', ...over,
})

beforeEach(() => {
  calls.length = 0
  myPlan = FREE_PLAN
  passes = []
  sub = null
  billingEnabled = true
})

describe('Premium por período (Pix, débito, boleto)', () => {
  it('oferece cartão e Pix lado a lado; Pix leva ao checkout do Mercado Pago', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    const user = userEvent.setup()
    wrap(<MyPlanPage />)
    expect(await screen.findByRole('button', { name: 'Assinar Premium mensal' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Pagar Premium mensal com Pix, débito ou boleto' }))
    expect(calls).toContain('pass:premium_mensal')
    expect(assign).toHaveBeenCalledWith(expect.stringContaining('mercadopago.com.br/checkout'))
    expect(screen.getByText(/sem cartão salvo/)).toBeVisible()
    vi.unstubAllGlobals()
  })

  it('conta os dias e só convida a renovar perto do fim', () => {
    const now = new Date('2026-11-08T12:00:00-03:00')
    expect(daysLeft('2026-11-28T03:00:00Z', now)).toBe(20)
    const { rerender } = render(<PaidUntil until="2027-01-30T03:00:00Z" now={now} />)
    expect(screen.getByRole('status')).toHaveTextContent('Premium pago até 29/01/2027.')
    expect(screen.queryByText('Renovar agora')).toBeNull()
    rerender(<PaidUntil until="2026-11-23T03:00:00Z" now={now} />)
    expect(screen.getByRole('status')).toHaveTextContent('faltam 15 dias')
    expect(screen.getByText('Renovar agora')).toBeVisible()
    rerender(<PaidUntil until="2026-11-15T03:00:00Z" now={now} />)
    expect(screen.getByRole('alert')).toHaveTextContent('faltam 7 dias')
    rerender(<PaidUntil until="2026-11-09T03:00:00Z" now={now} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Seu Premium vence hoje (08/11/2026).')
  })

  it('mostra o histórico e confere o pagamento ao voltar do Mercado Pago', async () => {
    myPlan = { ...FREE_PLAN, kind: 'premium', name: 'Premium semestral', paid_until: '2027-05-09T03:00:00Z' }
    passes = [{ id: 'x1', plan_name: 'Premium semestral', months: 6, price_cents: 4990, status: 'paid', payment_method: 'bank_transfer',
      starts_at: '2026-11-08T15:00:00Z', ends_at: '2027-05-09T03:00:00Z', paid_at: '2026-11-08T15:00:00Z', created_at: '2026-11-08T15:00:00Z', checkout_url: null }]
    wrap(<MyPlanPage />, '/painel/plano?pagamento=retorno')
    expect(await screen.findByText(/Pix costuma confirmar em segundos/)).toBeVisible()
    expect(await screen.findByText(/08\/11\/2026 a 08\/05\/2027 · Pix/)).toBeVisible()
    expect(calls).toContain('sync_pass')
    expect(screen.getByRole('heading', { name: 'Renovar ou mudar de plano' })).toBeVisible()
  })
})

describe('Meu plano — bônus Premium', () => {
  const BONUS = { ...FREE_PLAN, code: 'premium_anual', kind: 'premium', name: 'Premium anual (cortesia)', max_motorcycles: 3, bonus: true, bonus_until: '2027-02-09T03:00:00Z' }

  it('mostra até quando vai o bônus e que assinar agora só cobra depois', async () => {
    myPlan = BONUS
    wrap(<MyPlanPage />)
    expect(await screen.findByText(/Bônus Premium sem cobrança até/)).toHaveTextContent('08/02/2027')
    expect(screen.getByText(/primeira cobrança só acontece quando o bônus terminar/)).toBeVisible()
  })

  it('assinatura feita durante o bônus: primeira cobrança na data do fim do bônus', async () => {
    myPlan = BONUS
    sub = { ...active(), status: 'pending' }
    wrap(<MyPlanPage />)
    expect(await screen.findByText(/A primeira cobrança acontece em 08\/02\/2027/)).toBeVisible()
  })
})

describe('Meu plano — assinatura', () => {
  it('sem assinatura: oferece assinar e leva ao Mercado Pago', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    const user = userEvent.setup()
    wrap(<MyPlanPage />)
    await user.click(await screen.findByRole('button', { name: 'Assinar Premium mensal' }))
    expect(calls).toContain('subscribe:premium_mensal')
    expect(assign).toHaveBeenCalledWith(expect.stringContaining('mercadopago.com.br'))
    vi.unstubAllGlobals()
  })

  it('contratação desligada: sem botão de assinar', async () => {
    billingEnabled = false
    wrap(<MyPlanPage />)
    expect(await screen.findByText('Contratação em breve.')).toBeVisible()
    expect(screen.queryByRole('button', { name: /Assinar/ })).not.toBeInTheDocument()
  })

  it('ativa: mostra renovação, pagamentos e cancela com confirmação', async () => {
    sub = active()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    wrap(<MyPlanPage />)
    expect(await screen.findByText(/Próxima renovação em/)).toBeVisible()
    expect(await screen.findByText('Aprovado')).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Planos disponíveis' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancelar assinatura' }))
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('O Premium continua até'))
    expect(calls).toContain('cancel')
    expect(await screen.findByText(/Assinatura cancelada/)).toBeVisible()
    confirm.mockRestore()
  })

  it('em atraso: avisa até quando o Premium continua', async () => {
    sub = active({ status: 'past_due', grace_until: '2026-12-14T12:00:00Z' })
    wrap(<MyPlanPage />)
    expect(await screen.findByText(/A última cobrança não foi aprovada/)).toBeVisible()
  })

  it('cancelada com período pago: mantém até o fim e não oferece cancelar de novo', async () => {
    sub = active({ status: 'canceled', canceled_at: '2026-11-10T12:00:00Z' })
    wrap(<MyPlanPage />)
    expect(await screen.findByText(/O Premium continua até/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Cancelar assinatura' })).not.toBeInTheDocument()
  })

  it('volta do Mercado Pago: confere a assinatura sem ativar nada no navegador', async () => {
    wrap(<MyPlanPage />, '/painel/plano?assinatura=retorno')
    expect(await screen.findByText(/Estamos confirmando seu pagamento/)).toBeVisible()
    await vi.waitFor(() => expect(calls).toContain('sync'))
  })
})

describe('faturas e recibo', () => {
  it('lista faturas com situação e recibo só das pagas', async () => {
    sub = active()
    wrap(<MyPlanPage />)
    expect(await screen.findByText('Cobrança não aprovada')).toBeVisible()
    expect(screen.getByText(/1 tentativa\(s\) não aprovada/)).toBeVisible()
    const links = screen.getAllByRole('link', { name: 'Recibo' })
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', '/painel/plano/recibo/i1')
  })

  it('recibo mostra número, período, valor e aviso de que não é nota fiscal', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={['/painel/plano/recibo/i1']}>
          <Routes><Route path="/painel/plano/recibo/:id" element={<ReceiptPage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    const r = await screen.findByRole('article', { name: 'Recibo' })
    expect(r).toHaveTextContent('MP-2026-000001')
    expect(r).toHaveTextContent('07/11/2026 a 07/12/2026')
    expect(r).toHaveTextContent('R$ 9,90')
    expect(r).toHaveTextContent('Não é nota fiscal')
    expect(r).toHaveTextContent('Ambiente de teste')
  })
})

describe('planos no site com contratação liberada', () => {
  it('leva ao painel para assinar', () => {
    wrap(<PlansGrid plans={PLANS} billingEnabled />, '/')
    expect(screen.getByRole('link', { name: 'Assinar o Premium' })).toHaveAttribute('href', '/painel/plano')
    expect(screen.queryByText('Contratação em breve.')).not.toBeInTheDocument()
  })
})

describe('admin — assinaturas e avisos', () => {
  it('lista assinaturas, destaca aviso inválido e concilia', async () => {
    const user = userEvent.setup()
    wrap(<AdminSubscriptionsPage />, '/admin/assinaturas')
    expect(await screen.findByText('Ana Souza')).toBeVisible()
    expect(await screen.findByText(/Assinatura inválida/)).toBeVisible()
    expect(await screen.findByText(/Nº MP-2026-000001 · Ana Souza/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Conciliar agora' }))
    expect(await screen.findByText(/2 de 2 assinatura/)).toBeVisible()
  })
})
