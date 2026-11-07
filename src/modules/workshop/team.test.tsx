import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Invite, InvitePreview, Member } from './teamApi'
import type { MyWorkshop } from './api'

const calls: Array<{ fn: string; args: unknown[] }> = []
let shops: MyWorkshop[] = []
let members: Member[] = []
let invites: Invite[] = []
let preview: InvitePreview = { status: 'invalid' }

vi.mock('./WorkshopIndexPage', () => ({
  useMyWorkshops: () => ({ isLoading: false, data: shops }),
}))
vi.mock('@/core/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'u-me', email: 'eu@oficina.com' } }),
}))
vi.mock('./teamApi', async () => {
  const actual = await vi.importActual<typeof import('./teamApi')>('./teamApi')
  const log = (fn: string) => async (...args: unknown[]) => {
    calls.push({ fn, args })
  }
  return {
    ...actual,
    fetchMembers: async () => members,
    fetchInvites: async () => invites,
    createInvite: async (...args: unknown[]) => {
      calls.push({ fn: 'createInvite', args })
      return { id: 'i-new', token: 'tok123', expires_at: '2026-11-14T10:00:00Z' }
    },
    revokeInvite: log('revokeInvite'),
    updateMember: log('updateMember'),
    removeMember: log('removeMember'),
    leaveOrganization: log('leave'),
    fetchInvitePreview: async () => preview,
    acceptInvite: async (...args: unknown[]) => {
      calls.push({ fn: 'accept', args })
      return 'org1'
    },
  }
})

import { inviteLink, whatsappShareLink } from './teamApi'
import { TeamPage } from './TeamPage'
import { InvitePage } from './InvitePage'

const shop = (over: Partial<MyWorkshop>): MyWorkshop => ({
  organization_id: 'org1', role: 'responsible', can_request_access: true, can_register_services: true,
  business_name: 'Oficina do Zé', public_slug: 'oficina-do-ze', city: 'Barretos', state: 'SP', verification_status: 'unverified', ...over,
})
const member = (over: Partial<Member>): Member => ({
  id: 'm1', user_id: 'u-me', full_name: 'José', email: 'eu@oficina.com', role: 'responsible',
  can_request_access: true, can_register_services: true, is_me: true, created_at: '2026-11-01T10:00:00Z', ...over,
})

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/oficina/:orgId/equipe', element: <TeamPage /> },
      { path: '/oficina/:orgId', element: <p>painel da oficina</p> },
      { path: '/oficina', element: <p>lista de oficinas</p> },
      { path: '/convite/:token', element: <InvitePage /> },
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

beforeEach(() => {
  calls.length = 0
  shops = [shop({})]
  members = [member({}), member({ id: 'm2', user_id: 'u2', full_name: 'Paulo', email: 'paulo@oficina.com', role: 'staff', can_register_services: false, is_me: false })]
  invites = []
})

describe('links do convite', () => {
  it('monta o link e a mensagem do WhatsApp', () => {
    expect(inviteLink('abc', 'https://moto.test')).toBe('https://moto.test/convite/abc')
    expect(decodeURIComponent(whatsappShareLink('Oficina do Zé', 'https://moto.test/convite/abc'))).toContain('equipe da Oficina do Zé')
  })
})

describe('TeamPage (responsável)', () => {
  it('cria convite com permissões e mostra o link uma vez', async () => {
    renderAt('/oficina/org1/equipe')
    await userEvent.click(screen.getByRole('button', { name: 'Criar convite' }))
    expect(screen.getByText('Informe um e-mail válido.')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('E-mail do funcionário'), 'Novo@Oficina.com')
    await userEvent.click(screen.getByLabelText('Registrar serviços'))
    await userEvent.click(screen.getByRole('button', { name: 'Criar convite' }))
    expect(calls).toContainEqual({ fn: 'createInvite', args: ['org1', 'novo@oficina.com', { can_request_access: true, can_register_services: false }] })
    expect(await screen.findByText('Convite criado para novo@oficina.com')).toBeInTheDocument()
    expect(screen.getByText(`${window.location.origin}/convite/tok123`)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Enviar pelo WhatsApp' })).toHaveAttribute('href', expect.stringContaining('https://wa.me/?text='))
  })

  it('não oferece alterar a si mesmo; altera e remove funcionário', async () => {
    renderAt('/oficina/org1/equipe')
    const rows = await screen.findAllByRole('listitem')
    const me = rows.find((r) => within(r).queryByText('(você)'))!
    expect(within(me).queryByRole('button', { name: 'Alterar' })).toBeNull()
    const paulo = rows.find((r) => within(r).queryByText('Paulo'))!
    expect(within(paulo).getByText(/Pesquisar placas e pedir acesso/)).toBeInTheDocument()
    await userEvent.click(within(paulo).getByRole('button', { name: 'Alterar' }))
    await userEvent.click(within(paulo).getByLabelText('Registrar serviços'))
    await userEvent.click(within(paulo).getByRole('button', { name: 'Salvar' }))
    expect(calls).toContainEqual({ fn: 'updateMember', args: ['m2', 'staff', { can_request_access: true, can_register_services: true }] })
    await userEvent.click(within(paulo).getByRole('button', { name: 'Remover' }))
    expect(within(paulo).getByText(/continuam no histórico/)).toBeInTheDocument()
    await userEvent.click(within(paulo).getByRole('button', { name: 'Remover' }))
    expect(calls).toContainEqual({ fn: 'removeMember', args: ['m2'] })
  })

  it('lista e cancela convites em aberto', async () => {
    invites = [{ id: 'i1', email: 'pendente@oficina.com', can_request_access: true, can_register_services: true, created_at: '2026-11-07T10:00:00Z', expires_at: '2026-11-14T10:00:00Z' }]
    renderAt('/oficina/org1/equipe')
    expect(await screen.findByText('pendente@oficina.com')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar convite' }))
    expect(calls).toContainEqual({ fn: 'revokeInvite', args: ['i1'] })
  })
})

describe('TeamPage (funcionário)', () => {
  it('vê a equipe sem gerenciar e pode sair', async () => {
    shops = [shop({ role: 'staff', can_register_services: false })]
    members = [member({ is_me: true, role: 'staff', full_name: 'Paulo' }), member({ id: 'm9', user_id: 'u9', full_name: 'José', email: null, is_me: false })]
    const router = renderAt('/oficina/org1/equipe')
    expect(await screen.findByText('José')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Criar convite' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Alterar' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Sair da oficina' }))
    await userEvent.click(screen.getByRole('button', { name: 'Sair da oficina' }))
    expect(calls).toContainEqual({ fn: 'leave', args: ['org1'] })
    expect(router.state.location.pathname).toBe('/oficina')
  })
})

describe('InvitePage', () => {
  it('mostra a oficina e as permissões e aceita', async () => {
    preview = { status: 'open', workshop_name: 'Oficina do Zé', email_matches: true, email_hint: 'eu•••@oficina.com', can_request_access: true, can_register_services: false, expires_at: '2026-11-14T10:00:00Z' }
    const router = renderAt('/convite/tok123')
    expect(await screen.findByText('Oficina do Zé')).toBeInTheDocument()
    expect(screen.getByText('Pesquisar placas e pedir acesso')).toBeInTheDocument()
    expect(screen.queryByText('Registrar serviços')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Aceitar convite' }))
    expect(calls).toContainEqual({ fn: 'accept', args: ['tok123'] })
    expect(router.state.location.pathname).toBe('/oficina/org1')
  })

  it('e-mail diferente: explica e não oferece aceitar', async () => {
    preview = { status: 'open', workshop_name: 'Oficina do Zé', email_matches: false, email_hint: 'pa•••@oficina.com', can_request_access: true, can_register_services: true }
    renderAt('/convite/tok123')
    expect(await screen.findByText('Este convite é para outro e-mail')).toBeInTheDocument()
    expect(screen.getByText(/pa•••@oficina.com/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aceitar convite' })).toBeNull()
  })

  it('convite expirado', async () => {
    preview = { status: 'expired' }
    renderAt('/convite/tok123')
    expect(await screen.findByText(/expirou/)).toBeInTheDocument()
  })
})
