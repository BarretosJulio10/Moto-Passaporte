import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { claimPath, inviteText, kindFromSlug } from './api'

const calls: { fn: string; args: Record<string, unknown> | undefined }[] = []
let preview: unknown = { state: 'open', workshop: 'Oficina do Zé', customer_first_name: 'Ana', vehicles: ['Honda CG 160 2022'], quotes: 2, orders: 1 }
vi.mock('@/modules/workshop/shared/rpc', async () => {
  const actual = await vi.importActual<typeof import('@/modules/workshop/shared/rpc')>('@/modules/workshop/shared/rpc')
  return { ...actual, rpc: async (fn: string, args?: Record<string, unknown>) => {
    calls.push({ fn, args })
    if (fn === 'get_customer_link_preview') return preview
    if (fn === 'get_my_workshop_records') return []
    return { ok: true, already: false }
  } }
})

const TOKEN = 'a'.repeat(43)

async function renderClaim(slug = 'convite') {
  const { ClaimPage } = await import('./ClaimPage')
  const router = createMemoryRouter([
    { path: '/painel/vincular/:kind/:token', element: <ClaimPage /> },
    { path: '/painel/atendimentos', element: <p>atendimentos</p> },
  ], { initialEntries: [`/painel/vincular/${slug}/${TOKEN}`] })
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>)
}

describe('vínculo do cliente com a conta', () => {
  beforeEach(() => { calls.length = 0 })

  it('links e mensagem do convite', () => {
    expect(kindFromSlug('os')).toBe('order')
    expect(kindFromSlug('qualquer')).toBeNull()
    expect(claimPath('quote', TOKEN)).toBe(`/painel/vincular/orcamento/${TOKEN}`)
    const t = inviteText({ customerName: 'Ana Paula', workshopName: 'Oficina do Zé', link: 'https://x/painel/vincular/convite/abc' })
    expect(t).toMatch(/^Olá, Ana! Aqui é da Oficina do Zé\./)
    expect(t).toContain('https://x/painel/vincular/convite/abc')
  })

  it('só liga depois da confirmação explícita', async () => {
    await renderClaim()
    expect(await screen.findByText('Honda CG 160 2022')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(screen.getByText('Marque a confirmação.')).toBeTruthy()
    expect(calls.some((c) => c.fn === 'claim_workshop_customer')).toBe(false)
    await userEvent.click(screen.getByLabelText(/Sou eu, Ana/))
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(calls.find((c) => c.fn === 'claim_workshop_customer')?.args).toEqual({ p_kind: 'invite', p_token: TOKEN })
    expect(await screen.findByText('atendimentos')).toBeTruthy()
  })

  it('cadastro de outra conta não oferece confirmação', async () => {
    preview = { state: 'taken', workshop: 'Oficina do Zé', customer_first_name: 'Ana', vehicles: [], quotes: 0, orders: 0 }
    await renderClaim('os')
    expect(await screen.findByText('Cadastro ligado a outra conta')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Confirmar' })).toBeNull()
  })
})
