import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const verifyOtp = vi.fn()
const signInWithPassword = vi.fn()
const resend = vi.fn()

vi.mock('@/core/config/env', () => ({
  env: { supabaseUrl: 'https://x.supabase.co', supabasePublishableKey: 'pk' },
  isSupabaseConfigured: true,
  LEGAL_VERSIONS: { terms: '0.1', privacy: '0.1' },
}))
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ auth: { verifyOtp, signInWithPassword, resend } }),
}))
vi.mock('@/core/auth/AuthProvider', () => ({ useAuth: () => ({ user: null, loading: false }) }))

import { AuthConfirmPage, destinationFor } from './AuthConfirmPage'
import { SignInPage } from './SignInPage'

function at(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/auth/confirmar" element={<AuthConfirmPage />} />
        <Route path="/redefinir-senha" element={<p>tela nova senha</p>} />
        <Route path="/painel" element={<p>painel</p>} />
        <Route path="/entrar" element={<SignInPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AuthConfirmPage (link do e-mail de login)', () => {
  beforeEach(() => {
    verifyOtp.mockReset()
    signInWithPassword.mockReset()
    resend.mockReset()
  })

  it('recuperação: confirma com o token_hash e leva para a nova senha', async () => {
    verifyOtp.mockResolvedValue({ error: null })
    at('/auth/confirmar?token_hash=abc&type=recovery')
    expect(await screen.findByText('tela nova senha')).toBeInTheDocument()
    expect(verifyOtp).toHaveBeenCalledTimes(1)
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'abc', type: 'recovery' })
  })

  it('cadastro: confirma e entra no painel', async () => {
    verifyOtp.mockResolvedValue({ error: null })
    at('/auth/confirmar?token_hash=xyz&type=signup')
    expect(await screen.findByText('painel')).toBeInTheDocument()
    expect(destinationFor('signup')).toBe('/painel?confirmado=1')
  })

  it('link usado ou expirado: explica e oferece pedir outro', async () => {
    verifyOtp.mockResolvedValue({ error: { message: 'Token has expired or is invalid' } })
    at('/auth/confirmar?token_hash=old&type=recovery')
    expect(await screen.findByText('Link inválido ou expirado')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pedir novo link' })).toHaveAttribute('href', '/recuperar-senha')
  })

  it('link incompleto ou tipo desconhecido não chama o servidor', async () => {
    at('/auth/confirmar?token_hash=abc&type=hacker')
    expect(await screen.findByText('Link inválido ou expirado')).toBeInTheDocument()
    expect(verifyOtp).not.toHaveBeenCalled()
  })
})

describe('SignInPage: e-mail não confirmado', () => {
  beforeEach(() => {
    signInWithPassword.mockReset()
    resend.mockReset()
  })

  it('oferece reenviar a confirmação para o e-mail digitado', async () => {
    signInWithPassword.mockResolvedValue({ error: { message: 'Email not confirmed', code: 'email_not_confirmed', status: 400 } })
    resend.mockResolvedValue({ error: null })
    const user = userEvent.setup()
    at('/entrar')
    await user.type(screen.getByLabelText('E-mail'), 'rita@exemplo.com')
    await user.type(screen.getByLabelText('Senha'), 'senha1234')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))
    await user.click(await screen.findByRole('button', { name: 'Reenviar e-mail de confirmação' }))
    await waitFor(() => expect(resend).toHaveBeenCalledWith(expect.objectContaining({ type: 'signup', email: 'rita@exemplo.com' })))
    expect(await screen.findByText(/Enviamos um novo e-mail de confirmação para rita@exemplo.com/)).toBeInTheDocument()
  })

  it('senha errada não mostra o botão de reenviar', async () => {
    signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials', code: 'invalid_credentials', status: 400 } })
    const user = userEvent.setup()
    at('/entrar')
    await user.type(screen.getByLabelText('E-mail'), 'rita@exemplo.com')
    await user.type(screen.getByLabelText('Senha'), 'senha1234')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))
    await screen.findByRole('alert').catch(() => null)
    expect(screen.queryByRole('button', { name: 'Reenviar e-mail de confirmação' })).toBeNull()
  })
})
