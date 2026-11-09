import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { isPistaUser, normalizeCode, normalizeNickname, pistaEmail, validNickname } from './accountsApi'

const signIn = vi.fn(async () => ({ error: null }))
let currentUser: { id: string; app_metadata: Record<string, unknown> } | null = null

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: { signInWithPassword: signIn },
    rpc: async (fn: string) => (fn === 'pista_workshop_by_code' ? { data: { code: 'ab12cd', name: 'Oficina do Carlos' }, error: null } : { data: [], error: null }),
  }),
}))
vi.mock('@/core/auth/AuthProvider', () => ({
  useAuth: () => ({ user: currentUser, loading: false, signOut: async () => {} }),
}))
vi.mock('./outbox', () => ({ startOutbox: () => () => {}, listOutbox: async () => [], onOutboxChange: () => () => {}, flush: async () => {} }))

function renderAt(path: string, routes: Parameters<typeof createMemoryRouter>[0]) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={qc}><RouterProvider router={router} /></QueryClientProvider>)
  return router
}

describe('Conta da pista (ADR-058)', () => {
  beforeEach(() => { signIn.mockClear(); currentUser = null; localStorage.clear() })

  it('apelido vira login interno sem acento nem espaço', () => {
    expect(normalizeNickname('Zé Mário')).toBe('zemario')
    expect(normalizeCode(' AB-12cd9 ')).toBe('ab12cd')
    expect(validNickname('d')).toBe(false)
    expect(pistaEmail('Davi', 'AB12CD')).toBe('davi.ab12cd@pista.motopassaporte.com.br')
    expect(isPistaUser({ app_metadata: { account_kind: 'pista' } })).toBe(true)
    expect(isPistaUser({ app_metadata: {} })).toBe(false)
  })

  it('link da oficina mostra o nome e entra com apelido e senha', async () => {
    const { PistaLayout } = await import('./PistaApp')
    renderAt('/pista/ab12cd', [{ path: '/pista', element: <PistaLayout />, children: [{ path: ':code', element: <p>home</p> }] }])
    expect(await screen.findByRole('heading', { name: 'Oficina do Carlos' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Código da oficina')).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Apelido'), 'Davi')
    await userEvent.type(screen.getByLabelText('Senha'), 'segredo1')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    await waitFor(() => expect(signIn).toHaveBeenCalledWith({ email: 'davi.ab12cd@pista.motopassaporte.com.br', password: 'segredo1' }))
    expect(localStorage.getItem('pista-code')).toBe('ab12cd')
  })

  it('sem o link pede o código da oficina', async () => {
    const { PistaLayout } = await import('./PistaApp')
    renderAt('/pista', [{ path: '/pista', element: <PistaLayout />, children: [{ index: true, element: <p>home</p> }] }])
    expect(await screen.findByLabelText('Código da oficina')).toBeInTheDocument()
  })

  it('conta da pista não abre o painel', async () => {
    currentUser = { id: 'p1', app_metadata: { account_kind: 'pista' } }
    const { RequireAuth } = await import('@/core/auth/RequireAuth')
    const router = renderAt('/painel', [
      { path: '/painel', element: <RequireAuth><p>painel</p></RequireAuth> },
      { path: '/pista', element: <p>pista</p> },
    ])
    expect(await screen.findByText('pista')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/pista')
  })
})
