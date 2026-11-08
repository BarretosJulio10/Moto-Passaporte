import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { agendaRange, approvalRate, contactMessage, localDayKey, partMargin, shiftRef, toCsv } from './api'

const calls: { fn: string; args: Record<string, unknown> | undefined }[] = []
let payments: unknown = { due_cents: 10000, paid_cents: 3000, pending_cents: 7000, final: true, payments: [] }
vi.mock('../shared/rpc', async () => {
  const actual = await vi.importActual<typeof import('../shared/rpc')>('../shared/rpc')
  return {
    ...actual,
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      calls.push({ fn, args })
      if (fn === 'workshop_order_payments') return payments
      return 'id-1'
    },
  }
})

describe('gestão da oficina: regras puras', () => {
  it('margem da peça sobre a venda', () => {
    expect(partMargin(1500, 3000)).toBe(50)
    expect(partMargin(null, 3000)).toBeNull()
    expect(partMargin(1000, 0)).toBeNull()
  })

  it('taxa de aprovação ignora o que ainda não foi decidido', () => {
    expect(approvalRate({ created: 9, approved: 3, rejected: 1, expired: 0, avg_quote_cents: 0, approved_cents: 0 })).toBe(75)
    expect(approvalRate({ created: 2, approved: 0, rejected: 0, expired: 0, avg_quote_cents: 0, approved_cents: 0 })).toBe(0)
  })

  it('semana da agenda começa na segunda e o mês no dia 1', () => {
    const wed = new Date(2026, 10, 11, 15, 0) // quarta, 11/11/2026
    const w = agendaRange('semana', wed)
    expect(localDayKey(w.from)).toBe('2026-11-09')
    expect(localDayKey(w.to)).toBe('2026-11-16')
    const m = agendaRange('mes', wed)
    expect(localDayKey(m.from)).toBe('2026-11-01')
    expect(localDayKey(m.to)).toBe('2026-12-01')
    expect(localDayKey(shiftRef('mes', wed, 1))).toBe('2026-12-01')
    const sun = agendaRange('semana', new Date(2026, 10, 15))
    expect(localDayKey(sun.from)).toBe('2026-11-09')
  })

  it('CSV usa ; com BOM e protege aspas e separadores', () => {
    const csv = toCsv([['Cliente', 'Valor'], ['Silva; João', '10,50'], ['Diz "oi"', null]])
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toContain('"Silva; João";10,50')
    expect(csv).toContain('"Diz ""oi""";')
  })

  it('mensagem pronta usa o primeiro nome e o nome da oficina', () => {
    const t = contactMessage('reminder', { customerName: 'Maria Souza', workshopName: 'Oficina do Carlos', detail: 'trocar óleo' })
    expect(t).toMatch(/^Olá, Maria! Aqui é da Oficina do Carlos\./)
    expect(t).toContain('trocar óleo')
    expect(contactMessage('return', { customerName: 'Zé', workshopName: 'X' })).toContain('revisão')
  })
})

describe('recebimentos da OS', () => {
  beforeEach(() => { calls.length = 0 })

  async function renderCard() {
    const { PaymentsCard } = await import('./widgets')
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PaymentsCard orgId="org" orderId="os-1" canceled={false} />
    </QueryClientProvider>)
  }

  it('mostra o saldo e registra o valor que falta', async () => {
    await renderCard()
    expect(await screen.findByText('R$ 70,00')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Valor que falta' }))
    await userEvent.click(screen.getByRole('button', { name: 'Registrar recebimento' }))
    const rec = calls.find((c) => c.fn === 'workshop_record_payment')
    expect(rec?.args).toMatchObject({ p_org: 'org', p_order: 'os-1', p_amount_cents: 7000, p_method: 'pix' })
  })

  it('estorno exige motivo', async () => {
    payments = { due_cents: 10000, paid_cents: 3000, pending_cents: 7000, final: true,
      payments: [{ id: 'p1', order_id: 'os-1', amount_cents: 3000, method: 'dinheiro', paid_at: '2026-11-08', notes: null, voided_at: null, void_reason: null }] }
    await renderCard()
    await userEvent.click(await screen.findByRole('button', { name: 'Estornar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar estorno' }))
    expect(screen.getByText('Informe o motivo do estorno.')).toBeTruthy()
    expect(calls.some((c) => c.fn === 'workshop_void_payment')).toBe(false)
    await userEvent.type(screen.getByLabelText('Motivo do estorno'), 'lançado em dobro')
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar estorno' }))
    expect(calls.find((c) => c.fn === 'workshop_void_payment')?.args).toMatchObject({ p_payment: 'p1', p_reason: 'lançado em dobro' })
  })

  it('OS quitada não mostra o formulário', async () => {
    payments = { due_cents: 5000, paid_cents: 5000, pending_cents: 0, final: true, payments: [] }
    await renderCard()
    await screen.findByText('Recebido')
    expect(screen.queryByRole('button', { name: 'Registrar recebimento' })).toBeNull()
  })
})
