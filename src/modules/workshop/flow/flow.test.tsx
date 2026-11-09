import { describe, expect, it } from 'vitest'
import { buildFlow, isStale, matches, waitLabel, type OrderRowFlow } from './stages'
import type { QuoteRow } from '../quotes/api'
import { WORKSHOP_NAV } from '../shared/WorkshopNav'

const now = new Date('2026-11-09T15:00:00')
const order = (over: Partial<OrderRowFlow>): OrderRowFlow => ({
  id: 'o1', number: 1, status: 'open', created_at: '2026-11-09T13:00:00', due_date: null, completed_at: null, final_total_cents: null,
  quote_number: null, customer_id: 'c1', customer_name: 'João', brand: 'Honda', model: 'CG 160', plate: 'ABC1D23',
  mechanic_name: null, items: 2, items_done: 1, authorized_cents: 10000, ...over,
})
const quote = (over: Partial<QuoteRow>): QuoteRow => ({
  id: 'q1', number: 7, status: 'sent', current_version: 1, created_at: '2026-11-08T10:00:00', decided_at: null, approved_total_cents: null,
  parent_quote_id: null, total_cents: 5000, valid_until: '2026-11-20', sent_at: '2026-11-08T10:00:00', customer_id: 'c1',
  customer_name: 'Maria', brand: 'Yamaha', model: 'Fazer', plate: 'XYZ9A88', viewed_at: null, ...over,
})

describe('Esteira da oficina (Fase A)', () => {
  it('coloca cada OS e orçamento na etapa certa, com o próximo passo', () => {
    const cards = buildFlow('org', [
      order({ id: 'a', status: 'open', items: 0 }),
      order({ id: 'a2', status: 'open', items: 1 }),
      order({ id: 'b', status: 'awaiting_diagnosis' }),
      order({ id: 'c', status: 'in_progress', mechanic_name: 'Davi' }),
      order({ id: 'd', status: 'ready' }),
      order({ id: 'e', status: 'completed' }),
      order({ id: 'f', status: 'delivered', delivered_at: '2026-11-09T11:00:00' }),
      order({ id: 'g', status: 'delivered', delivered_at: '2026-11-01T11:00:00' }),
      order({ id: 'h', status: 'canceled' }),
      order({ id: 'i', status: 'awaiting_execution', quote_number: 3 }),
    ], [
      quote({ id: 'q-sent' }),
      quote({ id: 'q-draft', status: 'draft', sent_at: null }),
      quote({ id: 'q-ok', number: 9, status: 'approved' }),
      quote({ id: 'q-has-os', number: 3, status: 'approved' }),
      quote({ id: 'q-rej', status: 'rejected' }),
    ], [{ order_id: 'e', order_number: 1, customer_id: 'c1', customer_name: 'João', whatsapp: null, status: 'completed', completed_at: '', due_cents: 10000, paid_cents: 0, pending_cents: 10000 }], now)
    const stageOf = (id: string) => cards.find((c) => c.id === id)?.stage
    expect(stageOf('a')).toBe('entrada')
    expect(stageOf('a2')).toBe('aprovado')
    expect(stageOf('b')).toBe('diagnostico')
    expect(stageOf('c')).toBe('pista')
    expect(stageOf('d')).toBe('caixa')
    expect(stageOf('e')).toBe('caixa')
    expect(stageOf('f')).toBe('entregue')
    expect(stageOf('g')).toBeUndefined()
    expect(stageOf('h')).toBeUndefined()
    expect(stageOf('i')).toBe('aprovado')
    expect(stageOf('q-sent')).toBe('orcamento')
    expect(stageOf('q-draft')).toBe('orcamento')
    expect(stageOf('q-ok')).toBe('aprovado')
    expect(stageOf('q-has-os')).toBeUndefined()
    expect(stageOf('q-rej')).toBeUndefined()
    expect(cards.find((c) => c.id === 'q-ok')?.action).toBe('Abrir OS')
    expect(cards.find((c) => c.id === 'q-sent')?.badges.map((b) => b.label)).toContain('Cliente não abriu')
    expect(cards.find((c) => c.id === 'e')?.badges.map((b) => b.label)).toContain('Saldo a receber')
    expect(cards.find((c) => c.id === 'e')?.href).toBe('/oficina/org/os/e')
  })

  it('entrada antes do orçamento anda pelas etapas sem duplicar o orçamento', () => {
    const e = (over: Partial<OrderRowFlow>) => order({ opened_at_entry: true, items: 0, items_done: 0, ...over })
    const cards = buildFlow('org', [
      e({ id: 'e1', status: 'open' }),
      e({ id: 'e2', status: 'awaiting_diagnosis' }),
      e({ id: 'e3', status: 'awaiting_diagnosis', diagnosed_at: '2026-11-09T14:00:00' }),
      e({ id: 'e4', status: 'awaiting_approval', diagnosed_at: '2026-11-09T14:00:00', entry_quote: { id: 'qe', number: 12, status: 'sent' } }),
      e({ id: 'e5', status: 'awaiting_approval', entry_quote: { id: 'qa', number: 13, status: 'approved' } }),
      e({ id: 'e6', status: 'awaiting_execution', items: 1, entry_quote: { id: 'qb', number: 14, status: 'approved' } }),
    ], [quote({ id: 'qe', number: 12 }), quote({ id: 'qa', number: 13, status: 'approved' })], null, now)
    const get = (id: string) => cards.find((c) => c.id === id)
    expect([get('e1')?.stage, get('e1')?.action]).toEqual(['entrada', 'Mandar para diagnóstico'])
    expect(get('e2')?.stage).toBe('diagnostico')
    expect([get('e3')?.stage, get('e3')?.action]).toEqual(['orcamento', 'Montar orçamento'])
    expect([get('e4')?.stage, get('e4')?.action, get('e4')?.href]).toEqual(['orcamento', 'Cobrar resposta', '/oficina/org/orcamentos/qe'])
    expect([get('e5')?.stage, get('e5')?.action]).toEqual(['aprovado', 'Passar itens para a OS'])
    expect([get('e6')?.stage, get('e6')?.action]).toEqual(['aprovado', 'Liberar para a pista'])
    expect(get('qe')).toBeUndefined()
    expect(get('qa')).toBeUndefined()
  })

  it('sem permissão de financeiro não mostra valores', () => {
    const [card] = buildFlow('org', [order({ status: 'completed' })], [], null, now)
    expect(card?.pendingCents).toBeNull()
    expect(card?.badges.map((b) => b.label)).not.toContain('Pago')
  })

  it('tempo de espera, cartão parado e busca por placa', () => {
    expect(waitLabel('2026-11-09T14:30:00', now)).toBe('há 30 min')
    expect(waitLabel('2026-11-07T15:00:00', now)).toBe('há 2 dias')
    const [card] = buildFlow('org', [order({ status: 'open', items: 0, created_at: '2026-11-09T10:00:00' })], [], null, now)
    expect(isStale(card!, now)).toBe(true)
    expect(matches(card!, 'abc-1d')).toBe(true)
    expect(matches(card!, 'joão')).toBe(true)
    expect(matches(card!, 'xyz')).toBe(false)
  })

  it('menu na ordem do trabalho', () => {
    expect(WORKSHOP_NAV[0]!.items.map((i) => i.label)).toEqual(['Esteira', '+ Nova entrada', 'Agenda', 'Orçamentos', 'Ordens de serviço', 'Caixa'])
    expect(WORKSHOP_NAV.find((g) => g.label === 'Gestão')!.items[0]!.label).toBe('Resultados')
    expect(WORKSHOP_NAV.find((g) => g.label === 'Oficina')!.items.map((i) => i.label)).toContain('App da Pista')
  })
})

import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { FlowCardView } from './EsteiraPage'

describe('Cartão da esteira', () => {
  it('mostra placa, cliente e o botão do próximo passo', () => {
    const [card] = buildFlow('org', [order({ status: 'awaiting_execution' })], [], null, now)
    render(<MemoryRouter><FlowCardView card={card!} touch /></MemoryRouter>)
    expect(screen.getByText('ABC1D23')).toBeInTheDocument()
    expect(screen.getByText('João')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Liberar para a pista ›' })).toHaveAttribute('href', '/oficina/org/os/o1')
  })
})

describe('Fases C e D', () => {
  it('cartão usa a hora em que entrou na etapa e oferece a mensagem pronta no WhatsApp', () => {
    const [card] = buildFlow('org', [order({ status: 'completed', status_changed_at: '2026-11-09T14:30:00', customer_whatsapp: '21999998888' })], [], null, now)
    expect(waitLabel(card!.since, now)).toBe('há 30 min')
    render(<MemoryRouter><FlowCardView card={card!} touch={false} orgId="org" workshopName="Oficina do Carlos" /></MemoryRouter>)
    const link = screen.getByRole('link', { name: 'WhatsApp: Avisar que está pronta' })
    expect(link.getAttribute('href')).toContain('wa.me/5521999998888')
    expect(decodeURIComponent(link.getAttribute('href')!)).toContain('está pronta para retirada')
  })

  it('modo toque fica guardado no aparelho e o app instalado abre na última oficina', async () => {
    const { setTouchMode, rememberWorkshop, touchStartWorkshop } = await import('./touch')
    rememberWorkshop('org-1')
    setTouchMode(false)
    expect(touchStartWorkshop()).toBeNull()
    setTouchMode(true)
    expect(touchStartWorkshop()).toBe('org-1')
    setTouchMode(false)
  })
})
