import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { OwnerAccess, PlateSearchResult, WorkshopAccess } from './api'

const calls: Array<{ fn: string; args: unknown[] }> = []
let searchResult: PlateSearchResult = { found: false }
let workshopList: WorkshopAccess[] = []
let ownerList: OwnerAccess[] = []

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api')
  return {
    ...actual,
    searchPlate: async (...args: unknown[]) => {
      calls.push({ fn: 'search', args })
      return searchResult
    },
    requestAccess: async (...args: unknown[]) => {
      calls.push({ fn: 'request', args })
      return { id: 'acc-new', status: 'pending', access_type: args[3] ? 'origin' : 'regular' }
    },
    setOrigin: async (...args: unknown[]) => {
      calls.push({ fn: 'setOrigin', args })
      ownerList = ownerList.map((a) => (a.id === args[0] ? { ...a, access_type: args[1] ? 'origin' : 'regular', origin_available: !args[1] } : a))
    },
    cancelRequest: async (...args: unknown[]) => {
      calls.push({ fn: 'cancel', args })
    },
    fetchWorkshopAccess: async () => workshopList,
    fetchMotorcycleAccess: async () => ownerList,
    decideAccess: async (...args: unknown[]) => {
      calls.push({ fn: 'decide', args })
      ownerList = ownerList.map((a) =>
        a.id === args[0]
          ? { ...a, status: args[1] ? 'approved' : 'rejected', access_type: args[1] && args[2] && a.access_type === 'origin' ? 'origin' : 'regular', decided_at: '2026-11-07T10:00:00Z' }
          : a,
      )
    },
    revokeAccess: async (...args: unknown[]) => {
      calls.push({ fn: 'revoke', args })
      ownerList = ownerList.map((a) => (a.id === args[0] ? { ...a, status: 'revoked', ended_at: '2026-11-07T11:00:00Z' } : a))
    },
  }
})

import { splitWorkshopAccess } from './api'
import { PlateSearchPanel } from './PlateSearchPanel'
import { WorkshopAccessList } from './WorkshopAccessList'
import { OwnerAccessSection, PendingRequestsNotice } from './OwnerAccessSection'

function wrap(node: React.ReactNode) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  )
}

const wa = (over: Partial<WorkshopAccess>): WorkshopAccess => ({
  id: 'w1', status: 'approved', access_type: 'regular', requested_at: '2026-11-01T10:00:00Z', decided_at: '2026-11-02T10:00:00Z',
  ended_at: null, brand: 'Honda', model: 'CB 500F', manufacturing_year: 2022, motorcycle_id: 'm1', plate: 'ABC1D23',
  latest_mileage: 18950, latest_mileage_at: '2026-10-20', ...over,
})
const oa = (over: Partial<OwnerAccess>): OwnerAccess => ({
  id: 'o1', status: 'pending', access_type: 'regular', message: 'Revisão no sábado', requested_at: '2026-11-06T10:00:00Z',
  decided_at: null, ended_at: null, end_reason: null, workshop_name: 'Oficina do Carlos', workshop_city: 'Barretos',
  workshop_state: 'SP', workshop_slug: 'oficina-do-carlos', workshop_verified: false, workshop_active: true, origin_available: true, ...over,
})

beforeEach(() => {
  calls.length = 0
})

describe('PlateSearchPanel', () => {
  it('valida a placa antes de pesquisar', async () => {
    wrap(<PlateSearchPanel organizationId="org1" />)
    await userEvent.type(screen.getByLabelText('Placa'), 'xx')
    await userEvent.click(screen.getByRole('button', { name: 'Pesquisar' }))
    expect(screen.getByText(/Placa inválida/)).toBeInTheDocument()
    expect(calls).toHaveLength(0)
  })

  it('placa não encontrada explica que o dono pode criar o passaporte', async () => {
    searchResult = { found: false }
    wrap(<PlateSearchPanel organizationId="org1" />)
    await userEvent.type(screen.getByLabelText('Placa'), 'abc-1d23')
    await userEvent.click(screen.getByRole('button', { name: 'Pesquisar' }))
    expect(calls[0]).toEqual({ fn: 'search', args: ['org1', 'ABC1D23'] })
    expect(await screen.findByText('Nenhuma moto com a placa ABC1D23')).toBeInTheDocument()
  })

  it('mostra só marca, modelo e ano e envia pedido com mensagem', async () => {
    searchResult = { found: true, brand: 'Honda', model: 'CB 500F', manufacturing_year: 2022, access_id: null, access_status: null, access_type: null, origin_available: false, motorcycle_id: null }
    wrap(<PlateSearchPanel organizationId="org1" />)
    await userEvent.type(screen.getByLabelText('Placa'), 'ABC1D23')
    await userEvent.click(screen.getByRole('button', { name: 'Pesquisar' }))
    expect(await screen.findByText('Honda CB 500F, 2022')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(/Mensagem para o titular/), 'Revisão sábado')
    await userEvent.click(screen.getByRole('button', { name: 'Pedir acesso' }))
    expect(calls).toContainEqual({ fn: 'request', args: ['org1', 'ABC1D23', 'Revisão sábado', false] })
    expect(await screen.findByText(/Aguardando a resposta do titular/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar pedido' }))
    expect(calls).toContainEqual({ fn: 'cancel', args: ['acc-new'] })
  })

  it('pedido recusado permite pedir de novo', async () => {
    searchResult = { found: true, brand: 'Honda', model: 'CB 500F', manufacturing_year: 2022, access_id: 'x', access_status: 'rejected', access_type: 'regular', origin_available: false, motorcycle_id: null }
    wrap(<PlateSearchPanel organizationId="org1" />)
    await userEvent.type(screen.getByLabelText('Placa'), 'ABC1D23')
    await userEvent.click(screen.getByRole('button', { name: 'Pesquisar' }))
    expect(await screen.findByText('O titular recusou o último pedido.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pedir de novo' })).toBeInTheDocument()
  })
})

describe('Oficina de Origem', () => {
  it('oficina pede reconhecimento quando a moto ainda aceita', async () => {
    searchResult = { found: true, brand: 'Honda', model: 'CB 500F', manufacturing_year: 2022, access_id: null, access_status: null, access_type: null, origin_available: true, motorcycle_id: null }
    wrap(<PlateSearchPanel organizationId="org1" />)
    await userEvent.type(screen.getByLabelText('Placa'), 'ABC1D23')
    await userEvent.click(screen.getByRole('button', { name: 'Pesquisar' }))
    await userEvent.click(await screen.findByLabelText(/Ajudamos a criar este passaporte/))
    await userEvent.click(screen.getByRole('button', { name: 'Pedir acesso' }))
    expect(calls).toContainEqual({ fn: 'request', args: ['org1', 'ABC1D23', '', true] })
    expect(await screen.findByText(/com reconhecimento como Oficina de Origem/)).toBeInTheDocument()
  })

  it('sem prazo ou com Origem definida, a opção não aparece', async () => {
    searchResult = { found: true, brand: 'Honda', model: 'CB 500F', manufacturing_year: 2022, access_id: null, access_status: null, access_type: null, origin_available: false, motorcycle_id: null }
    wrap(<PlateSearchPanel organizationId="org1" />)
    await userEvent.type(screen.getByLabelText('Placa'), 'ABC1D23')
    await userEvent.click(screen.getByRole('button', { name: 'Pesquisar' }))
    await screen.findByText('Honda CB 500F, 2022')
    expect(screen.queryByLabelText(/Ajudamos a criar este passaporte/)).toBeNull()
  })

  it('titular autoriza como Origem, depois tira o título', async () => {
    ownerList = [oa({ access_type: 'origin' })]
    wrap(<OwnerAccessSection motorcycleId="m1" />)
    expect(await screen.findByText('Pedido de acesso e reconhecimento como Oficina de Origem')).toBeInTheDocument()
    expect(screen.getByText(/não dá à oficina nenhuma propriedade/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Autorizar como Oficina de Origem' }))
    expect(calls).toContainEqual({ fn: 'decide', args: ['o1', true, true] })
    await userEvent.click(await screen.findByRole('button', { name: 'Tirar título de Origem' }))
    expect(calls).toContainEqual({ fn: 'setOrigin', args: ['o1', false] })
    expect(await screen.findByRole('button', { name: 'Definir como Oficina de Origem' })).toBeInTheDocument()
  })

  it('titular pode autorizar pedido de Origem só como acesso', async () => {
    ownerList = [oa({ access_type: 'origin' })]
    wrap(<OwnerAccessSection motorcycleId="m1" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Autorizar só o acesso' }))
    expect(calls).toContainEqual({ fn: 'decide', args: ['o1', true, false] })
  })

  it('se a moto já tem Origem, só autoriza o acesso', async () => {
    ownerList = [oa({ access_type: 'origin', origin_available: false })]
    wrap(<OwnerAccessSection motorcycleId="m1" />)
    expect(await screen.findByRole('button', { name: 'Autorizar só o acesso' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Autorizar como Oficina de Origem' })).toBeNull()
  })

  it('lista da oficina mostra o título', async () => {
    workshopList = [wa({ access_type: 'origin' })]
    wrap(<WorkshopAccessList organizationId="org1" />)
    expect(await screen.findByText('Oficina de Origem')).toBeInTheDocument()
  })
})

describe('WorkshopAccessList', () => {
  it('separa autorizadas, pendentes e histórico; placa e km só nas autorizadas', async () => {
    workshopList = [
      wa({}),
      wa({ id: 'w2', status: 'pending', plate: null, latest_mileage: null, motorcycle_id: null, decided_at: null, model: 'Fazer 250' }),
      wa({ id: 'w3', status: 'revoked', plate: null, latest_mileage: null, motorcycle_id: null, ended_at: '2026-11-05T10:00:00Z', model: 'MT-03' }),
    ]
    expect(splitWorkshopAccess(workshopList).closed.map((a) => a.id)).toEqual(['w3'])
    wrap(<WorkshopAccessList organizationId="org1" />)
    expect(await screen.findByRole('heading', { name: 'Motos autorizadas (1)' })).toBeInTheDocument()
    expect(screen.getByText('ABC1D23')).toBeInTheDocument()
    expect(screen.getByText('18.950 km')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Aguardando o titular (1)' })).toBeInTheDocument()
    expect(screen.getByText('Histórico de pedidos (1)')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar pedido' }))
    expect(calls).toContainEqual({ fn: 'cancel', args: ['w2'] })
  })
})

describe('OwnerAccessSection', () => {
  it('autoriza pedido pendente e depois revoga com confirmação', async () => {
    ownerList = [oa({})]
    wrap(<OwnerAccessSection motorcycleId="m1" />)
    expect(await screen.findByText('“Revisão no sábado”')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Oficina do Carlos' })).toHaveAttribute('href', '/oficinas/oficina-do-carlos')
    await userEvent.click(screen.getByRole('button', { name: 'Autorizar' }))
    expect(calls).toContainEqual({ fn: 'decide', args: ['o1', true, false] })
    await userEvent.click(await screen.findByRole('button', { name: 'Revogar acesso' }))
    expect(calls.some((c) => c.fn === 'revoke')).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: 'Revogar' }))
    expect(calls).toContainEqual({ fn: 'revoke', args: ['o1'] })
    expect(await screen.findByText('Histórico de autorizações (1)')).toBeInTheDocument()
  })

  it('recusa pedido', async () => {
    ownerList = [oa({})]
    wrap(<OwnerAccessSection motorcycleId="m1" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Recusar' }))
    expect(calls).toContainEqual({ fn: 'decide', args: ['o1', false] })
  })

  it('oficina suspensa não pode ser autorizada', async () => {
    ownerList = [oa({ workshop_active: false })]
    wrap(<OwnerAccessSection motorcycleId="m1" />)
    expect(await screen.findByRole('button', { name: 'Autorizar' })).toBeDisabled()
    expect(screen.getByText('Esta oficina está suspensa na plataforma.')).toBeInTheDocument()
  })

  it('aviso do painel leva à moto', () => {
    wrap(<PendingRequestsNotice requests={[{ id: 'p', motorcycle_id: 'm1', motorcycle_label: 'Honda CB 500F', workshop_name: 'Oficina do Carlos' }]} />)
    const notice = screen.getByRole('status')
    expect(within(notice).getByText('Uma oficina pediu acesso')).toBeInTheDocument()
    expect(within(notice).getByRole('link', { name: 'Honda CB 500F' })).toHaveAttribute('href', '/painel/motos/m1#oficinas')
  })
})
