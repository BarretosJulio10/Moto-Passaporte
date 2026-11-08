import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AdminPrivacyRequest, PrivacyRequest } from './api'

const calls: Array<{ fn: string; args: unknown[] }> = []
let requests: PrivacyRequest[] = []
let adminRequests: AdminPrivacyRequest[] = []

vi.mock('@/core/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api')
  return {
    ...actual,
    fetchMyProfile: async () => ({ full_name: 'Ana Souza', email: 'ana@exemplo.com', phone: '11999990000', created_at: '2026-01-01T00:00:00Z' }),
    updateMyProfile: async (...args: unknown[]) => { calls.push({ fn: 'profile', args }) },
    changePassword: async (...args: unknown[]) => { calls.push({ fn: 'password', args }) },
    exportMyData: async () => { calls.push({ fn: 'export', args: [] }); return { account: { name: 'Ana Souza' } } },
    downloadJson: (...args: unknown[]) => { calls.push({ fn: 'download', args }) },
    fetchMyPrivacyRequests: async () => requests,
    createPrivacyRequest: async (...args: unknown[]) => {
      calls.push({ fn: 'create', args })
      requests = [{ id: 'r1', kind: String(args[0]), details: String(args[1]) || null, status: 'pending', reply: null, created_at: '2026-11-08T10:00:00Z', resolved_at: null }, ...requests]
    },
    cancelPrivacyRequest: async (...args: unknown[]) => {
      calls.push({ fn: 'cancel', args })
      requests = requests.map((r) => (r.id === args[0] ? { ...r, status: 'canceled' } : r))
    },
    adminListPrivacyRequests: async () => adminRequests,
    adminAnonymizeAccount: async (...args: unknown[]) => {
      calls.push({ fn: 'anonymize', args })
      if (adminRequests.find((r) => r.id === args[0])?.motorcycles) throw { code: 'P0001', message: 'O titular ainda tem motos no nome. Elas precisam ser transferidas ou arquivadas antes.' }
      adminRequests = adminRequests.map((r) => (r.id === args[0] ? { ...r, status: 'done', reply: 'Conta excluída.' } : r))
      return { diary_entries: 0, diary_files: 0 }
    },
    adminResolvePrivacyRequest: async (...args: unknown[]) => {
      calls.push({ fn: 'resolve', args })
      adminRequests = adminRequests.map((r) => (r.id === args[0] ? { ...r, status: String(args[1]), reply: String(args[2]) } : r))
    },
  }
})

import { AccountPage } from './AccountPage'
import { AdminPrivacyPage } from '@/modules/admin/AdminPrivacyPage'

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><MemoryRouter>{node}</MemoryRouter></QueryClientProvider>)
}

beforeEach(() => {
  calls.length = 0
  requests = []
  adminRequests = [{ id: 'a1', user_id: 'u9', full_name: 'Bruno Lima', email_masked: 'br•••@exemplo.com', kind: 'deletion', details: 'Quero sair.',
    status: 'pending', reply: null, created_at: '2026-11-07T10:00:00Z', resolved_at: null, motorcycles: 1 }]
})

describe('Minha conta (ADR-036)', () => {
  it('edita nome e telefone, com validação', async () => {
    const user = userEvent.setup()
    wrap(<AccountPage />)
    const form = await screen.findByRole('form', { name: 'Dados pessoais' })
    const name = within(form).getByLabelText('Nome')
    expect(name).toHaveValue('Ana Souza')
    expect(within(form).getByLabelText('E-mail')).toHaveAttribute('readonly')
    await user.clear(name)
    await user.type(name, 'A')
    await user.click(within(form).getByRole('button', { name: 'Salvar' }))
    expect(await within(form).findByText(/Informe seu nome/)).toBeInTheDocument()
    await user.type(name, 'na Souza Lima')
    await user.clear(within(form).getByLabelText('Telefone (opcional)'))
    await user.type(within(form).getByLabelText('Telefone (opcional)'), '(11) 98888-7777')
    await user.click(within(form).getByRole('button', { name: 'Salvar' }))
    expect(await within(form).findByText('Dados salvos.')).toBeInTheDocument()
    expect(calls.find((c) => c.fn === 'profile')?.args).toEqual(['u1', 'Ana Souza Lima', '11988887777'])
  })

  it('troca a senha só com confirmação igual e 8 caracteres', async () => {
    const user = userEvent.setup()
    wrap(<AccountPage />)
    const form = await screen.findByRole('form', { name: 'Trocar senha' })
    await user.type(within(form).getByLabelText('Nova senha'), 'curta')
    await user.click(within(form).getByRole('button', { name: 'Trocar senha' }))
    expect(await within(form).findByText(/pelo menos 8/)).toBeInTheDocument()
    await user.clear(within(form).getByLabelText('Nova senha'))
    await user.type(within(form).getByLabelText('Nova senha'), 'senha-forte-1')
    await user.type(within(form).getByLabelText('Repita a nova senha'), 'senha-forte-2')
    await user.click(within(form).getByRole('button', { name: 'Trocar senha' }))
    expect(await within(form).findByText('As senhas não conferem.')).toBeInTheDocument()
    await user.clear(within(form).getByLabelText('Repita a nova senha'))
    await user.type(within(form).getByLabelText('Repita a nova senha'), 'senha-forte-1')
    await user.click(within(form).getByRole('button', { name: 'Trocar senha' }))
    expect(await within(form).findByText('Senha trocada.')).toBeInTheDocument()
    expect(calls.find((c) => c.fn === 'password')?.args).toEqual(['senha-forte-1'])
  })

  it('baixa os dados e abre/cancela pedido de exclusão', async () => {
    const user = userEvent.setup()
    wrap(<AccountPage />)
    await user.click(await screen.findByRole('button', { name: 'Baixar meus dados' }))
    expect(calls.find((c) => c.fn === 'download')?.args[1]).toMatch(/^moto-passaporte-meus-dados-\d{4}-\d{2}-\d{2}\.json$/)
    const form = screen.getByRole('form', { name: 'Pedido de privacidade' })
    expect(within(form).getByText(/histórico da moto pertence à moto/)).toBeInTheDocument()
    await user.click(within(form).getByRole('button', { name: 'Enviar pedido' }))
    expect(await within(form).findByText(/Pedido enviado/)).toBeInTheDocument()
    expect(calls.find((c) => c.fn === 'create')?.args[0]).toBe('deletion')
    const list = await screen.findByRole('list', { name: 'Meus pedidos de privacidade' })
    expect(within(list).getByText(/Recebido/)).toBeInTheDocument()
    await user.click(within(list).getByRole('button', { name: 'Cancelar pedido' }))
    expect(await within(list).findByText(/Cancelado/)).toBeInTheDocument()
  })

  it('correção exige descrição', async () => {
    const user = userEvent.setup()
    wrap(<AccountPage />)
    const form = await screen.findByRole('form', { name: 'Pedido de privacidade' })
    await user.selectOptions(within(form).getByLabelText('Pedido'), 'correction')
    await user.click(within(form).getByRole('button', { name: 'Enviar pedido' }))
    expect(await within(form).findByText(/Descreva o pedido \(pelo menos 10/)).toBeInTheDocument()
    expect(calls.some((c) => c.fn === 'create')).toBe(false)
  })
})

describe('Pedidos de privacidade no admin', () => {
  it('responde com resposta ao titular e motivo', async () => {
    const user = userEvent.setup()
    wrap(<AdminPrivacyPage />)
    expect(await screen.findByText(/br•••@exemplo.com · 1 moto/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Responder' }))
    const form = screen.getByRole('form', { name: 'Responder pedido' })
    await user.click(within(form).getByRole('button', { name: 'Registrar resposta' }))
    expect(await within(form).findByText(/Escreva a resposta/)).toBeInTheDocument()
    await user.type(within(form).getByLabelText(/Resposta ao titular/), 'Sua conta foi excluída e os dados anonimizados.')
    await user.type(within(form).getByLabelText(/Motivo/), 'Exclusão conforme procedimento LGPD')
    await user.click(within(form).getByRole('button', { name: 'Registrar resposta' }))
    await screen.findByText(/Resposta: Sua conta foi excluída/)
    expect(calls.find((c) => c.fn === 'resolve')?.args).toEqual(['a1', 'done', 'Sua conta foi excluída e os dados anonimizados.', 'Exclusão conforme procedimento LGPD'])
  })

  it('anonimização pede motivo e mostra o impedimento', async () => {
    const user = userEvent.setup()
    wrap(<AdminPrivacyPage />)
    await user.click(await screen.findByRole('button', { name: 'Anonimizar conta' }))
    expect(screen.getByText(/Não dá para desfazer/)).toBeInTheDocument()
    await user.type(screen.getByLabelText(/Motivo/), 'Exclusão a pedido do titular')
    await user.click(screen.getByRole('button', { name: 'Anonimizar conta' }))
    expect(await screen.findByText(/ainda tem motos no nome/)).toBeInTheDocument()
    expect(calls.find((c) => c.fn === 'anonymize')?.args).toEqual(['a1', 'Exclusão a pedido do titular'])
  })
})
