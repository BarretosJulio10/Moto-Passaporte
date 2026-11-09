import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

const saveExpense = vi.fn()
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), saveExpense: (...a: unknown[]) => saveExpense(...a) }))
vi.mock('@/core/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

import { ExpenseForm } from './Expenses'

function wrap(ui: React.ReactNode) {
  return render(<QueryClientProvider client={new QueryClient()}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>)
}

describe('ExpenseForm', () => {
  beforeEach(() => saveExpense.mockReset().mockResolvedValue('e1'))

  it('valida antes de enviar', async () => {
    wrap(<ExpenseForm motos={[{ id: 'm1', label: 'Honda CG' }]} motoId="m1" onDone={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Lançar despesa' }))
    expect(await screen.findByText('Escolha a categoria.')).toBeTruthy()
    expect(screen.getByText(/Informe o valor/)).toBeTruthy()
    expect(saveExpense).not.toHaveBeenCalled()
  })

  it('envia em centavos', async () => {
    const done = vi.fn()
    wrap(<ExpenseForm motos={[{ id: 'm1', label: 'Honda CG' }]} motoId="m1" onDone={done} />)
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'fuel' } })
    fireEvent.change(screen.getByLabelText('Valor (R$)'), { target: { value: '85,90' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lançar despesa' }))
    await waitFor(() => expect(saveExpense).toHaveBeenCalled())
    expect(saveExpense.mock.calls[0]?.[1]).toMatchObject({ motorcycleId: 'm1', category: 'fuel', valueCents: 8590 })
    await waitFor(() => expect(done).toHaveBeenCalled())
  })

  it('gratuito sem saldo no mês vê o aviso, sem formulário', () => {
    wrap(<ExpenseForm motos={[{ id: 'm1', label: 'Honda CG' }]} motoId="m1" left={0} onDone={() => {}} />)
    expect(screen.getByText('Limite do mês atingido')).toBeTruthy()
    expect(screen.queryByLabelText('Categoria')).toBeNull()
  })
})
