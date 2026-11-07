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

vi.mock('./billingApi', async () => {
  const actual = await vi.importActual<typeof import('./billingApi')>('./billingApi')
  return {
    ...actual,
    fetchMySubscription: async () => sub,
    fetchMyPayments: async () =>
      sub ? [{ id: 'p1', status: 'approved', amount_cents: 990, currency: 'BRL', paid_at: '2026-11-07T12:00:00Z', created_at: '2026-11-07T12:00:00Z', plan_name: 'Premium mensal' }] : [],
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
vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api')
  return {
    ...actual,
    fetchMyPlan: async () => ({ code: 'gratuito', kind: 'free', name: 'Gratuito', billing_period: 'none', max_motorcycles: 1, storage_quota_mb: 100, motorcycles_used: 1, features: [], entitlements: [], max_share_links: 3 }),
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
    adminListPaymentEvents: async () => [{ id: 1, provider: 'mercadopago', event_type: 'payment', action: null, resource_id: '123', request_id: 'r', signature_valid: false, result: 'invalid_signature', detail: null, received_at: '2026-11-07T12:00:00Z', processed_at: null }],
  }
})

import { MyPlanPage } from './MyPlanPage'
import { PlansGrid } from './PlansGrid'
import { AdminSubscriptionsPage } from '@/modules/admin/AdminSubscriptionsPage'

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
  sub = null
  billingEnabled = true
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
    await user.click(screen.getByRole('button', { name: 'Conciliar agora' }))
    expect(await screen.findByText(/2 de 2 assinatura/)).toBeVisible()
  })
})
