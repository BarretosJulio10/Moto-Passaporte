import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const updateUser = vi.fn()
const signOut = vi.fn(async () => ({ error: null }))
const getAuthenticatorAssuranceLevel = vi.fn()
const listFactors = vi.fn(async () => ({ data: { totp: [{ id: 'f1' }] }, error: null }))
const challengeAndVerify = vi.fn()

vi.mock('@/core/config/env', () => ({ env: {}, isSupabaseConfigured: true, LEGAL_VERSIONS: { terms: '0.1', privacy: '0.1' } }))
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ auth: { updateUser, signOut, mfa: { getAuthenticatorAssuranceLevel, listFactors, challengeAndVerify } } }),
}))
vi.mock('@/core/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'u1' }, loading: false }) }))

import { ResetPasswordPage } from './ResetPasswordPage'

function page() {
  return render(
    <MemoryRouter initialEntries={['/redefinir-senha']}>
      <Routes>
        <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
        <Route path="/entrar" element={<p>tela de entrar</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Nova senha'), 'novaSenha123')
  await user.type(screen.getByLabelText('Confirme a nova senha'), 'novaSenha123')
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    updateUser.mockReset(); challengeAndVerify.mockReset(); getAuthenticatorAssuranceLevel.mockReset()
  })

  it('conta sem verificação em duas etapas: salva direto', async () => {
    getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } })
    updateUser.mockResolvedValue({ error: null })
    const user = userEvent.setup()
    page()
    await fill(user)
    expect(screen.queryByLabelText('Código do app autenticador')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Salvar nova senha' }))
    expect(await screen.findByText('tela de entrar')).toBeInTheDocument()
    expect(challengeAndVerify).not.toHaveBeenCalled()
  })

  it('conta com app autenticador: pede o código antes de trocar a senha', async () => {
    getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' } })
    challengeAndVerify.mockResolvedValue({ error: null })
    updateUser.mockResolvedValue({ error: null })
    const user = userEvent.setup()
    page()
    await fill(user)
    await user.type(await screen.findByLabelText('Código do app autenticador'), '123456')
    await user.click(screen.getByRole('button', { name: 'Salvar nova senha' }))
    await waitFor(() => expect(challengeAndVerify).toHaveBeenCalledWith({ factorId: 'f1', code: '123456' }))
    expect(await screen.findByText('tela de entrar')).toBeInTheDocument()
  })

  it('se o servidor exigir o código, mostra o campo e explica', async () => {
    getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } })
    updateUser.mockResolvedValue({ error: { code: 'insufficient_aal', message: 'AAL2 session is required to update email or password when MFA is enabled.', status: 401 } })
    const user = userEvent.setup()
    page()
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Salvar nova senha' }))
    expect(await screen.findByText('Digite o código do app autenticador para confirmar.')).toBeInTheDocument()
    expect(screen.getByLabelText('Código do app autenticador')).toBeInTheDocument()
  })
})
