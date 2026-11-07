import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { validate } from '@/core/auth/schemas'
import { formatBRL, maintenanceSchema, parseBRL } from './schemas'
import type { TimelineEntry } from './api'

// Stubs (sem vi.fn para rejeições — ver RegisterMotorcyclePage.test.tsx).
const created: Array<{ input: unknown; items: unknown }> = []
let timelineData: TimelineEntry[] = []
vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api')
  return {
    ...actual,
    fetchTimeline: async () => timelineData,
    createMaintenanceRecord: async (_id: string, input: unknown, items: unknown) => {
      created.push({ input, items })
      return { id: 'new', below_previous: false }
    },
    voidMaintenanceRecord: async () => 'void',
  }
})
vi.mock('@/modules/attachments/api', () => ({
  getStorageUsage: async () => ({ used_bytes: 0, quota_bytes: 104857600, max_file_bytes: 10485760 }),
  uploadAll: async () => [],
  signedUrls: async (paths: string[]) => Object.fromEntries(paths.map((p) => [p, `https://files.test/${p}`])),
}))
vi.mock('@/modules/motorcycles/api', () => ({
  fetchMotorcycle: async () => ({ id: 'm1', brand: 'Honda', model: 'CB 500F', version: null, passport_created_at: '2026-01-01T00:00:00Z' }),
}))

import { applyFilters, EMPTY_FILTERS } from './api'
import { TimelinePage } from './TimelinePage'
import { RecordFormPage } from './RecordFormPage'

const entry = (over: Partial<TimelineEntry>): TimelineEntry => ({
  id: 'r1',
  motorcycle_id: 'm1',
  category: 'oil_change',
  title: 'Troca de óleo',
  description: null,
  service_date: '2026-10-01',
  mileage: 16000,
  source_type: 'owner',
  organization_id: null,
  workshop_name: 'Oficina do Bairro',
  service_value_cents: 25000,
  notes: null,
  corrects_record_id: null,
  correction_reason: null,
  is_void: false,
  created_at: '2026-10-01T10:00:00Z',
  status: 'current',
  items: [],
  attachments: [],
  evidence_level: over.source_type ?? 'owner',
  ...over,
})

describe('valores em reais', () => {
  it('converte formatos brasileiros para centavos', () => {
    expect(parseBRL('250')).toBe(25000)
    expect(parseBRL('250,5')).toBe(25050)
    expect(parseBRL('1.250,90')).toBe(125090)
    expect(parseBRL('R$ 80,00')).toBe(8000)
    expect(parseBRL('')).toBeUndefined()
    expect(parseBRL('12,345')).toBeNaN()
  })
  it('formata centavos', () => {
    expect(formatBRL(125090).replace(/\s/g, ' ')).toBe('R$ 1.250,90')
  })
})

describe('maintenanceSchema', () => {
  const base = { category: 'oil_change', title: 'Troca de óleo', serviceDate: '2026-01-10', mileage: '16.000', workshopName: '', value: '250,00', description: '', notes: '', correctionReason: '' }
  it('aceita um registro válido', () => {
    const r = validate(maintenanceSchema, { ...base, correctsRecordId: '' })
    expect(r.ok && r.data).toMatchObject({ mileage: 16000, value: 25000 })
  })
  it('exige categoria e recusa data futura e valor inválido', () => {
    const r = validate(maintenanceSchema, { ...base, category: '', serviceDate: '2999-01-01', value: 'abc', correctsRecordId: '' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors.category).toBeDefined()
      expect(r.errors.serviceDate).toMatch(/futuro/)
      expect(r.errors.value).toMatch(/Valor inválido/)
    }
  })
  it('correção exige motivo', () => {
    const r = validate(maintenanceSchema, { ...base, correctsRecordId: 'r1' })
    expect(!r.ok && r.errors.correctionReason).toMatch(/motivo/)
  })
})

describe('filtros da linha do tempo', () => {
  const data = [
    entry({ id: 'a' }),
    entry({ id: 'b', category: 'tires', source_type: 'workshop', workshop_name: 'Pneus Já', service_date: '2025-05-01' }),
    entry({ id: 'c', status: 'superseded' }),
    entry({ id: 'd', is_void: true, corrects_record_id: 'c', correction_reason: 'engano' }),
  ]
  it('esconde versões substituídas e anulações por padrão', () => {
    expect(applyFilters(data, EMPTY_FILTERS).map((e) => e.id)).toEqual(['a', 'b'])
    expect(applyFilters(data, { ...EMPTY_FILTERS, showSuperseded: true })).toHaveLength(4)
  })
  it('filtra por categoria, origem, oficina e período', () => {
    expect(applyFilters(data, { ...EMPTY_FILTERS, category: 'tires' }).map((e) => e.id)).toEqual(['b'])
    expect(applyFilters(data, { ...EMPTY_FILTERS, source: 'workshop' }).map((e) => e.id)).toEqual(['b'])
    expect(applyFilters(data, { ...EMPTY_FILTERS, workshop: 'Oficina do Bairro' }).map((e) => e.id)).toEqual(['a'])
    expect(applyFilters(data, { ...EMPTY_FILTERS, from: '2026-01-01' }).map((e) => e.id)).toEqual(['a'])
  })
})

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/painel/motos/:id/historico', element: <TimelinePage /> },
      { path: '/painel/motos/:id/historico/novo', element: <RecordFormPage /> },
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

describe('TimelinePage', () => {
  beforeEach(() => {
    timelineData = [
      entry({ id: 'r2', title: 'Troca de óleo e vela', corrects_record_id: 'r1', correction_reason: 'Faltou a vela', items: [{ id: 'i1', item_name: 'Vela', brand: 'NGK', part_number: null, quantity: 2, notes: null }] }),
      entry({ id: 'r1', status: 'superseded' }),
      entry({ id: 'w1', title: 'Pneu traseiro', category: 'tires', source_type: 'workshop', organization_id: 'o1', service_date: '2025-03-10' }),
    ]
  })

  it('mostra registros vigentes agrupados por ano, com origem e correção', async () => {
    renderAt('/painel/motos/m1/historico')
    const card = await screen.findByRole('article', { name: 'Troca de óleo: Troca de óleo e vela' })
    expect(within(card).getByText('Informado pelo dono')).toBeInTheDocument()
    expect(within(card).getByText(/Motivo: Faltou a vela/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '2026' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '2025' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Troca de óleo: Troca de óleo' })).not.toBeInTheDocument()
  })

  it('registro de oficina não pode ser corrigido nem anulado pelo dono', async () => {
    renderAt('/painel/motos/m1/historico')
    const card = await screen.findByRole('article', { name: 'Pneus: Pneu traseiro' })
    expect(within(card).getByText('Confirmado por oficina')).toBeInTheDocument()
    expect(within(card).queryByRole('link', { name: 'Corrigir' })).not.toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Anular' })).not.toBeInTheDocument()
  })
})

describe('comprovantes no histórico', () => {
  it('registro com anexo mostra carimbo de comprovante e o arquivo', async () => {
    timelineData = [
      entry({
        id: 'd1',
        evidence_level: 'document',
        attachments: [{ id: 'a1', storage_path: 'm1/x.jpg', file_name: 'nota.jpg', mime_type: 'image/jpeg', file_size: 300000, kind: 'invoice', created_at: '2026-10-01T10:00:00Z' }],
      }),
    ]
    renderAt('/painel/motos/m1/historico')
    const card = await screen.findByRole('article', { name: /Troca de óleo/ })
    expect(within(card).getByText('Com comprovante')).toBeInTheDocument()
    const link = await within(card).findByRole('link', { name: /Abrir Nota fiscal: nota.jpg/ })
    expect(link).toHaveAttribute('href', 'https://files.test/m1/x.jpg')
    expect(within(card).getByRole('button', { name: 'Anexar mais' })).toBeInTheDocument()
  })
  it('filtro de origem usa o nível de evidência', () => {
    const data = [entry({ id: 'a' }), entry({ id: 'b', evidence_level: 'document' })]
    expect(applyFilters(data, { ...EMPTY_FILTERS, source: 'document' }).map((e) => e.id)).toEqual(['b'])
  })
})

describe('RecordFormPage', () => {
  beforeEach(() => {
    created.length = 0
    timelineData = [entry({ id: 'r1' })]
  })

  it('sugere título pela categoria e envia peças preenchidas', async () => {
    const user = userEvent.setup()
    renderAt('/painel/motos/m1/historico/novo')
    await user.selectOptions(await screen.findByLabelText('Categoria'), 'tires')
    expect(screen.getByLabelText('Título')).toHaveValue('Troca de pneus')
    await user.click(screen.getByRole('button', { name: 'Adicionar peça' }))
    await user.type(screen.getByLabelText('Peça 1'), 'Pneu traseiro')
    await user.type(screen.getByLabelText('Fabricante'), 'Pirelli')
    await user.click(screen.getByRole('button', { name: 'Adicionar peça' }))
    await user.click(screen.getByRole('button', { name: 'Salvar registro' }))
    expect(created).toHaveLength(1)
    expect(created[0]!.input).toMatchObject({ category: 'tires', title: 'Troca de pneus' })
    expect(created[0]!.items).toEqual([{ item_name: 'Pneu traseiro', brand: 'Pirelli', part_number: undefined, quantity: 1 }])
  })

  it('correção abre preenchida e exige motivo', async () => {
    const user = userEvent.setup()
    renderAt('/painel/motos/m1/historico/novo?corrigir=r1')
    expect(await screen.findByLabelText('Título')).toHaveValue('Troca de óleo')
    expect(screen.getByLabelText('Valor em R$ (opcional)')).toHaveValue('250,00')
    await user.click(screen.getByRole('button', { name: 'Registrar correção' }))
    expect(created).toHaveLength(0)
    expect(screen.getByText('Explique o motivo da correção.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Motivo da correção'), 'Valor errado')
    await user.click(screen.getByRole('button', { name: 'Registrar correção' }))
    expect(created[0]!.input).toMatchObject({ correctsRecordId: 'r1', correctionReason: 'Valor errado' })
  })
})
