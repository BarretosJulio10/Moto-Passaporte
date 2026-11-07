import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { TimelineEntry } from '@/modules/maintenance/api'
import type { WorkshopAccess } from '@/modules/workshop_access/api'
import type { MyWorkshop } from '@/modules/workshop/api'

const calls: Array<{ fn: string; args: unknown[] }> = []
let shop: MyWorkshop
let access: WorkshopAccess[] = []
let timeline: TimelineEntry[] = []

vi.mock('@/modules/workshop/WorkshopIndexPage', () => ({
  useMyWorkshops: () => ({ isLoading: false, data: [shop] }),
}))
vi.mock('@/modules/workshop_access/api', async () => {
  const actual = await vi.importActual<typeof import('@/modules/workshop_access/api')>('@/modules/workshop_access/api')
  return { ...actual, fetchWorkshopAccess: async () => access }
})
vi.mock('./api', () => ({
  fetchWorkshopTimeline: async () => timeline,
  getWorkshopStorageUsage: async () => ({ used_bytes: 0, quota_bytes: 524288000, max_file_bytes: 10485760 }),
  createWorkshopService: async (...args: unknown[]) => {
    calls.push({ fn: 'create', args })
    return { id: 'new', below_previous: false }
  },
}))
vi.mock('@/modules/attachments/api', () => ({
  getStorageUsage: async () => ({ used_bytes: 0, quota_bytes: 1, max_file_bytes: 1 }),
  uploadAll: async (...args: unknown[]) => {
    calls.push({ fn: 'upload', args })
    return []
  },
  signedUrls: async (paths: string[]) => Object.fromEntries(paths.map((p) => [p, `https://files.test/${p}`])),
}))

import { WorkshopMotoPage, WorkshopServiceFormPage } from './WorkshopMotoPage'

const entry = (over: Partial<TimelineEntry>): TimelineEntry =>
  ({
    id: 'r1', motorcycle_id: 'm1', category: 'revision', title: 'Revisão', description: null, service_date: '2026-11-01',
    mileage: 30500, source_type: 'workshop', organization_id: 'org1', workshop_name: 'Oficina do Zé', service_value_cents: 45000,
    notes: 'Obs', corrects_record_id: null, correction_reason: null, is_void: false, created_at: '2026-11-01T10:00:00Z',
    status: 'current', items: [], attachments: [], evidence_level: 'workshop', recorded_by_name: 'Paulo', is_own: true, ...over,
  }) as TimelineEntry

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/oficina/:orgId/motos/:motoId', element: <WorkshopMotoPage /> },
      { path: '/oficina/:orgId/motos/:motoId/servico', element: <WorkshopServiceFormPage /> },
    ],
    { initialEntries: [path] },
  )
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

beforeEach(() => {
  calls.length = 0
  shop = {
    organization_id: 'org1', role: 'staff', can_request_access: true, can_register_services: true, business_name: 'Oficina do Zé',
    public_slug: 'oficina-do-ze', city: null, state: null, verification_status: 'unverified',
  }
  access = [{
    id: 'a1', status: 'approved', access_type: 'regular', requested_at: '2026-10-01T10:00:00Z', decided_at: '2026-10-02T10:00:00Z',
    ended_at: null, brand: 'Honda', model: 'CB 500F', manufacturing_year: 2022, motorcycle_id: 'm1', plate: 'ABC1D23',
    latest_mileage: 30500, latest_mileage_at: '2026-11-01',
  }]
  timeline = [
    entry({}),
    entry({ id: 'r0', category: 'tires', title: 'Pneu do dono', source_type: 'owner', evidence_level: 'document', organization_id: null, workshop_name: null,
            service_value_cents: null, notes: null, recorded_by_name: null, is_own: false, service_date: '2026-09-01' }),
  ]
})

describe('WorkshopMotoPage', () => {
  it('mostra a moto e o histórico com dados privados só do próprio registro', async () => {
    renderAt('/oficina/org1/motos/m1')
    expect(await screen.findByRole('heading', { name: 'Honda CB 500F, 2022' })).toBeInTheDocument()
    expect(screen.getByText('ABC1D23')).toBeInTheDocument()
    const own = await screen.findByRole('article', { name: 'Revisão: Revisão' })
    expect(within(own).getByText('Confirmado por oficina')).toBeInTheDocument()
    expect(within(own).getByText('Paulo')).toBeInTheDocument()
    expect(within(own).getByText('R$ 450,00')).toBeInTheDocument()
    expect(within(own).getByRole('link', { name: 'Corrigir' })).toHaveAttribute('href', '/oficina/org1/motos/m1/servico?corrigir=r1')
    expect(within(own).queryByRole('button', { name: 'Anular' })).toBeNull()
    const other = screen.getByRole('article', { name: 'Pneus: Pneu do dono' })
    expect(within(other).queryByText(/R\$/)).toBeNull()
    expect(within(other).queryByRole('link', { name: 'Corrigir' })).toBeNull()
    expect(within(other).queryByRole('button', { name: /Anexar/ })).toBeNull()
    expect(screen.getByRole('link', { name: 'Registrar serviço' })).toHaveAttribute('href', '/oficina/org1/motos/m1/servico')
  })

  it('sem permissão de registrar, explica e esconde o botão', async () => {
    shop = { ...shop, can_register_services: false }
    renderAt('/oficina/org1/motos/m1')
    expect(await screen.findByText(/não inclui registrar serviços/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Registrar serviço' })).toBeNull()
  })

  it('sem autorização ativa, não mostra a moto', async () => {
    access = []
    renderAt('/oficina/org1/motos/m1')
    expect(await screen.findByRole('heading', { name: 'Sem acesso a esta moto' })).toBeInTheDocument()
  })
})

describe('WorkshopServiceFormPage', () => {
  it('registra serviço como oficina, sem o campo de oficina em texto livre', async () => {
    const router = renderAt('/oficina/org1/motos/m1/servico')
    expect(await screen.findByText(/aparece para o titular como "Confirmado por oficina"/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Oficina (opcional)')).toBeNull()
    await userEvent.selectOptions(screen.getByLabelText('Categoria'), 'oil_change')
    await userEvent.type(screen.getByLabelText('Quilometragem (opcional)'), '31000')
    await userEvent.click(screen.getByRole('button', { name: /Salvar/ }))
    const call = calls.find((c) => c.fn === 'create')
    expect(call?.args.slice(0, 2)).toEqual(['org1', 'm1'])
    expect((call?.args[2] as { category: string; mileage: number }).category).toBe('oil_change')
    expect((call?.args[2] as { mileage: number }).mileage).toBe(31000)
    expect(router.state.location.pathname).toBe('/oficina/org1/motos/m1')
  })

  it('não corrige registro de outra origem', async () => {
    renderAt('/oficina/org1/motos/m1/servico?corrigir=r0')
    expect(await screen.findByText(/só corrige os próprios registros/)).toBeInTheDocument()
  })
})
