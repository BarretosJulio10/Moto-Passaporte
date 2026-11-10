import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const calls: Array<{ fn: string; args: unknown[] }> = []
let status = { connected: false, loggedIn: false, number: null as string | null }
const settings = {
  email_enabled: false, email_from: 'Moto Passaporte <avisos@motopassaporte.com.br>', link_base: 'https://www.motopassaporte.com.br',
  resend_key_configured: true, resend_key_hint: 'abcd', whatsapp_enabled: false, fzap_url: 'https://fzap.exemplo.com.br',
  fzap_token_configured: true, fzap_token_hint: '3456', fzap_instance_id: null as string | null, whatsapp_cooldown_hours: 48, updated_at: '2026-11-09T12:00:00Z', updated_by_name: 'Admin',
  last_24h: { 'email:sent': 3 }, pending: { email: 1, whatsapp: 0 },
}

vi.mock('./messagingApi', () => ({
  fetchMessagingSettings: async () => settings,
  fetchOutboundMessages: async () => [
    { id: 'm1', channel: 'email', kind: 'limit_reached', destination: 'ju***@hotmail.com', status: 'sent', error: null, created_at: '2026-11-09T12:00:00Z', user_name: 'Julio' },
  ],
  fetchAuthEmails: async () => [
    { created_at: '2026-11-10T16:40:00Z', action: 'signup', email_hint: 'df***@gmail.com', status: 'aceito', detail: null },
    { created_at: '2026-11-10T16:41:00Z', action: 'recovery', email_hint: 'ri***@gmail.com', status: 'recusado', detail: 'domínio não verificado' },
  ],
  saveMessagingSettings: async (...args: unknown[]) => { calls.push({ fn: 'save', args }) },
  messagingAction: async (action: string, extra?: unknown) => {
    calls.push({ fn: action, args: [extra] })
    if (action === 'wa_status') return status
    if (action === 'wa_connect') { status = { connected: true, loggedIn: false, number: null }; return status }
    if (action === 'wa_qr') return { qr: 'data:image/png;base64,AAAA' }
    if (action === 'wa_pair') return { code: '9H3J-H3J8', phone: '5521****1728' }
    if (action === 'test_email') return { ok: true, detail: 'Enviado para admin@teste.com.' }
    if (action === 'wa_create_instance') return { ok: true, name: 'motopassaporte-avisos-ab12', connected: true, loggedIn: false }
    return { ok: true }
  },
}))

const rpc = vi.fn(async () => ({ data: true, error: null }))
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({ rpc }) }))

import { AdminMessagingPage } from './AdminMessagingPage'
import { UnsubscribePage } from '@/modules/public_site/UnsubscribePage'

function wrap(node: React.ReactNode, path = '/admin/mensagens') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}><Routes><Route path="*" element={node} /></Routes></MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  calls.length = 0
  status = { connected: false, loggedIn: false, number: null }
})

describe('admin: e-mail e WhatsApp (ADR-064)', () => {
  it('mostra só o final das chaves, salva e testa o e-mail', async () => {
    const user = userEvent.setup()
    wrap(<AdminMessagingPage />)
    expect(await screen.findByPlaceholderText('Cadastrada, termina em abcd')).toHaveValue('')
    await user.click(screen.getByLabelText('Enviar avisos por e-mail'))
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(calls.find((c) => c.fn === 'save')?.args[0]).toMatchObject({ emailEnabled: true, resendKey: '', fzapUrl: 'https://fzap.exemplo.com.br' }))
    await user.click(screen.getByRole('button', { name: 'Enviar e-mail de teste para mim' }))
    expect(await screen.findByText('Enviado para admin@teste.com.')).toBeVisible()
    expect(screen.getByText(/Limite de motos do plano · Julio/)).toBeVisible()
  })

  it('conecta o WhatsApp mostrando o QR Code', async () => {
    const user = userEvent.setup()
    wrap(<AdminMessagingPage />)
    expect(await screen.findByText('Desconectado.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Conectar (QR Code)' }))
    expect(await screen.findByAltText('QR Code para conectar o WhatsApp')).toHaveAttribute('src', 'data:image/png;base64,AAAA')
  })

  it('conecta pelo número: mostra o código para digitar no celular, sem QR', async () => {
    const user = userEvent.setup()
    wrap(<AdminMessagingPage />)
    await user.type(await screen.findByLabelText('Ou conecte pelo número (com DDD)'), '21 97363-1728')
    await user.click(screen.getByRole('button', { name: 'Receber código' }))
    await waitFor(() => expect(calls.find((c) => c.fn === 'wa_pair')?.args[0]).toEqual({ phone: '21 97363-1728' }))
    expect(await screen.findByText('9H3J-H3J8')).toBeVisible()
    expect(screen.getByText(/Conectar com número de telefone/)).toBeVisible()
    expect(screen.queryByAltText('QR Code para conectar o WhatsApp')).toBeNull()
  })
})

describe('admin: criar a instância da FZAP pelo painel', () => {
  it('usa o token de administrador só na hora e já mostra o QR Code', async () => {
    const user = userEvent.setup()
    settings.fzap_token_configured = false
    wrap(<AdminMessagingPage />)
    await user.type(await screen.findByLabelText('Token de administrador da FZAP'), 'admin-token-123')
    await user.click(screen.getByRole('button', { name: 'Criar instância e gerar QR Code' }))
    await waitFor(() => expect(calls.find((c) => c.fn === 'wa_create_instance')?.args[0]).toEqual({ admin_token: 'admin-token-123' }))
    expect(await screen.findByText(/motopassaporte-avisos-ab12 criada/)).toBeVisible()
    expect(await screen.findByAltText('QR Code para conectar o WhatsApp')).toBeVisible()
    settings.fzap_token_configured = true
  })

  it('com a instância criada, mostra só um lugar para conectar e nenhum campo de token', async () => {
    settings.fzap_instance_id = 'motopassaporte-avisos-eeb3'
    wrap(<AdminMessagingPage />)
    expect(await screen.findByText('motopassaporte-avisos-eeb3')).toBeVisible()
    expect(await screen.findByRole('button', { name: 'Conectar (QR Code)' })).toBeVisible()
    expect(screen.queryByLabelText('Token da instância')).toBeNull()
    expect(screen.queryByText('Criar uma instância nova na FZAP')).toBeNull()
    settings.fzap_instance_id = null
  })

  it('se a consulta da conexão falhar, não fica preso em "Conferindo"', async () => {
    const orig = status
    status = undefined as unknown as typeof status
    wrap(<AdminMessagingPage />)
    expect(await screen.findByText('Desconectado.')).toBeVisible()
    status = orig
  })
})

describe('parar de receber por e-mail', () => {
  it('funciona pelo link, sem entrar na conta', async () => {
    wrap(<UnsubscribePage />, '/avisos/sair?t=0b8c6a8e-6a1f-4c3e-9e4a-2f6d8b1a9c01')
    expect(await screen.findByText('Pronto, você não vai mais receber avisos por e-mail.')).toBeVisible()
    expect(rpc).toHaveBeenCalledWith('email_unsubscribe', { p_token: '0b8c6a8e-6a1f-4c3e-9e4a-2f6d8b1a9c01' })
  })
  it('link quebrado não chama o servidor', async () => {
    rpc.mockClear()
    wrap(<UnsubscribePage />, '/avisos/sair?t=abc')
    expect(await screen.findByText(/não é válido/)).toBeVisible()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('mostra os e-mails de login com o status do Resend', async () => {
    wrap(<AdminMessagingPage />)
    expect(await screen.findByText('Confirmação de cadastro')).toBeVisible()
    expect(screen.getByText('Nova senha')).toBeVisible()
    expect(screen.getByText('recusado')).toBeVisible()
    expect(screen.getByText(/domínio não verificado/)).toBeVisible()
  })
})
