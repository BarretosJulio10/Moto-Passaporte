import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Reminder, ReminderInput } from './api'
import type { MyPlan } from '@/modules/plans/api'

const calls: Array<{ fn: string; args: unknown[] }> = []
let reminders: Reminder[] = []
let plan: MyPlan

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api')
  return {
    ...actual,
    fetchReminders: async () => reminders,
    fetchDueReminders: async () => reminders.filter((r) => r.status === 'due' || r.status === 'soon').map((r) => ({ ...r, motorcycle_name: 'Honda CG 160' })),
    createReminder: async (...args: unknown[]) => { calls.push({ fn: 'create', args }); return 'r-new' },
    updateReminder: async (...args: unknown[]) => { calls.push({ fn: 'update', args }) },
    completeReminder: async (...args: unknown[]) => { calls.push({ fn: 'complete', args }) },
    setReminderPaused: async (...args: unknown[]) => { calls.push({ fn: 'pause', args }) },
    deleteReminder: async (...args: unknown[]) => { calls.push({ fn: 'delete', args }) },
  }
})
vi.mock('@/modules/plans/useMyPlan', () => ({ useMyPlan: () => ({ data: plan, isLoading: false }) }))
vi.mock('@/core/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'u1', user_metadata: {} } }) }))
vi.mock('@/modules/reports/api', () => ({
  registerReport: async () => { calls.push({ fn: 'report', args: [] }); return { reference: 'ABC1234567', generated_at: '2026-11-07T15:00:00Z' } },
}))
vi.mock('@/modules/motorcycles/api', () => ({
  fetchMotorcycle: async () => ({ id: 'm1', public_id: 'pub1', brand: 'Honda', model: 'CG 160', version: 'Titan', manufacturing_year: 2021, model_year: 2022,
    displacement_cc: 160, color: 'Vermelha', current_plate: 'ABC1D23', passport_created_at: '2026-01-10T12:00:00Z', latest_mileage: 15200 }),
  fetchMileage: async () => [
    { id: 'k1', mileage: 12000, recorded_at: '2026-03-01', source_type: 'owner', note: null, corrects_record_id: null, below_previous: false, created_at: '' },
    { id: 'k2', mileage: 15200, recorded_at: '2026-09-01', source_type: 'workshop', note: null, corrects_record_id: null, below_previous: false, created_at: '' },
  ],
}))
vi.mock('@/modules/maintenance/api', () => ({
  fetchTimeline: async () => [
    { id: 't1', motorcycle_id: 'm1', category: 'oil_change', title: 'Troca de óleo', description: 'Óleo 10W30', service_date: '2026-09-01', mileage: 15200,
      source_type: 'workshop', organization_id: 'o1', workshop_name: 'Oficina do Zé', service_value_cents: 18000, notes: 'Cliente pediu filtro novo',
      corrects_record_id: null, correction_reason: null, is_void: false, created_at: '', status: 'current', items: [],
      attachments: [{ id: 'a1', storage_path: 'x', file_name: 'nota.pdf', mime_type: 'application/pdf', file_size: 1, kind: 'invoice', created_at: '' }],
      evidence_level: 'workshop' },
    { id: 't0', motorcycle_id: 'm1', category: 'tires', title: 'Registro anulado', description: null, service_date: '2026-05-01', mileage: null,
      source_type: 'owner', organization_id: null, workshop_name: null, service_value_cents: null, notes: null, corrects_record_id: null,
      correction_reason: null, is_void: true, created_at: '', status: 'current', items: [], attachments: [], evidence_level: 'owner' },
  ],
}))
vi.mock('@/modules/workshop_access/api', () => ({
  fetchMotorcycleAccess: async () => [{ id: 'w1', access_type: 'origin', status: 'approved', workshop_name: 'Oficina do Zé', workshop_city: 'Niterói', workshop_state: 'RJ' }],
}))

import { RemindersSection } from './RemindersSection'
import { DueReminders } from './DueReminders'
import { describeDue, parseReminderForm } from './api'
import { ReportPage } from '@/modules/reports/ReportPage'

const premium: MyPlan = { code: 'premium_anual', kind: 'premium', name: 'Premium anual', billing_period: 'annual', max_motorcycles: 3, storage_quota_mb: 500,
  motorcycles_used: 1, features: [], entitlements: ['pdf_reports', 'maintenance_reminders'], max_share_links: 10 }
const free: MyPlan = { ...premium, code: 'gratuito', kind: 'free', name: 'Gratuito', entitlements: [], max_share_links: 3 }

const rem = (over: Partial<Reminder>): Reminder => ({
  id: 'r1', motorcycle_id: 'm1', title: 'Troca de óleo', category: 'oil_change', every_km: 3000, every_months: null, due_date: null, base_mileage: 12000,
  base_date: '2026-09-01', notes: null, paused: false, last_completed_at: null, next_km: 15000, next_date: null, km_left: -200, days_left: null,
  current_km: 15200, status: 'due', ...over,
})

function wrap(node: React.ReactNode, path = '/') {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/painel/motos/:id/relatorio" element={node} />
          <Route path="*" element={node} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  calls.length = 0
  reminders = []
  plan = premium
})

describe('formulário de lembrete', () => {
  const base = { title: 'Óleo', category: '', everyKm: '', everyMonths: '', dueDate: '', notes: '', lastDate: '', lastKm: '' }
  it('exige um gatilho e recusa combinações inválidas', () => {
    expect(parseReminderForm(base)).toMatch(/pelo menos um gatilho/)
    expect(parseReminderForm({ ...base, everyMonths: '6', dueDate: '2027-01-01' })).toMatch(/não os dois/)
    expect(parseReminderForm({ ...base, everyKm: '50' })).toMatch(/100 e 100.000/)
    expect(parseReminderForm({ ...base, title: 'x', everyKm: '3000' })).toMatch(/nome/)
  })
  it('aceita km com ponto de milhar', () => {
    const r = parseReminderForm({ ...base, everyKm: '3.000', everyMonths: '6' }) as ReminderInput
    expect(r.everyKm).toBe(3000)
    expect(r.everyMonths).toBe(6)
  })
  it('descreve o que falta', () => {
    expect(describeDue(rem({ km_left: 450, days_left: 12 }))).toBe('faltam 450 km · vence em 12 dias')
    expect(describeDue(rem({ km_left: -200, days_left: -3 }))).toBe('passou 200 km · venceu há 3 dias')
  })
})

describe('lembretes na página da moto', () => {
  it('gratuito sem lembretes: apresenta o recurso Premium', async () => {
    plan = free
    wrap(<RemindersSection motorcycleId="m1" />)
    expect(await screen.findByRole('link', { name: 'Conhecer o Premium' })).toHaveAttribute('href', '/painel/plano')
    expect(screen.queryByRole('button', { name: 'Novo lembrete' })).not.toBeInTheDocument()
  })

  it('Premium cria lembrete por km e meses', async () => {
    const user = userEvent.setup()
    wrap(<RemindersSection motorcycleId="m1" />)
    await user.click(await screen.findByRole('button', { name: 'Novo lembrete' }))
    const form = screen.getByRole('form', { name: 'Novo lembrete' })
    await user.type(within(form).getByLabelText('Nome'), 'Troca de óleo')
    await user.type(within(form).getByLabelText('A cada (km)'), '3000')
    await user.type(within(form).getByLabelText('A cada (meses)'), '6')
    await user.click(within(form).getByRole('button', { name: 'Criar lembrete' }))
    const c = calls.find((x) => x.fn === 'create')!
    expect(c.args[0]).toBe('m1')
    expect(c.args[1]).toMatchObject({ title: 'Troca de óleo', everyKm: 3000, everyMonths: 6 })
  })

  it('mostra situação e conclui', async () => {
    reminders = [rem({})]
    const user = userEvent.setup()
    wrap(<RemindersSection motorcycleId="m1" />)
    expect(await screen.findByText('Vencido')).toBeVisible()
    expect(screen.getByText(/a cada 3.000 km · passou 200 km/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Marcar Troca de óleo como feito' }))
    expect(calls.find((x) => x.fn === 'complete')!.args).toEqual(['r1', null])
  })

  it('após o Premium: não edita, mas ainda conclui, pausa e exclui', async () => {
    plan = free
    reminders = [rem({ status: 'soon', km_left: 200 })]
    const user = userEvent.setup()
    wrap(<RemindersSection motorcycleId="m1" />)
    expect(await screen.findByText(/não cria nem edita lembretes/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Pausar' }))
    expect(calls.find((x) => x.fn === 'pause')!.args).toEqual(['r1', true])
  })

  it('painel lista vencidos e próximos', async () => {
    reminders = [rem({}), rem({ id: 'r2', title: 'Revisão', status: 'ok', km_left: 2000 })]
    wrap(<DueReminders />)
    expect(await screen.findByRole('link', { name: 'Troca de óleo' })).toHaveAttribute('href', '/painel/motos/m1')
    expect(screen.queryByText('Revisão')).not.toBeInTheDocument()
  })
})

describe('relatório em PDF', () => {
  it('gratuito: explica o recurso e não mostra o relatório', async () => {
    plan = free
    wrap(<ReportPage />, '/painel/motos/m1/relatorio')
    expect(await screen.findByRole('link', { name: 'Conhecer o Premium' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Gerar PDF' })).not.toBeInTheDocument()
  })

  it('monta o relatório sem anulados, sem valores por padrão e com avisos', async () => {
    wrap(<ReportPage />, '/painel/motos/m1/relatorio')
    const sheet = await screen.findByRole('article', { name: 'Prévia do relatório' })
    expect(await within(sheet).findByText('Óleo 10W30')).toBeVisible()
    expect(within(sheet).queryByText(/Registro anulado/)).not.toBeInTheDocument()
    expect(within(sheet).getByText(/Oficina do Zé — Niterói\/RJ/)).toBeVisible()
    expect(within(sheet).getByText(/nota\.pdf \(nota fiscal\)/)).toBeVisible()
    expect(within(sheet).queryByText(/R\$ 180,00/)).not.toBeInTheDocument()
    expect(within(sheet).queryByText(/Cliente pediu/)).not.toBeInTheDocument()
    expect(within(sheet).getByText(/Não é laudo, perícia, vistoria nem certificado oficial/)).toBeVisible()
    expect(within(sheet).queryByText(/chassi/i)).not.toBeInTheDocument()
  })

  it('opções incluem valores e escondem a placa', async () => {
    const user = userEvent.setup()
    wrap(<ReportPage />, '/painel/motos/m1/relatorio')
    const sheet = await screen.findByRole('article', { name: 'Prévia do relatório' })
    await within(sheet).findByText('Óleo 10W30')
    await user.click(screen.getByLabelText('Valores dos serviços'))
    await user.click(screen.getByLabelText('Placa'))
    expect(within(sheet).getByText(/R\$\s?180,00/)).toBeVisible()
    expect(within(sheet).queryByText('ABC1D23')).not.toBeInTheDocument()
  })

  it('gerar registra a referência e abre a impressão', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    const user = userEvent.setup()
    wrap(<ReportPage />, '/painel/motos/m1/relatorio')
    await screen.findByRole('article', { name: 'Prévia do relatório' })
    await user.click(screen.getByRole('button', { name: 'Gerar PDF' }))
    expect(calls.some((c) => c.fn === 'report')).toBe(true)
    expect((await screen.findAllByText(/ABC1234567/)).length).toBeGreaterThan(0)
    await vi.waitFor(() => expect(print).toHaveBeenCalled())
    print.mockRestore()
  })
})
