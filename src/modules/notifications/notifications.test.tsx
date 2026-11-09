import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const calls: Array<{ fn: string; args: unknown[] }> = []
let messaging = { email: 'ana@teste.com', email_optout: false, email_active: true, phone: null as string | null, phone_ok: false, whatsapp_optin: false, whatsapp_active: true }
let prefs = [
  { kind: 'payment_failed', optional: false, in_app: true, email: false, push: true, whatsapp: true },
  { kind: 'reminder_due', optional: true, in_app: true, email: false, push: false, whatsapp: false },
]

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api')
  return {
    ...actual,
    fetchNotifications: async () => [
      { id: 'n1', kind: 'workshop_access_request', title: 'Oficina do Zé pediu acesso', body: 'A oficina pediu para ver o histórico da Honda CG.',
        link: '/painel/motos/m1', created_at: '2026-11-07T12:00:00Z', read_at: null },
      { id: 'n2', kind: 'payment_approved', title: 'Pagamento confirmado', body: 'Recebemos o pagamento.', link: '/painel/plano',
        created_at: '2026-11-06T12:00:00Z', read_at: '2026-11-06T13:00:00Z' },
    ],
    markRead: async (...args: unknown[]) => { calls.push({ fn: 'markRead', args }); return 1 },
    fetchPreferences: async () => prefs,
    setPreference: async (...args: unknown[]) => {
      calls.push({ fn: 'setPreference', args })
      prefs = prefs.map((p) => (p.kind === args[0] ? { ...p, in_app: args[1] as boolean, email: args[2] as boolean, push: args[3] as boolean, whatsapp: args[4] as boolean } : p))
    },
    fetchMessagingPrefs: async () => messaging,
    setMessagingPrefs: async (...args: unknown[]) => {
      calls.push({ fn: 'setMessagingPrefs', args })
      messaging = { ...messaging, ...(args[0] === null ? {} : { email_optout: args[0] as boolean }), ...(args[1] === null ? {} : { whatsapp_optin: args[1] as boolean }) }
    },
    fetchUnreadCount: async () => 3,
  }
})

let support = 'ok'
let subscribed: string | null = null
vi.mock('./push', () => ({
  pushSupport: () => support,
  currentSubscription: async () => (subscribed ? { endpoint: subscribed } : null),
  enablePush: async () => { calls.push({ fn: 'enablePush', args: [] }); subscribed = 'https://fcm.googleapis.com/fcm/send/abc123456789' },
  disablePush: async () => { calls.push({ fn: 'disablePush', args: [] }); subscribed = null },
  sendTestPush: async () => { calls.push({ fn: 'sendTestPush', args: [] }) },
  fetchMyDevices: async () => (subscribed ? [{ id: 'd1', label: 'Android · Chrome', created_at: '2026-11-08T12:00:00Z', last_used_at: null, endpoint_hint: 'abc123456789' }] : []),
  removeDevice: async () => undefined,
}))

import { NotificationsPage } from './NotificationsPage'

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><MemoryRouter>{node}</MemoryRouter></QueryClientProvider>)
}

beforeEach(() => {
  support = 'ok'
  subscribed = null
  calls.length = 0
  prefs = prefs.map((p) => ({ ...p, in_app: true, email: false }))
  messaging = { email: 'ana@teste.com', email_optout: false, email_active: true, phone: null, phone_ok: false, whatsapp_optin: false, whatsapp_active: true }
})

describe('NotificationsPage', () => {
  it('lista avisos com link, destaca não lidos e marca como lidos ao abrir', async () => {
    wrap(<NotificationsPage />)
    const link = await screen.findByRole('link', { name: 'Oficina do Zé pediu acesso' })
    expect(link).toHaveAttribute('href', '/painel/motos/m1')
    expect(screen.getByText('Nova:')).toBeInTheDocument()
    expect(screen.getByText('Pagamento confirmado')).toBeVisible()
    await waitFor(() => expect(calls.some((c) => c.fn === 'markRead')).toBe(true), { timeout: 3000 })
  })

  it('aviso essencial não pode ser desligado; opcional pode e e-mail fica marcado', async () => {
    const user = userEvent.setup()
    wrap(<NotificationsPage />)
    const table = await screen.findByRole('table')
    expect(within(table).getByLabelText(/Falhas e atrasos de pagamento no site \(essencial\)/)).toBeDisabled()
    await user.click(within(table).getByLabelText('Lembretes de manutenção no site'))
    await waitFor(() => expect(calls.find((c) => c.fn === 'setPreference')?.args).toEqual(['reminder_due', false, false, false, false]))
    await user.click(within(table).getByLabelText('Falhas e atrasos de pagamento por e-mail'))
    await waitFor(() => expect(calls.filter((c) => c.fn === 'setPreference')[1]?.args).toEqual(['payment_failed', true, true, true, true]))
    await user.click(within(table).getByLabelText('Lembretes de manutenção no celular'))
    await waitFor(() => expect(calls.filter((c) => c.fn === 'setPreference')[2]?.args).toEqual(['reminder_due', false, false, true, false]))
  })

  it('canais: e-mail liga e desliga; WhatsApp só com celular cadastrado (ADR-064)', async () => {
    const user = userEvent.setup()
    const { unmount } = wrap(<NotificationsPage />)
    const wa = await screen.findByLabelText('Avisos por WhatsApp')
    expect(wa).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Minha conta' })).toHaveAttribute('href', '/painel/conta')
    await user.click(screen.getByLabelText('Avisos por e-mail'))
    await waitFor(() => expect(calls.find((c) => c.fn === 'setMessagingPrefs')?.args).toEqual([true, null]))
    unmount()
    messaging = { ...messaging, phone: '17999990001', phone_ok: true }
    wrap(<NotificationsPage />)
    expect(await screen.findByText('(17) 99999-0001')).toBeVisible()
    await user.click(screen.getByLabelText('Avisos por WhatsApp'))
    await waitFor(() => expect(calls.filter((c) => c.fn === 'setMessagingPrefs').at(-1)?.args).toEqual([null, true]))
  })

  it('ativa o celular com um toque, envia teste e lista o aparelho', async () => {
    const user = userEvent.setup()
    wrap(<NotificationsPage />)
    await user.click(await screen.findByRole('button', { name: 'Ativar notificações neste aparelho' }))
    expect(await screen.findByText(/Enviamos um aviso de teste/)).toBeVisible()
    expect(calls.map((c) => c.fn)).toEqual(expect.arrayContaining(['enablePush', 'sendTestPush']))
    expect(await screen.findByText('✓ Ativadas neste aparelho')).toBeVisible()
    expect(await screen.findByText(/Android · Chrome \(este\)/)).toBeVisible()
  })

  it('iPhone sem instalar: explica como instalar em vez de pedir permissão', async () => {
    support = 'ios-needs-install'
    wrap(<NotificationsPage />)
    expect(await screen.findByText('No iPhone, instale o app primeiro.')).toBeVisible()
    expect(screen.queryByRole('button', { name: /Ativar notificações/ })).toBeNull()
    expect(screen.getByRole('link', { name: 'Ver o passo a passo' })).toHaveAttribute('href', '/instalar')
  })

  it('bloqueado no aparelho: orienta a liberar', async () => {
    support = 'blocked'
    wrap(<NotificationsPage />)
    expect(await screen.findByText(/estão bloqueadas para o Moto Passaporte/)).toBeVisible()
  })
})
