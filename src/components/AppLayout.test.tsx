import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

let roles: string[] = []
vi.mock('@/core/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'u1', email: 'a@b.c', user_metadata: { full_name: 'Rafael Lima' } }, signOut: async () => {} }) }))
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({ from: () => ({ select: async () => ({ data: roles.map((role) => ({ role })), error: null }) }) }) }))
vi.mock('@/modules/notifications/api', () => ({ fetchUnreadCount: async () => 3 }))

import { AppLayout } from './AppLayout'

function wrap(path: string) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route element={<AppLayout />}><Route path="*" element={<p>conteúdo</p>} /></Route></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('estrutura das telas (ADR-042)', () => {
  it('menu lateral e abas embaixo com as mesmas áreas; marca a área atual', async () => {
    wrap('/painel/motos/m1/checkup')
    const side = screen.getByRole('navigation', { name: 'Áreas da conta' })
    const tabs = screen.getByRole('navigation', { name: 'Navegação principal' })
    for (const label of ['Minhas motos', 'Minha oficina', 'Meu plano', 'Minha conta']) expect(within(side).getByRole('link', { name: label })).toBeInTheDocument()
    expect(within(side).getByRole('link', { name: 'Minhas motos' })).toHaveAttribute('aria-current', 'page')
    expect(within(tabs).getByRole('link', { name: 'Minhas motos' })).toHaveAttribute('aria-current', 'page')
    expect(await within(tabs).findByRole('link', { name: 'Notificações: 3 não lidas' })).toBeInTheDocument()
    expect(within(side).queryByRole('link', { name: 'Administração' })).toBeNull()
  })

  it('administrador vê a Administração e o submenu dentro dela', async () => {
    roles = ['admin']
    wrap('/admin/usuarios')
    const side = screen.getByRole('navigation', { name: 'Áreas da conta' })
    expect(await within(side).findByRole('link', { name: 'Administração' })).toHaveAttribute('aria-current', 'page')
    expect(within(side).getByRole('link', { name: 'Usuários' })).toHaveAttribute('aria-current', 'page')
    roles = []
  })
})
