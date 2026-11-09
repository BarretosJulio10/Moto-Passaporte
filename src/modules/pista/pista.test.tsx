import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { audioFormat, pistaUrl, vehicleLabel, type PistaOrder } from './api'

const queued: Array<{ kind: string; args: Record<string, unknown> }> = []

vi.mock('./outbox', () => ({
  enqueue: async (e: { kind: string; args: Record<string, unknown> }) => { queued.push(e) },
  onEntrySent: () => {},
}))

const order: PistaOrder = {
  id: 'os1', number: 12, status: 'awaiting_execution', due_date: null, km_in: 18000, km_out: null,
  notes: 'Barulho na corrente', technical_notes: null, mine: true, mechanic_user_id: 'u-me', mechanic_name: 'Davi',
  customer_name: 'João', vehicle: { plate: 'ABC1D23', brand: 'Honda', model: 'CG 160', year: 2022, color: null },
  items: [{ id: 'it1', position: 1, kind: 'labor', description: 'Trocar relação', quantity: 1, status: 'pending', notes: null, part_brand: null, part_code: null, executed_at: null, executed_by_name: null }],
  photos: [], notes_list: [], audios: [], inspections: {},
}

vi.mock('./PistaApp', () => ({
  usePista: () => ({
    shop: { organization_id: 'org1', name: 'Oficina', is_responsible: false, allow_unassigned: true, allow_ready: true, user_name: 'Davi' },
    userId: 'u-me', outbox: [], online: true,
  }),
  cacheRead: () => order,
  withCache: async () => order,
}))

describe('App da Pista (ADR-057)', () => {
  it('reconhece os formatos de áudio dos celulares', () => {
    expect(audioFormat('audio/mp4')).toEqual({ mime: 'audio/mp4', ext: 'm4a' })
    expect(audioFormat('audio/webm;codecs=opus')).toEqual({ mime: 'audio/webm', ext: 'webm' })
    expect(audioFormat('audio/ogg;codecs=opus')).toEqual({ mime: 'audio/ogg', ext: 'ogg' })
    expect(audioFormat('audio/wav')).toBeNull()
  })

  it('link de instalação e nome da moto', () => {
    expect(pistaUrl(undefined, 'https://exemplo.com.br')).toBe('https://exemplo.com.br/pista')
    expect(pistaUrl('ab12cd', 'https://exemplo.com.br')).toBe('https://exemplo.com.br/pista/ab12cd')
    expect(vehicleLabel({ brand: 'Honda', model: 'CG 160', year: 2022 })).toBe('Honda CG 160 2022')
    expect(vehicleLabel(null)).toBe('Moto sem cadastro')
  })

  it('OS na pista: sem preço, marca item e inicia pela fila', async () => {
    const { PistaOrderPage } = await import('./PistaOrderPage')
    const router = createMemoryRouter([{ path: '/pista/os/:orderId', element: <PistaOrderPage /> }], { initialEntries: ['/pista/os/os1'] })
    render(<QueryClientProvider client={new QueryClient()}><RouterProvider router={router} /></QueryClientProvider>)
    expect(await screen.findByText('ABC1D23')).toBeInTheDocument()
    expect(screen.getByText(/Barulho na corrente/)).toBeInTheDocument()
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Trocar relação/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar' }))
    expect(queued).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'item', args: { item: 'it1', status: 'done' } }),
      expect.objectContaining({ kind: 'status', args: { status: 'in_progress' } }),
    ]))
    await userEvent.type(screen.getByRole('textbox', { name: 'Nova nota' }), 'Retentor vazando')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar nota' }))
    expect(queued.at(-1)).toEqual(expect.objectContaining({ kind: 'note', args: { body: 'Retentor vazando', item: null } }))
  })
})
