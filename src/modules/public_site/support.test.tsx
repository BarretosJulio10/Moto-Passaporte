import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

let settings: { data?: unknown; isLoading: boolean } = { isLoading: false, data: undefined }
vi.mock('./usePublicSettings', () => ({ usePublicSettings: () => settings }))

import { ContactPage } from './ContactPage'
import { FaqPage } from './FaqPage'

const wrap = (ui: ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('ContactPage', () => {
  it('mostra os canais configurados no banco', () => {
    settings = { isLoading: false, data: { supportEmail: 'contato@motopassaporte.com.br', supportWhatsapp: '5517991234567', freePlanMaxMotorcycles: 1 } }
    wrap(<ContactPage />)
    expect(screen.getByRole('link', { name: 'contato@motopassaporte.com.br' })).toHaveAttribute('href', 'mailto:contato@motopassaporte.com.br')
    expect(screen.getByRole('link', { name: 'Abrir conversa' })).toHaveAttribute('href', 'https://wa.me/5517991234567')
  })
  it('sem canais configurados, não inventa contato', () => {
    settings = { isLoading: false, data: { supportEmail: null, supportWhatsapp: null, freePlanMaxMotorcycles: 1 } }
    wrap(<ContactPage />)
    expect(screen.getByText('Canais de atendimento em definição')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /@/ })).not.toBeInTheDocument()
  })
})

describe('FaqPage', () => {
  it('usa o limite configurado do plano gratuito e indica recursos futuros como "em breve"', async () => {
    settings = { isLoading: false, data: { freePlanMaxMotorcycles: 1, supportEmail: null, supportWhatsapp: null } }
    wrap(<FaqPage />)
    const user = userEvent.setup()
    await user.click(screen.getByText('Preciso pagar para usar?'))
    expect(screen.getByText(/permite 1 moto/)).toBeVisible()
    await user.click(screen.getByText('Como funciona quando eu vender a moto?'))
    expect(screen.getByText(/Em breve você poderá transferir/)).toBeVisible()
  })
})
