import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HomePage } from './HomePage'

function renderHome() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('HomePage', () => {
  it('apresenta a proposta e as chamadas principais', () => {
    renderHome()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/não precisa começar de novo/)
    expect(screen.getByRole('link', { name: 'Criar meu passaporte' })).toHaveAttribute('href', '/criar-conta')
    expect(screen.getByRole('heading', { name: 'Como funciona' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Para oficinas' })).toBeInTheDocument()
  })

  it('deixa claro o que o produto não é (PRD 3.4)', () => {
    renderHome()
    expect(screen.getByText(/Não é laudo mecânico nem vistoria/)).toBeInTheDocument()
  })

  it('não fixa o limite do plano gratuito no código sem a configuração', () => {
    renderHome()
    expect(screen.queryByText(/Grátis para \d/)).not.toBeInTheDocument()
  })

  it('o passaporte de exemplo não mostra placa', () => {
    renderHome()
    const specimen = screen.getByRole('figure', { name: /Exemplo de página/ })
    expect(specimen).not.toHaveTextContent(/placa/i)
    expect(specimen).toHaveTextContent('Exemplo')
  })
})
