import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { isStaleChunkError, reloadForNewVersion } from './staleChunk'
import { RouteErrorPage } from '@/App'

const reload = vi.fn()
beforeEach(() => {
  reload.mockReset()
  sessionStorage.clear()
  Object.defineProperty(window, 'location', { value: { ...window.location, reload }, writable: true })
})

describe('versão nova publicada com a aba aberta', () => {
  it('reconhece o erro de arquivo de página antigo', () => {
    expect(isStaleChunkError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/NotificationsPage-BAvMN8Pa.js'))).toBe(true)
    expect(isStaleChunkError(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(isStaleChunkError(new Error('Permissão negada'))).toBe(false)
  })

  it('recarrega uma vez só (sem ciclo)', () => {
    expect(reloadForNewVersion()).toBe(true)
    expect(reloadForNewVersion()).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('tela de erro recarrega sozinha e não mostra a mensagem técnica', async () => {
    const router = createMemoryRouter([{ path: '/', errorElement: <RouteErrorPage />, loader: () => { throw new TypeError('Failed to fetch dynamically imported module: /assets/a.js') }, element: <p>ok</p> }])
    render(<RouterProvider router={router} />)
    expect(await screen.findByText('Atualizando o Moto Passaporte…')).toBeVisible()
    expect(screen.queryByText(/Failed to fetch/)).toBeNull()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('outros erros mostram mensagem amigável sem recarregar', async () => {
    const router = createMemoryRouter([{ path: '/', errorElement: <RouteErrorPage />, loader: () => { throw new Error('boom') }, element: <p>ok</p> }])
    render(<RouterProvider router={router} />)
    expect(await screen.findByText('Algo deu errado nesta tela')).toBeVisible()
    expect(reload).not.toHaveBeenCalled()
  })
})
