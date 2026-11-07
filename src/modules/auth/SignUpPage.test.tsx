import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const signUp = vi.fn()

vi.mock('@/core/config/env', () => ({
  env: { supabaseUrl: 'https://x.supabase.co', supabasePublishableKey: 'pk' },
  isSupabaseConfigured: true,
  LEGAL_VERSIONS: { terms: '0.1', privacy: '0.1' },
}))
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ auth: { signUp } }),
}))

import { SignUpPage } from './SignUpPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <SignUpPage />
    </MemoryRouter>,
  )
}

async function fill(user: ReturnType<typeof userEvent.setup>, opts: { terms?: boolean } = {}) {
  await user.type(screen.getByLabelText('Nome completo'), 'Ana Souza')
  await user.type(screen.getByLabelText('E-mail'), 'ana@exemplo.com')
  await user.type(screen.getByLabelText('Senha'), 'senha1234')
  await user.type(screen.getByLabelText('Confirme a senha'), 'senha1234')
  if (opts.terms !== false) await user.click(screen.getByRole('checkbox'))
}

describe('SignUpPage', () => {
  beforeEach(() => signUp.mockReset())

  it('não envia sem aceitar os termos e mostra o motivo', async () => {
    const user = userEvent.setup()
    renderPage()
    await fill(user, { terms: false })
    await user.click(screen.getByRole('button', { name: 'Criar conta' }))
    expect(signUp).not.toHaveBeenCalled()
    expect(screen.getByText(/Aceite os termos de uso/)).toBeInTheDocument()
  })

  it('envia os metadados esperados pelo banco e mostra a confirmação', async () => {
    signUp.mockResolvedValue({ data: {}, error: null })
    const user = userEvent.setup()
    renderPage()
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Criar conta' }))

    expect(signUp).toHaveBeenCalledTimes(1)
    const arg = signUp.mock.calls[0]![0]
    expect(arg.email).toBe('ana@exemplo.com')
    expect(arg.options.data).toEqual({
      full_name: 'Ana Souza',
      terms_accepted: true,
      terms_version: '0.1',
      privacy_version: '0.1',
    })
    expect(await screen.findByText('Confirme seu e-mail')).toBeInTheDocument()
  })

  it('mostra erro traduzido quando o e-mail já existe', async () => {
    signUp.mockResolvedValue({ data: {}, error: { code: 'user_already_exists', message: 'User already registered' } })
    const user = userEvent.setup()
    renderPage()
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Criar conta' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Já existe uma conta com este e-mail/)
  })
})
