import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AdminPlan, PlanInput, PublicPlan } from './api'

const calls: Array<{ fn: string; args: unknown[] }> = []
let adminPlans: AdminPlan[] = []

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api')
  return {
    ...actual,
    adminListPlans: async () => adminPlans,
    adminSavePlan: async (p: PlanInput) => {
      calls.push({ fn: 'save', args: [p] })
      return p.id ?? 'novo'
    },
    adminSetPlanActive: async (...args: unknown[]) => {
      calls.push({ fn: 'active', args })
    },
    adminPlanHistory: async () => [
      { version: 2, changed_at: '2026-11-07T12:00:00Z', changed_by_name: 'Julio', snapshot: { name: 'Premium mensal', price_cents: 1290, features: [] } },
      { version: 1, changed_at: '2026-11-07T10:00:00Z', changed_by_name: 'Sistema', snapshot: { name: 'Premium mensal', price_cents: 990, features: [] } },
    ],
    fetchMyPlan: async () => ({
      code: 'gratuito', kind: 'free', name: 'Gratuito', billing_period: 'none', max_motorcycles: 1, storage_quota_mb: 100,
      motorcycles_used: 1, features: [], entitlements: [], max_share_links: 3,
    }),
  }
})
vi.mock('@/core/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'u1', user_metadata: {} } }) }))

import { PlansGrid } from './PlansGrid'
import { PlanSummary } from './MyPlanPage'
import { AdminPlansPage, parseDraft, type Draft } from '@/modules/admin/AdminPlansPage'

const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
function wrap(node: React.ReactNode) {
  render(<QueryClientProvider client={qc()}><MemoryRouter>{node}</MemoryRouter></QueryClientProvider>)
}

const pub = (over: Partial<PublicPlan>): PublicPlan => ({
  code: 'x', kind: 'premium', billing_period: 'monthly', name: 'X', description: null, price_cents: 990, currency: 'BRL',
  price_note: null, max_motorcycles: 3, storage_quota_mb: 500, features: [], trial_days: 0, cancellation_text: null, entitlements: [], max_share_links: 3, ...over,
})

const PUBLIC: PublicPlan[] = [
  pub({ code: 'gratuito', kind: 'free', billing_period: 'none', name: 'Gratuito', price_cents: 0, max_motorcycles: 1, storage_quota_mb: 100,
    features: ['Identidade digital da moto'] }),
  pub({ code: 'premium_mensal', name: 'Premium mensal', features: ['Relatórios em PDF'] }),
  pub({ code: 'premium_anual', billing_period: 'annual', name: 'Premium anual', price_cents: 8990, price_note: 'R$ 7,49 por mês' }),
]

const admin = (over: Partial<AdminPlan>): AdminPlan => ({
  id: 'p1', code: 'premium_mensal', kind: 'premium', billing_period: 'monthly', name: 'Premium mensal', description: null, price_cents: 990,
  currency: 'BRL', price_note: null, max_motorcycles: 3, storage_quota_mb: 500, features: ['Relatórios em PDF'], trial_days: 0,
  cancellation_text: null, is_active: true, is_public: true, sort_order: 20, version: 1, created_at: '', updated_at: '', updated_by: null,
  entitlements: ['pdf_reports'], max_share_links: 10, ...over,
})

const draft = (over: Partial<Draft> = {}): Draft => ({
  id: null, code: 'premium_promo', kind: 'premium', billing_period: 'annual', name: 'Promo', description: '', price: '79,90',
  price_note: '', max_motorcycles: '3', storage_quota_mb: '500', features: 'Um\n\n  Dois  ', trial_days: '0',
  cancellation_text: '', is_public: true, sort_order: '45', entitlements: [], max_share_links: '10', ...over,
})

beforeEach(() => {
  calls.length = 0
  adminPlans = [
    admin({ id: 'free', code: 'gratuito', kind: 'free', billing_period: 'none', name: 'Gratuito', price_cents: 0, max_motorcycles: 1, storage_quota_mb: 100, sort_order: 10 }),
    admin({}),
    admin({ id: 'p3', code: 'premium_anual', billing_period: 'annual', name: 'Premium anual', price_cents: 8990, is_active: false, sort_order: 40 }),
  ]
})

describe('validação do formulário de plano', () => {
  it('converte preço, limites e benefícios', () => {
    const p = parseDraft(draft()) as PlanInput
    expect(p.price_cents).toBe(7990)
    expect(p.features).toEqual(['Um', 'Dois'])
    expect(p.max_motorcycles).toBe(3)
  })
  it('recusa Premium sem preço, código inválido e limites fora da faixa', () => {
    expect(parseDraft(draft({ price: '0' }))).toMatch(/preço maior que zero/)
    expect(parseDraft(draft({ code: 'Com Espaço' }))).toMatch(/Código/)
    expect(parseDraft(draft({ max_motorcycles: '0' }))).toMatch(/Motos/)
    expect(parseDraft(draft({ trial_days: '120' }))).toMatch(/Teste grátis/)
    expect(parseDraft(draft({ features: Array(13).fill('x').join('\n') }))).toMatch(/12 benefícios/)
  })
  it('plano gratuito fica sempre grátis e visível', () => {
    const p = parseDraft(draft({ id: 'free', kind: 'free', price: '', is_public: false, trial_days: '30' })) as PlanInput
    expect(p.price_cents).toBe(0)
    expect(p.billing_period).toBe('none')
    expect(p.is_public).toBe(true)
    expect(p.trial_days).toBe(0)
  })
})

describe('planos no site', () => {
  it('mostra limites e preços vindos do cadastro', () => {
    wrap(<PlansGrid plans={PUBLIC} billingEnabled={false} />)
    expect(screen.getByText(/1 moto e 100 MB para anexos/)).toBeVisible()
    const prices = screen.getByRole('list', { name: 'Preços do Premium' })
    expect(within(prices).getByText('R$ 9,90')).toBeVisible()
    expect(within(prices).getByText('R$ 89,90')).toBeVisible()
    expect(within(prices).getByText('R$ 7,49 por mês')).toBeVisible()
    expect(screen.getByText('Relatórios em PDF')).toBeVisible()
    expect(screen.getByText('Contratação em breve.')).toBeVisible()
  })
  it('não anuncia "em breve" quando a contratação está liberada', () => {
    wrap(<PlansGrid plans={PUBLIC} billingEnabled />)
    expect(screen.queryByText('Contratação em breve.')).not.toBeInTheDocument()
  })
})

describe('painel do proprietário', () => {
  it('mostra o plano e o uso de motos', async () => {
    wrap(<PlanSummary />)
    expect(await screen.findByText(/1 de 1/)).toBeVisible()
    expect(screen.getByRole('link', { name: 'Ver plano' })).toHaveAttribute('href', '/painel/plano')
  })
})

describe('administração de planos', () => {
  it('lista os planos, marca os inativos e não deixa desativar o gratuito', async () => {
    wrap(<AdminPlansPage />)
    const items = await screen.findAllByRole('listitem')
    const free = items.find((li) => within(li).queryByText('Gratuito'))!
    expect(within(free).queryByRole('button', { name: 'Desativar' })).not.toBeInTheDocument()
    expect(screen.getByText('Inativo')).toBeVisible()
  })

  it('edita o preço sem reenviar código nem periodicidade', async () => {
    const user = userEvent.setup()
    wrap(<AdminPlansPage />)
    await screen.findByText('Premium mensal')
    await user.click(screen.getAllByRole('button', { name: 'Editar' })[1]!)
    const form = screen.getByRole('form', { name: 'Editar Premium mensal' })
    const price = within(form).getByLabelText('Preço (R$)')
    await user.clear(price)
    await user.type(price, '12,90')
    await user.click(within(form).getByRole('button', { name: 'Salvar' }))
    const saved = calls.find((c) => c.fn === 'save')!.args[0] as PlanInput
    expect(saved.id).toBe('p1')
    expect(saved.price_cents).toBe(1290)
  })

  it('mostra erro de validação sem chamar o servidor', async () => {
    const user = userEvent.setup()
    wrap(<AdminPlansPage />)
    await user.click(await screen.findByRole('button', { name: 'Novo plano Premium' }))
    const form = screen.getByRole('form', { name: 'Novo plano' })
    await user.click(within(form).getByRole('button', { name: 'Salvar' }))
    expect(within(form).getByText(/preço maior que zero/)).toBeVisible()
    expect(calls).toHaveLength(0)
  })

  it('reativa plano e mostra o histórico com o que mudou', async () => {
    const user = userEvent.setup()
    wrap(<AdminPlansPage />)
    await user.click(await screen.findByRole('button', { name: 'Ativar' }))
    expect(calls.find((c) => c.fn === 'active')!.args).toEqual(['p3', true])
    await user.click(screen.getAllByRole('button', { name: 'Histórico' })[1]!)
    const hist = await screen.findByRole('list', { name: 'Histórico de alterações' })
    expect(within(hist).getByText(/Alterou: preço/)).toBeVisible()
    expect(within(hist).getByText(/Criação do plano/)).toBeVisible()
  })
})
