import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AdminUserRow, AdminWorkshopRow, Metrics } from './adminApi'

const calls: Array<{ fn: string; args: unknown[] }> = []

const metrics: Metrics = {
  users_total: 1234, users_new_7d: 12, users_new_30d: 80, users_restricted: 1, motorcycles_total: 980, motorcycles_new_7d: 9,
  workshops_total: 40, workshops_active: 38, workshops_unverified: 5, records_total: 5000, records_30d: 300, subscriptions_active: 120,
  subscriptions_past_due: 3, subscriptions_canceling: 4, mrr_cents: 118800, payments_pending: 2, payments_rejected_30d: 6, invoices_failed: 3,
  storage_bytes: 5 * 1024 * 1024 * 1024, files_total: 8700, transfers_pending: 2, access_requests_pending: 7, claims_pending: 1, reports_30d: 25,
  billing_environment: 'production',
}
const users: AdminUserRow[] = [
  { id: 'u1', full_name: 'Bruno Lima', email_masked: 'br•••@exemplo.com', created_at: '2026-10-01T12:00:00Z', account_status: 'active', motorcycles: 2, plan_name: 'Premium mensal', is_admin: false, workshops: 0 },
  { id: 'u2', full_name: 'Julio Admin', email_masked: 'ju•••@exemplo.com', created_at: '2026-09-01T12:00:00Z', account_status: 'active', motorcycles: 0, plan_name: 'Gratuito', is_admin: true, workshops: 0 },
]
const workshops: AdminWorkshopRow[] = [
  { id: 'o1', business_name: 'Oficina do Zé', city: 'Niterói', state: 'RJ', public_slug: 'oficina-do-ze', status: 'active', verification_status: 'unverified',
    members: 3, active_accesses: 12, records: 40, responsible_name: 'José', created_at: '2026-08-01T12:00:00Z' },
]

vi.mock('./adminApi', async () => {
  const actual = await vi.importActual<typeof import('./adminApi')>('./adminApi')
  return {
    ...actual,
    fetchMetrics: async () => metrics,
    listUsers: async (q: string) => { calls.push({ fn: 'listUsers', args: [q] }); return users },
    getUserDetail: async (...args: unknown[]) => {
      calls.push({ fn: 'getUser', args })
      return { id: 'u1', full_name: 'Bruno Lima', email: 'bruno@exemplo.com', phone: '21999990000', created_at: '', last_sign_in_at: null,
        account_status: 'active', status_reason: null, status_changed_at: null, roles: ['owner'], plan: 'Premium mensal',
        motorcycles: [{ id: 'm1', name: 'Honda CG 160', year: 2022, plate: 'ABC1D23', since: '' }], workshops: [], subscription: null }
    },
    setUserStatus: async (...args: unknown[]) => { calls.push({ fn: 'setUserStatus', args }) },
    listWorkshops: async () => workshops,
    setWorkshopStatus: async (...args: unknown[]) => { calls.push({ fn: 'setWorkshopStatus', args }) },
    setWorkshopVerification: async (...args: unknown[]) => { calls.push({ fn: 'setWorkshopVerification', args }) },
  }
})
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: () => ({ select: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }),
  }),
}))

import { AdminDashboardPage } from './AdminDashboardPage'
import { AdminUsersPage } from './AdminUsersPage'
import { AdminWorkshopsPage } from './AdminWorkshopsPage'
import { validReason } from './adminApi'

function wrap(node: React.ReactNode) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  calls.length = 0
})

describe('motivo de ações administrativas', () => {
  it('exige ao menos 10 caracteres', () => {
    expect(validReason('curto')).toMatch(/10 caracteres/)
    expect(validReason('Atendimento ao usuário')).toBeNull()
  })
})

describe('dashboard administrativo', () => {
  it('mostra indicadores agrupados e destaca problemas', async () => {
    wrap(<AdminDashboardPage />)
    const uso = await screen.findByRole('region', { name: 'Uso' })
    expect(await within(uso).findByRole('link', { name: '1.234' })).toHaveAttribute('href', '/admin/usuarios')
    const receita = screen.getByRole('region', { name: 'Assinaturas e receita' })
    expect(within(receita).getByText('R$ 1.188,00')).toBeVisible()
    expect(within(receita).getByText('3')).toHaveClass('text-danger')
    expect(screen.getByText('5 GB')).toBeVisible()
    expect(screen.getByRole('link', { name: /Verificar cadastros, suspender/ })).toHaveAttribute('href', '/admin/oficinas')
  })
})

describe('usuários', () => {
  it('lista com e-mail mascarado e só abre dados com motivo', async () => {
    const user = userEvent.setup()
    wrap(<AdminUsersPage />)
    expect(await screen.findByText(/br•••@exemplo\.com/)).toBeVisible()
    await user.click(screen.getAllByRole('button', { name: 'Ver dados' })[0]!)
    const form = screen.getByRole('form', { name: /Por que você precisa ver/ })
    await user.click(within(form).getByRole('button', { name: 'Ver dados' }))
    expect(within(form).getByText(/pelo menos 10 caracteres/)).toBeVisible()
    expect(calls.some((c) => c.fn === 'getUser')).toBe(false)
    await user.type(within(form).getByLabelText(/Motivo/), 'Atendimento: pedido de suporte por e-mail')
    await user.click(within(form).getByRole('button', { name: 'Ver dados' }))
    expect(calls.find((c) => c.fn === 'getUser')!.args).toEqual(['u1', 'Atendimento: pedido de suporte por e-mail'])
    const region = await screen.findByRole('region', { name: 'Dados de Bruno Lima' })
    expect(within(region).getByText('bruno@exemplo.com')).toBeVisible()
    expect(within(region).getByText(/Honda CG 160 2022/)).toBeVisible()
  })

  it('suspende com motivo; administradores não têm botão de suspensão', async () => {
    const user = userEvent.setup()
    wrap(<AdminUsersPage />)
    await user.click((await screen.findAllByRole('button', { name: 'Ver dados' }))[0]!)
    await user.type(screen.getByLabelText(/Motivo/), 'Atendimento: denúncia recebida')
    await user.click(within(screen.getByRole('form')).getByRole('button', { name: 'Ver dados' }))
    const region = await screen.findByRole('region', { name: 'Dados de Bruno Lima' })
    await user.click(within(region).getByRole('button', { name: 'Suspender' }))
    await user.type(within(region).getByLabelText(/Motivo/), 'Denúncia de uso indevido em análise')
    await user.click(within(region).getByRole('button', { name: 'Confirmar' }))
    expect(calls.find((c) => c.fn === 'setUserStatus')!.args).toEqual(['u1', 'suspended', 'Denúncia de uso indevido em análise'])
  })
})

describe('oficinas', () => {
  it('verifica com motivo', async () => {
    const user = userEvent.setup()
    wrap(<AdminWorkshopsPage />)
    expect(await screen.findByText('Oficina do Zé')).toBeVisible()
    expect(screen.getByText('Não verificada')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Verificar' }))
    const form = screen.getByRole('form', { name: 'Marcar como verificada' })
    await user.type(within(form).getByLabelText(/Motivo/), 'CNPJ e endereço conferidos')
    await user.click(within(form).getByRole('button', { name: 'Confirmar' }))
    expect(calls.find((c) => c.fn === 'setWorkshopVerification')!.args).toEqual(['o1', 'verified', 'CNPJ e endereço conferidos'])
  })
})
