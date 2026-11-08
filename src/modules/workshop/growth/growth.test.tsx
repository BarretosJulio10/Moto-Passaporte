import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { campaignText, nextDays, OPT_OUT_FOOTER, parseBrands, stars, summarizeHours, validateHours } from './api'

const calls: { fn: string; args: Record<string, unknown> | undefined }[] = []
vi.mock('../shared/rpc', async () => {
  const actual = await vi.importActual<typeof import('../shared/rpc')>('../shared/rpc')
  return { ...actual, rpc: async (fn: string, args?: Record<string, unknown>) => { calls.push({ fn, args }); return { ok: true, display_name: 'Ana P.' } } }
})

describe('crescimento comercial: regras puras', () => {
  it('resume o horário agrupando dias iguais', () => {
    const h = { '1': ['08:00', '18:00'], '2': ['08:00', '18:00'], '3': ['08:00', '18:00'], '4': ['08:00', '18:00'], '5': ['08:00', '18:00'], '6': ['08:00', '12:00'], '0': null } as const
    expect(summarizeHours(h as never)).toBe('Seg a sex: 08:00–18:00 · Sáb: 08:00–12:00 · Dom: fechado')
    expect(summarizeHours(null)).toBe('')
  })

  it('recusa fechamento antes da abertura e formato errado', () => {
    expect(validateHours({ '1': ['18:00', '08:00'] })).toMatch(/Segunda/)
    expect(validateHours({ '6': ['8h', '12:00'] })).toMatch(/Sábado/)
    expect(validateHours({ '1': ['08:00', '18:00'], '0': null })).toBeNull()
  })

  it('marcas sem repetição, até 30', () => {
    expect(parseBrands('Honda, honda; Yamaha\nX, BMW')).toEqual(['Honda', 'Yamaha', 'BMW'])
  })

  it('mensagem de campanha personalizada e sempre com a opção de sair', () => {
    const t = campaignText('Olá, {nome}! A {oficina} lembra da revisão da {moto}.', { customerName: 'Maria Souza', workshopName: 'Oficina do Zé', vehicle: 'Honda CG 160, Yamaha Fazer' })
    expect(t).toContain('Olá, Maria! A Oficina do Zé lembra da revisão da Honda CG 160.')
    expect(t.endsWith(OPT_OUT_FOOTER)).toBe(true)
    expect(campaignText('Oi {nome}, tudo bem com a {moto}?', { customerName: 'Zé', workshopName: 'X' })).toContain('sua moto')
  })

  it('estrelas e dias do agendamento', () => {
    expect(stars(4)).toBe('★★★★☆')
    const d = nextDays(2, new Date(2026, 10, 30))
    expect(d).toEqual(['2026-11-30', '2026-12-01', '2026-12-02'])
  })
})

describe('avaliação pelo comprovante', () => {
  beforeEach(() => { calls.length = 0 })

  it('exige nota e autorização e envia uma vez', async () => {
    const { ReviewBox } = await import('./ReviewBox')
    const done = vi.fn()
    render(<MemoryRouter><ReviewBox token={'t'.repeat(43)} review={{ done: false }} workshop="Oficina do Zé" slug="oficina-do-ze" customerName="Ana Paula" onDone={done} /></MemoryRouter>)
    await userEvent.click(screen.getByRole('button', { name: 'Enviar avaliação' }))
    expect(screen.getByText('Escolha de 1 a 5 estrelas.')).toBeTruthy()
    await userEvent.click(screen.getByRole('radio', { name: '4 estrelas' }))
    await userEvent.click(screen.getByRole('button', { name: 'Enviar avaliação' }))
    expect(screen.getByText('Marque a autorização para publicar.')).toBeTruthy()
    expect(calls.length).toBe(0)
    await userEvent.type(screen.getByLabelText('Comentário (opcional)'), 'Rápido e honesto')
    await userEvent.click(screen.getByLabelText(/Autorizo publicar/))
    await userEvent.click(screen.getByRole('button', { name: 'Enviar avaliação' }))
    expect(calls[0]).toMatchObject({ fn: 'submit_workshop_review', args: { p_rating: 4, p_comment: 'Rápido e honesto', p_name: 'Ana Paula', p_consent: true } })
    expect(done).toHaveBeenCalledOnce()
  })

  it('avaliação feita mostra a resposta da oficina', async () => {
    const { ReviewBox } = await import('./ReviewBox')
    render(<MemoryRouter><ReviewBox token="t" review={{ done: true, rating: 5, comment: 'Top', reply: 'Valeu!' }} workshop="X" slug={null} customerName="Ana" onDone={() => undefined} /></MemoryRouter>)
    expect(screen.getByText('Valeu!')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Enviar avaliação' })).toBeNull()
  })
})
