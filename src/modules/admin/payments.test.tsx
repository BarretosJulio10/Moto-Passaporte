import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PaymentSettings, SavePaymentInput } from './paymentsApi'

const calls: Array<{ fn: string; args: unknown[] }> = []
let current: PaymentSettings

vi.mock('./paymentsApi', async () => {
  const actual = await vi.importActual<typeof import('./paymentsApi')>('./paymentsApi')
  return {
    ...actual,
    fetchPaymentSettings: async () => current,
    savePaymentSettings: async (i: SavePaymentInput) => {
      calls.push({ fn: 'save', args: [i] })
    },
    checkPaymentConnection: async () => {
      calls.push({ fn: 'check', args: [] })
      return { ok: true, message: 'Conexão confirmada.', account_id: '123', nickname: 'LOJA' }
    },
  }
})

import { AdminPaymentsPage } from './AdminPaymentsPage'
import { validatePaymentInput } from './paymentsApi'

const base: PaymentSettings = {
  environment: 'test', public_key: null, access_token_configured: false, access_token_hint: null, webhook_secret_configured: false,
  webhook_secret_hint: null, account_id: null, account_nickname: null, last_check_at: null, last_check_ok: null, last_check_message: null,
  updated_at: '2026-11-07T12:00:00Z', updated_by_name: null, billing_enabled: false,
}
const TOKEN = 'TEST-1234567890123456-110700-abcdefabcdefabcdefabcdefabcdef12-123456789'

function wrap() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><AdminPaymentsPage /></MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  calls.length = 0
  current = { ...base }
})

describe('validação das credenciais', () => {
  it('aceita formatos do Mercado Pago e recusa o resto', () => {
    expect(validatePaymentInput({ environment: 'test', publicKey: 'TEST-abcdef12-3456', accessToken: TOKEN, webhookSecret: '' })).toBeNull()
    expect(validatePaymentInput({ environment: 'test', publicKey: 'chave', accessToken: '', webhookSecret: '' })).toMatch(/Chave pública/)
    expect(validatePaymentInput({ environment: 'test', publicKey: '', accessToken: 'abc', webhookSecret: '' })).toMatch(/Token/)
    expect(validatePaymentInput({ environment: 'test', publicKey: '', accessToken: '', webhookSecret: 'curta' })).toMatch(/Assinatura/)
  })
})

describe('página de pagamentos', () => {
  it('sem token: orienta e não deixa testar', async () => {
    wrap()
    expect(await screen.findByText(/Nenhum token cadastrado/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Testar conexão' })).toBeDisabled()
  })

  it('grava o token digitado e limpa o campo depois', async () => {
    const user = userEvent.setup()
    wrap()
    const token = await screen.findByLabelText('Token de acesso (Access token)')
    expect(token).toHaveAttribute('type', 'password')
    await user.type(token, TOKEN)
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    const saved = calls.find((c) => c.fn === 'save')!.args[0] as SavePaymentInput
    expect(saved.accessToken).toBe(TOKEN)
    expect(await screen.findByText(/Configuração salva/)).toBeVisible()
    expect(token).toHaveValue('')
  })

  it('com token cadastrado: mostra só o final, mantém o atual se o campo ficar em branco', async () => {
    current = { ...base, access_token_configured: true, access_token_hint: '6789', public_key: 'TEST-abcdef12-3456' }
    const user = userEvent.setup()
    wrap()
    const token = await screen.findByLabelText('Token de acesso (Access token)')
    expect(token).toHaveValue('')
    expect(token).toHaveAttribute('placeholder', 'Cadastrado, termina em 6789')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect((calls.find((c) => c.fn === 'save')!.args[0] as SavePaymentInput).accessToken).toBe('')
  })

  it('pede confirmação antes de trocar de conta e não salva se cancelar', async () => {
    current = { ...base, access_token_configured: true, access_token_hint: '6789' }
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = userEvent.setup()
    wrap()
    await user.type(await screen.findByLabelText('Token de acesso (Access token)'), TOKEN)
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(confirm).toHaveBeenCalled()
    expect(calls.some((c) => c.fn === 'save')).toBe(false)
    confirm.mockRestore()
  })

  it('testa a conexão e mostra a conta conectada', async () => {
    current = { ...base, access_token_configured: true, access_token_hint: '6789', last_check_ok: true, account_id: '123', account_nickname: 'LOJA_TESTE', last_check_at: '2026-11-07T12:00:00Z' }
    const user = userEvent.setup()
    wrap()
    expect(await screen.findByText(/Conectado à conta LOJA_TESTE/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Testar conexão' }))
    expect(await screen.findByText('Conexão confirmada.')).toBeVisible()
  })
})
