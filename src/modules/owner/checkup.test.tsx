import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CareStatus } from '@/modules/motorcycles/careApi'

const calls: Array<{ fn: string; args: unknown[] }> = []
let care: CareStatus
const base = (): CareStatus => ({
  current_km: 19430,
  km_updated_at: new Date(Date.now() - 9 * 86_400_000).toISOString(),
  oil: { enabled: true, configured: true, interval_km: 1000, last_change_km: 18950, last_change_from: 'history', last_change_date: '2026-10-20',
    next_km: 19950, km_left: 520, soon_before: 500, status: 'ok' },
  chain: { enabled: true, interval_days: 7, last_done_at: null, next_at: null, due: true },
})

vi.mock('@/modules/motorcycles/careApi', async () => {
  const actual = await vi.importActual<typeof import('@/modules/motorcycles/careApi')>('@/modules/motorcycles/careApi')
  return {
    ...actual,
    fetchCare: async () => care,
    setCare: async (...args: unknown[]) => { calls.push({ fn: 'setCare', args }); return care },
    markCareDone: async (...args: unknown[]) => {
      calls.push({ fn: 'markCareDone', args })
      care = { ...care, chain: { ...care.chain, due: false, last_done_at: new Date().toISOString() } }
      return care
    },
  }
})
vi.mock('@/modules/motorcycles/api', () => ({
  recordMileage: async (...args: unknown[]) => { calls.push({ fn: 'recordMileage', args }); return { id: 'k1', below_previous: false } },
}))

import { CheckupPage } from './CheckupPage'

function wrap() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/painel/motos/m1/checkup']}>
        <Routes><Route path="/painel/motos/:id/checkup" element={<CheckupPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  calls.length = 0
  care = base()
})

describe('Check-up da moto (ADR-041)', () => {
  it('mostra km desatualizado, óleo e corrente; atualiza o km com um campo', async () => {
    const user = userEvent.setup()
    wrap()
    expect(await screen.findByText(/há 9 dias/)).toBeVisible()
    expect(screen.getByText('Faltam 520 km')).toBeVisible()
    expect(screen.getByText(/Confira a folga e lubrifique a corrente/)).toBeVisible()
    await user.type(screen.getByLabelText('Km agora'), '19.820')
    await user.click(screen.getByRole('button', { name: 'Salvar km' }))
    expect(await screen.findByText('Km atualizado.')).toBeVisible()
    expect((calls.find((c) => c.fn === 'recordMileage')!.args[1] as { mileage: number }).mileage).toBe(19820)
  })

  it('óleo vencido em destaque, com atalho para registrar a troca', async () => {
    care = { ...base(), oil: { ...base().oil, km_left: -120, status: 'due' } }
    wrap()
    expect(await screen.findByText('Vencida há 120 km')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Registrar troca de óleo' })).toHaveAttribute('href', '/painel/motos/m1/historico/novo?categoria=oil_change')
  })

  it('sem intervalo definido pede o intervalo; corrente conferida e frequência', async () => {
    const user = userEvent.setup()
    care = { ...base(), oil: { ...base().oil, configured: false } }
    wrap()
    expect(await screen.findByLabelText('Trocar a cada (km)')).toHaveValue('1000')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(calls.find((c) => c.fn === 'setCare')!.args).toEqual(['m1', 'oil_change', 1000, true, null])
    await user.click(screen.getByRole('button', { name: 'Conferi e lubrifiquei' }))
    expect(calls.some((c) => c.fn === 'markCareDone' && c.args[1] === 'chain_check')).toBe(true)
    await user.selectOptions(screen.getByLabelText('Lembrar'), 'off')
    expect(calls.filter((c) => c.fn === 'setCare').at(-1)!.args).toEqual(['m1', 'chain_check', null, false])
  })
})
