import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Share, SharedPassport } from './sharesApi'

const calls: Array<{ fn: string; args: unknown[] }> = []
let shares: Share[] = []
let shared: SharedPassport | null = null
let pageEnabled = true

vi.mock('./sharesApi', async () => {
  const actual = await vi.importActual<typeof import('./sharesApi')>('./sharesApi')
  return {
    ...actual,
    fetchShares: async () => shares,
    createShare: async (...args: unknown[]) => {
      calls.push({ fn: 'create', args })
      const o = args[3] as Record<string, boolean>
      shares = [{ id: 's-new', token: 'a'.repeat(48), label: String(args[1]) || null, status: 'active', expires_at: '2026-12-07T10:00:00Z', revoked_at: null,
        view_count: 0, last_viewed_at: null, created_at: '2026-11-07T10:00:00Z', show_plate: o.show_plate, show_mileage: o.show_mileage,
        show_history: o.show_history, show_values: o.show_values, show_attachments: o.show_attachments, show_diary: o.show_diary } as Share]
      return { id: 's-new', token: 'a'.repeat(48) }
    },
    revokeShare: async (...args: unknown[]) => {
      calls.push({ fn: 'revoke', args })
      shares = shares.map((s) => (s.id === args[0] ? { ...s, status: 'revoked', revoked_at: '2026-11-08T10:00:00Z' } : s))
    },
    fetchSharedPassport: async () => shared,
    fetchPublicPageEnabled: async () => pageEnabled,
    setPublicPageEnabled: async (...args: unknown[]) => {
      calls.push({ fn: 'setPage', args })
      pageEnabled = Boolean(args[1])
    },
  }
})
vi.mock('./qr', () => ({ qrSvg: async () => '<svg></svg>', downloadQrPng: async () => {} }))

import { ShareSection } from './ShareSection'
import { SharedPassportPage } from './SharedPassportPage'
import { QrCodePanel } from './QrCodePanel'

const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
function wrap(node: React.ReactNode) {
  render(<QueryClientProvider client={qc()}><MemoryRouter>{node}</MemoryRouter></QueryClientProvider>)
}
function renderShared(token: string) {
  const router = createMemoryRouter([{ path: '/c/:token', element: <SharedPassportPage /> }], { initialEntries: [`/c/${token}`] })
  render(<QueryClientProvider client={qc()}><RouterProvider router={router} /></QueryClientProvider>)
}

const passport = (over: Partial<SharedPassport> = {}): SharedPassport => ({
  brand: 'Honda', model: 'CB 500F', version: 'ABS', manufacturing_year: 2022, model_year: 2023, displacement_cc: 471, color: 'Vermelha',
  passport_created_at: '2026-01-10T10:00:00Z', shared_at: '2026-11-07T10:00:00Z', expires_at: '2026-12-07T10:00:00Z', origin_workshop: 'Oficina do Zé',
  options: { plate: false, mileage: true, history: true, values: false, attachments: false, diary: false },
  mileage: [{ recorded_at: '2026-11-01', mileage: 30500, source_type: 'workshop', below_previous: false }],
  history: [
    { service_date: '2026-11-01', category: 'revision', title: 'Revisão dos 30 mil', description: 'Óleo e filtro', mileage: 30500, evidence_level: 'workshop',
      workshop_name: 'Oficina do Zé', is_correction: false, items: [{ item_name: 'Óleo', brand: 'Motul', quantity: 3 }], service_value_cents: null, attachments: null },
    { service_date: '2026-06-01', category: 'tires', title: 'Pneu novo', description: null, mileage: 25000, evidence_level: 'document',
      workshop_name: null, is_correction: false, items: [], service_value_cents: null, attachments: null },
  ],
  ...over,
})

beforeEach(() => {
  calls.length = 0
  shares = []
  shared = null
  pageEnabled = true
})

describe('ShareSection (titular)', () => {
  it('cria link com validade e opções escolhidas', async () => {
    wrap(<ShareSection motorcycleId="m1" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Criar link de compartilhamento' }))
    expect(screen.getByText(/Nunca aparecem seus dados, chassi, observações nem o diário privado/)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Nome do link (opcional)'), 'Anúncio OLX')
    await userEvent.selectOptions(screen.getByLabelText('Validade'), '7')
    await userEvent.click(screen.getByLabelText(/Placa\./))
    await userEvent.click(screen.getByLabelText(/Valores dos serviços/))
    await userEvent.click(screen.getByRole('button', { name: 'Criar link' }))
    expect(calls[0]).toEqual({ fn: 'create', args: ['m1', 'Anúncio OLX', 7, {
      show_plate: true, show_mileage: true, show_history: true, show_values: true, show_attachments: false, show_diary: false,
    }] })
    expect(await screen.findByText('Anúncio OLX')).toBeInTheDocument()
    expect(screen.getByText(/Mostra: Histórico de serviços, Quilometragem documentada, Placa, Valores dos serviços/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /QR Code para Anúncio OLX/ })).toBeInTheDocument()
  })

  it('sem histórico, valores e comprovantes ficam indisponíveis', async () => {
    wrap(<ShareSection motorcycleId="m1" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Criar link de compartilhamento' }))
    await userEvent.click(screen.getByLabelText(/Histórico de serviços/))
    expect(screen.getByLabelText(/Valores dos serviços/)).toBeDisabled()
    expect(screen.getByLabelText(/Indicar comprovantes/)).toBeDisabled()
  })

  it('revoga com confirmação e move para encerrados', async () => {
    shares = [{ id: 's1', token: 'b'.repeat(48), label: 'Comprador João', status: 'active', expires_at: null, revoked_at: null, view_count: 3,
      last_viewed_at: null, created_at: '2026-11-07T10:00:00Z', show_plate: false, show_mileage: true, show_history: true, show_values: false,
      show_attachments: false, show_diary: false } as Share]
    wrap(<ShareSection motorcycleId="m1" />)
    const card = (await screen.findByText('Comprador João')).closest('li')!
    expect(within(card).getByText(/Sem prazo, 3 acessos/)).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Ver como o comprador' })).toHaveAttribute('href', expect.stringContaining(`/c/${'b'.repeat(48)}`))
    await userEvent.click(within(card).getByRole('button', { name: 'Revogar' }))
    await userEvent.click(within(card).getByRole('button', { name: 'Revogar' }))
    expect(calls).toContainEqual({ fn: 'revoke', args: ['s1'] })
    expect(await screen.findByText('Links encerrados (1)')).toBeInTheDocument()
  })
})

describe('SharedPassportPage (comprador)', () => {
  it('mostra só as seções escolhidas, sem valores quando não autorizados', async () => {
    shared = passport()
    renderShared('c'.repeat(48))
    expect(await screen.findByRole('heading', { name: 'Honda CB 500F ABS' })).toBeInTheDocument()
    expect(screen.getByText('Oficina de Origem')).toBeInTheDocument()
    expect(screen.getByText(/2 registros no histórico, 1 confirmado por oficina, 1 com comprovante/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Quilometragem documentada' })).toBeInTheDocument()
    const rev = screen.getByRole('article', { name: 'Revisão: Revisão dos 30 mil' })
    expect(within(rev).getByText('Confirmado por oficina')).toBeInTheDocument()
    expect(within(rev).getByText('Peças: Óleo Motul')).toBeInTheDocument()
    expect(screen.queryByText(/Valor/)).toBeNull()
    expect(screen.queryByText('Placa')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Diário' })).toBeNull()
    expect(screen.getByText(/não substitui a consulta ao DETRAN/)).toBeInTheDocument()
  })

  it('com placa, valores, comprovantes e diário escolhidos', async () => {
    const base = passport()
    shared = passport({
      options: { plate: true, mileage: false, history: true, values: true, attachments: true, diary: true },
      plate: 'ABC1234', mileage: undefined,
      history: [{ ...base.history![0]!, service_value_cents: 45000, attachments: [{ kind: 'invoice' }] }],
      diary: [{ entry_date: '2026-10-01', category: 'trip', title: 'Viagem à serra', body: null, location: 'Campos do Jordão', photo_count: 2 }],
    })
    renderShared('c'.repeat(48))
    expect(await screen.findByText('ABC-1234')).toBeInTheDocument()
    expect(screen.getByText('R$ 450,00')).toBeInTheDocument()
    expect(screen.getByText('Comprovantes: Nota fiscal')).toBeInTheDocument()
    expect(screen.getByText('Viagem à serra')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Quilometragem documentada' })).toBeNull()
  })

  it('link revogado, vencido ou inválido mostra indisponível', async () => {
    shared = null
    renderShared('c'.repeat(48))
    expect(await screen.findByRole('heading', { name: 'Link indisponível' })).toBeInTheDocument()
  })

  it('código com formato inválido nem consulta', async () => {
    renderShared('xyz')
    expect(await screen.findByRole('heading', { name: 'Link indisponível' })).toBeInTheDocument()
  })
})

describe('Página básica do QR Code', () => {
  it('titular desativa e reativa', async () => {
    wrap(<QrCodePanel publicId={'d'.repeat(32)} label="Honda-CB" motorcycleId="m1" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Desativar página básica' }))
    expect(calls).toContainEqual({ fn: 'setPage', args: ['m1', false] })
    expect(await screen.findByText(/vê "indisponível"/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reativar página básica' }))
    expect(calls).toContainEqual({ fn: 'setPage', args: ['m1', true] })
  })
})
