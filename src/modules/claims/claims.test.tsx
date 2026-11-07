import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AdminClaim, MyClaim } from './api'

const calls: Array<{ fn: string; args: unknown[] }> = []
let mine: MyClaim[] = []

const adminClaim: AdminClaim = {
  id: 'c1', plate: 'ABC1D23', status: 'pending', created_at: '2026-11-05T12:00:00Z', requester_note: 'Comprei em outubro, tenho recibo.',
  resolution_note: null, resolved_at: null, resolved_by_name: null, requester_id: 'u3', requester_name: 'Carlos', requester_email_masked: 'ca•••@exemplo.com',
  requester_account_age_days: 2, motorcycle_id: 'm1', motorcycle_name: 'Honda CG 160 2020', passport_created_at: '2026-01-10T12:00:00Z',
  current_owner_id: 'u1', current_owner_name: 'Ana Souza', owner_since: '2026-01-10T12:00:00Z', plate_since: '2026-01-10T12:00:00Z',
  same_moto_claims: 1, pending_transfer: false, owner_notified_at: null,
}

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api')
  return {
    ...actual,
    fetchMyClaims: async () => mine,
    updateMyClaimNote: async (...args: unknown[]) => { calls.push({ fn: 'note', args }) },
    cancelMyClaim: async (...args: unknown[]) => { calls.push({ fn: 'cancel', args }) },
    fetchOwnershipNotices: async () => [{ claim_id: 'c9', motorcycle_id: 'm1', motorcycle_name: 'Honda CG 160 2020', notified_at: '2026-11-06T12:00:00Z' }],
    dismissOwnershipNotice: async (...args: unknown[]) => { calls.push({ fn: 'dismiss', args }) },
    adminListClaims: async () => [adminClaim],
    adminResolveClaim: async (...args: unknown[]) => { calls.push({ fn: 'resolve', args }) },
  }
})
vi.mock('@/core/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'u3', user_metadata: {} } }) }))

import { MyClaims, OwnershipNotices } from './MyClaims'
import { AdminClaimsPage } from '@/modules/admin/AdminClaimsPage'

function wrap(node: React.ReactNode) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  calls.length = 0
  mine = []
})

describe('solicitante', () => {
  it('nada a mostrar sem pedidos', () => {
    wrap(<MyClaims />)
    expect(screen.queryByText(/Pedidos de verificação/)).not.toBeInTheDocument()
  })

  it('acompanha, explica o caso e vê a resposta', async () => {
    mine = [
      { id: 'c1', plate: 'ABC1D23', status: 'pending', created_at: '2026-11-05T12:00:00Z', requester_note: null, resolution_note: null, resolved_at: null },
      { id: 'c0', plate: 'XYZ9A99', status: 'rejected', created_at: '2026-11-01T12:00:00Z', requester_note: null,
        resolution_note: 'Não encontramos evidências de compra.', resolved_at: new Date().toISOString() },
    ]
    const user = userEvent.setup()
    wrap(<MyClaims />)
    expect(await screen.findByText('Em análise')).toBeVisible()
    expect(screen.getByText(/Resposta da equipe: Não encontramos/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Explicar o caso' }))
    await user.type(screen.getByLabelText(/Conte como você tem a moto/), 'Comprei em outubro')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(calls.find((c) => c.fn === 'note')!.args).toEqual(['c1', 'Comprei em outubro'])
  })
})

describe('titular', () => {
  it('recebe aviso anônimo e dispensa', async () => {
    const user = userEvent.setup()
    wrap(<OwnershipNotices />)
    expect(await screen.findByText(/Uma pessoa informou à nossa equipe que comprou esta moto/)).toBeVisible()
    expect(screen.getByRole('link', { name: 'Abrir a moto' })).toHaveAttribute('href', '/painel/motos/m1')
    await user.click(screen.getByRole('button', { name: 'Entendi, dispensar aviso' }))
    expect(calls.find((c) => c.fn === 'dismiss')!.args[0]).toBe('c9')
  })
})

describe('admin', () => {
  it('mostra contexto e decide com resposta, aviso e motivo', async () => {
    const user = userEvent.setup()
    wrap(<AdminClaimsPage />)
    expect(await screen.findByText(/Comprei em outubro, tenho recibo/)).toBeVisible()
    expect(screen.getByText(/Ana Souza desde/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Decidir' }))
    const form = screen.getByRole('form', { name: 'Decidir pedido' })
    await user.click(within(form).getByRole('button', { name: 'Registrar decisão' }))
    expect(within(form).getByText(/resposta ao solicitante/)).toBeVisible()
    await user.type(within(form).getByLabelText(/Resposta ao solicitante/), 'Procedente. Avisamos o titular.')
    await user.type(within(form).getByLabelText(/Motivo interno/), 'Recibo de compra conferido')
    await user.click(within(form).getByRole('button', { name: 'Registrar decisão' }))
    const args = calls.find((c) => c.fn === 'resolve')!.args[0] as Record<string, unknown>
    expect(args).toMatchObject({ id: 'c1', status: 'approved', notifyOwner: true, reason: 'Recibo de compra conferido' })
  })

  it('não procedente não avisa o titular', async () => {
    const user = userEvent.setup()
    wrap(<AdminClaimsPage />)
    await user.click(await screen.findByRole('button', { name: 'Decidir' }))
    const form = screen.getByRole('form', { name: 'Decidir pedido' })
    await user.click(within(form).getByLabelText('Não procedente'))
    expect(within(form).queryByLabelText(/Avisar o titular/)).not.toBeInTheDocument()
    await user.type(within(form).getByLabelText(/Resposta ao solicitante/), 'Sem evidências de compra.')
    await user.type(within(form).getByLabelText(/Motivo interno/), 'Nenhum documento apresentado')
    await user.click(within(form).getByRole('button', { name: 'Registrar decisão' }))
    expect(calls.find((c) => c.fn === 'resolve')!.args[0]).toMatchObject({ status: 'rejected', notifyOwner: false })
  })
})
