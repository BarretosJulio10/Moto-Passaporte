import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { validate } from '@/core/auth/schemas'
import { todayISO } from '@/core/shared/format'
import { diarySchema } from './schemas'
import type { DiaryEntry } from './api'

const calls: Array<{ fn: string; args: unknown[] }> = []
let diaryData: DiaryEntry[] = []
vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api')
  return {
    ...actual,
    fetchDiary: async () => diaryData,
    createDiaryEntry: async (...args: unknown[]) => {
      calls.push({ fn: 'create', args })
      return 'new-entry'
    },
    updateDiaryEntry: async (...args: unknown[]) => {
      calls.push({ fn: 'update', args })
    },
    deleteDiaryEntry: async (...args: unknown[]) => {
      calls.push({ fn: 'delete', args })
      diaryData = diaryData.filter((e) => e.id !== args[0])
    },
    deleteDiaryPhoto: async (...args: unknown[]) => {
      calls.push({ fn: 'deletePhoto', args })
    },
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

import { groupByYear } from './api'
import { DiaryPage } from './DiaryPage'
import { DiaryFormPage } from './DiaryFormPage'

const entry = (over: Partial<DiaryEntry>): DiaryEntry => ({
  id: 'd1',
  motorcycle_id: 'm1',
  category: 'trip',
  title: 'Viagem à Serra',
  body: 'Subida linda.',
  entry_date: '2026-10-01',
  location: 'Serra do Rio do Rastro',
  visibility: 'private',
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-01T10:00:00Z',
  is_mine: true,
  photos: [],
  ...over,
})

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/painel/motos/:id/diario', element: <DiaryPage /> },
      { path: '/painel/motos/:id/diario/novo', element: <DiaryFormPage /> },
      { path: '/painel/motos/:id/diario/:entryId/editar', element: <DiaryFormPage /> },
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

describe('regras do diário', () => {
  const base = { category: 'trip', title: 'Viagem', entryDate: '2026-01-10', body: '', location: '', visibility: 'private' }
  it('aceita entrada válida e limpa campos vazios', () => {
    const r = validate(diarySchema, base)
    expect(r.ok && r.data.body === undefined && r.data.location === undefined).toBe(true)
  })
  it('recusa título vazio, data futura e texto longo', () => {
    expect(validate(diarySchema, { ...base, title: '  ' }).ok).toBe(false)
    expect(validate(diarySchema, { ...base, entryDate: '2999-01-01' }).ok).toBe(false)
    expect(validate(diarySchema, { ...base, body: 'x'.repeat(5001) }).ok).toBe(false)
    expect(validate(diarySchema, { ...base, category: '' }).ok).toBe(false)
  })
  it('agrupa por ano', () => {
    const g = groupByYear([entry({ id: 'a', entry_date: '2026-02-01' }), entry({ id: 'b', entry_date: '2026-01-01' }), entry({ id: 'c', entry_date: '2025-05-01' })])
    expect(g.map((x) => [x.year, x.entries.length])).toEqual([['2026', 2], ['2025', 1]])
  })
})

describe('DiaryPage', () => {
  beforeEach(() => {
    calls.length = 0
    diaryData = [
      entry({ id: 'd2', title: 'Escapamento novo', category: 'customization', entry_date: '2026-10-05', location: null }),
      entry({ id: 'd1', visibility: 'shareable', photos: [{ id: 'p1', storage_path: 'm1/x.jpg', file_name: 'serra.jpg', mime_type: 'image/jpeg', file_size: 200000, kind: 'photo', created_at: '2026-10-01T10:00:00Z' }] }),
      entry({ id: 'd0', title: 'Primeiro passeio', category: 'first_ride', entry_date: '2024-03-01', visibility: 'shareable', is_mine: false, location: null }),
    ]
  })

  it('mostra entradas por ano, visibilidade e entrada de dono anterior sem ações', async () => {
    renderAt('/painel/motos/m1/diario')
    const trip = await screen.findByRole('article', { name: 'Viagem à Serra' })
    expect(within(trip).getByText('Compartilhável')).toBeInTheDocument()
    expect(within(trip).getByText('Local: Serra do Rio do Rastro')).toBeInTheDocument()
    expect(await within(trip).findByRole('link', { name: /Abrir Foto: serra.jpg/ })).toBeInTheDocument()
    const old = screen.getByRole('article', { name: 'Primeiro passeio' })
    expect(within(old).getByText('Escrita por um dono anterior.')).toBeInTheDocument()
    expect(within(old).queryByRole('link', { name: 'Editar' })).toBeNull()
    expect(within(old).queryByRole('button', { name: 'Excluir' })).toBeNull()
    expect(screen.getByRole('heading', { name: '2024' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Diário' })).toHaveAttribute('href', '/painel/motos/m1/diario')
  })

  it('filtra por visibilidade', async () => {
    renderAt('/painel/motos/m1/diario')
    await screen.findByRole('article', { name: 'Viagem à Serra' })
    await userEvent.click(screen.getByRole('button', { name: 'Privadas' }))
    expect(screen.getByRole('article', { name: 'Escapamento novo' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Viagem à Serra' })).toBeNull()
  })

  it('exclui com confirmação', async () => {
    renderAt('/painel/motos/m1/diario')
    const trip = await screen.findByRole('article', { name: 'Viagem à Serra' })
    await userEvent.click(within(trip).getByRole('button', { name: 'Excluir' }))
    expect(within(trip).getByText(/e a foto\? Não dá para desfazer/)).toBeInTheDocument()
    await userEvent.click(within(trip).getByRole('button', { name: 'Excluir' }))
    expect(calls).toContainEqual({ fn: 'delete', args: ['d1'] })
    expect(await screen.findByRole('article', { name: 'Escapamento novo' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Viagem à Serra' })).toBeNull()
  })

  it('estado vazio explica o diário', async () => {
    diaryData = []
    renderAt('/painel/motos/m1/diario')
    expect(await screen.findByRole('heading', { name: 'Conte a história da sua moto' })).toBeInTheDocument()
  })
})

describe('DiaryFormPage', () => {
  beforeEach(() => {
    calls.length = 0
    diaryData = [entry({ id: 'd1', photos: [{ id: 'p1', storage_path: 'm1/x.jpg', file_name: 'serra.jpg', mime_type: 'image/jpeg', file_size: 200000, kind: 'photo', created_at: '2026-10-01T10:00:00Z' }] })]
  })

  it('valida e cria entrada privada por padrão', async () => {
    const router = renderAt('/painel/motos/m1/diario/novo')
    await userEvent.click(await screen.findByRole('button', { name: 'Salvar entrada' }))
    expect(screen.getByText('Escolha o tipo.')).toBeInTheDocument()
    expect(screen.getByText('Informe um título.')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'meetup')
    await userEvent.type(screen.getByLabelText('Título'), 'Encontro de motos')
    expect(screen.getByLabelText(/Privado/)).toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: 'Salvar entrada' }))
    expect(calls[0]).toEqual({
      fn: 'create',
      args: ['m1', { category: 'meetup', title: 'Encontro de motos', entryDate: todayISO(), body: undefined, location: undefined, visibility: 'private' }],
    })
    expect(router.state.location.pathname).toBe('/painel/motos/m1/diario')
  })

  it('edita, muda visibilidade e remove foto', async () => {
    renderAt('/painel/motos/m1/diario/d1/editar')
    expect(await screen.findByDisplayValue('Viagem à Serra')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remover foto' }))
    expect(calls.some((c) => c.fn === 'deletePhoto')).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: 'Remover' }))
    expect(calls).toContainEqual({ fn: 'deletePhoto', args: ['p1'] })
    expect(screen.queryByText('serra.jpg')).toBeNull()
    await userEvent.click(screen.getByLabelText(/Compartilhável/))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    const upd = calls.find((c) => c.fn === 'update')
    expect(upd?.args[0]).toBe('d1')
    expect((upd?.args[1] as { visibility: string }).visibility).toBe('shareable')
  })

  it('não edita entrada de outro dono', async () => {
    diaryData = [entry({ id: 'd9', is_mine: false })]
    renderAt('/painel/motos/m1/diario/d9/editar')
    expect(await screen.findByText('Entrada não encontrada')).toBeInTheDocument()
  })
})
