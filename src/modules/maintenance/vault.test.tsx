import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TimelineEntryCard } from './TimelineEntryCard'
import type { TimelineEntry } from './api'
import { timelineTotal } from '@/modules/spending/api'
import { SharedPassportView } from '@/modules/sharing/SharedPassportPage'
import type { SharedPassport } from '@/modules/sharing/sharesApi'

const base: TimelineEntry = {
  id: 'r1', motorcycle_id: 'm1', category: 'oil_change', title: 'Troca de óleo', description: null, service_date: '2025-03-10',
  mileage: null, source_type: 'workshop', organization_id: null, workshop_name: 'Oficina Boa', service_value_cents: null, notes: null,
  corrects_record_id: null, correction_reason: null, is_void: false, created_at: '2025-03-10T10:00:00Z', status: 'current',
  items: [], attachments: [], evidence_level: 'workshop', locked: true,
}

describe('cofre do plano gratuito (PRD 2.4)', () => {
  it('registro no cofre mostra data, serviço e oficina, sem ações, com convite ao Premium', () => {
    render(<MemoryRouter><TimelineEntryCard entry={base} onVoid={async () => {}} /></MemoryRouter>)
    expect(screen.getByRole('article', { name: /no cofre/i })).toBeInTheDocument()
    expect(screen.getByText('Troca de óleo')).toBeInTheDocument()
    expect(screen.getByText(/Oficina Boa/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver planos' })).toHaveAttribute('href', '/painel/plano')
    expect(screen.queryByRole('button', { name: 'Anular' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Corrigir' })).not.toBeInTheDocument()
  })

  it('registro aberto continua com o cartão completo', () => {
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><TimelineEntryCard entry={{ ...base, locked: false, mileage: 12000, source_type: 'owner', evidence_level: 'owner' }} onVoid={async () => {}} /></MemoryRouter></QueryClientProvider>)
    expect(screen.queryByText('No cofre')).not.toBeInTheDocument()
    expect(screen.getByText('Km')).toBeInTheDocument()
  })

  it('total da linha do tempo não conta registros do cofre como "sem valor"', () => {
    const t = timelineTotal([
      { status: 'current', is_void: false, service_value_cents: 5000 },
      { status: 'current', is_void: false, service_value_cents: null, locked: true },
      { status: 'current', is_void: false, service_value_cents: null },
    ])
    expect(t).toEqual({ cents: 5000, withValue: 1, missing: 1 })
  })

  it('link de comprador em modo resumo mostra os números e não a lista', () => {
    const p: SharedPassport = {
      brand: 'Honda', model: 'Bros 160', version: null, manufacturing_year: 2020, model_year: 2020, displacement_cc: 160, color: null,
      passport_created_at: '2024-01-01', shared_at: '2026-11-09', expires_at: null, origin_workshop: null,
      options: { plate: false, mileage: false, history: true, values: false, attachments: false, diary: false },
      vault: true,
      history_summary: { services: 12, workshops: 3, workshop_records: 7, first_service_date: '2021-05-01', last_service_date: '2026-10-01', last_mileage: 18100 },
    }
    render(<MemoryRouter><SharedPassportView p={p} /></MemoryRouter>)
    expect(screen.getByText('Serviços registrados')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText(/Peça a ele para liberar o histórico completo/)).toBeInTheDocument()
    expect(screen.queryByText('Nenhum serviço registrado.')).not.toBeInTheDocument()
  })
})
