import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { StorageOverview } from './storageApi'

const calls: Array<{ fn: string; args: unknown[] }> = []
let orphans = 2

const overview = (): StorageOverview => ({
  bucket_files: 12, bucket_bytes: 30 * 1048576, linked_files: 10, linked_bytes: 28 * 1048576,
  by_kind: [{ kind: 'photo', files: 7, bytes: 20 * 1048576 }, { kind: 'invoice', files: 3, bytes: 8 * 1048576 }],
  by_context: [{ context: 'maintenance', files: 6, bytes: 18 * 1048576 }, { context: 'workshop', files: 4, bytes: 10 * 1048576 }],
  temporary_files: 0, temporary_bytes: 0, orphan_files: orphans, orphan_bytes: orphans * 1048576, retention_hours: 24, alert_percent: 80,
  workshop_quota_bytes: 500 * 1048576, max_file_bytes: 10 * 1048576, users_in_alert: 1, workshops_in_alert: 0, last_cleanup: null,
})

vi.mock('./storageApi', async () => {
  const actual = await vi.importActual<typeof import('./storageApi')>('./storageApi')
  return {
    ...actual,
    fetchStorageOverview: async () => overview(),
    listStorageUsers: async () => [
      { user_id: 'u1', full_name: 'Bruno Lima', email_masked: 'br•••@exemplo.com', motorcycles: 1, used_bytes: 90 * 1048576, quota_bytes: 100 * 1048576, used_percent: 90, in_alert: true },
    ],
    listStorageMotorcycles: async () => [
      { motorcycle_id: 'm1', motorcycle_name: 'Honda CG 160 2022', owner_name: 'Bruno Lima', files: 9, bytes: 25 * 1048576, workshop_bytes: 5 * 1048576, diary_bytes: 1048576 },
    ],
    listStorageWorkshops: async () => [],
    listUnlinkedFiles: async () => orphans === 0 ? [] : [
      { storage_path: 'aaaa/bbbb.pdf', size_bytes: 1048576, created_at: '2026-11-01T12:00:00Z', is_orphan: true },
      { storage_path: 'cccc/dddd.jpg', size_bytes: 1048576, created_at: '2026-11-07T12:00:00Z', is_orphan: false },
    ],
    listStorageCleanups: async () => [],
    runStorageCleanup: async (...args: unknown[]) => {
      calls.push({ fn: 'cleanup', args })
      orphans = 0
      return { ok: true, deleted_files: 2, deleted_bytes: 2 * 1048576, failed_files: 0 }
    },
  }
})

import { AdminStoragePage } from './AdminStoragePage'

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><MemoryRouter>{node}</MemoryRouter></QueryClientProvider>)
}

beforeEach(() => { calls.length = 0; orphans = 2 })

describe('AdminStoragePage', () => {
  it('mostra consumo por categoria, origem, conta e moto, com alerta', async () => {
    wrap(<AdminStoragePage />)
    expect(await screen.findByText('Fotos')).toBeInTheDocument()
    expect(screen.getByText('Enviados por oficinas')).toBeInTheDocument()
    expect(await screen.findByText('br•••@exemplo.com')).toBeInTheDocument()
    expect(screen.getByText(/90% · alerta/)).toBeInTheDocument()
    expect(await screen.findByText('Honda CG 160 2022')).toBeInTheDocument()
    expect(screen.getAllByText('Sem vínculo').length).toBeGreaterThan(1)
    expect(screen.getByText('Em andamento')).toBeInTheDocument()
  })

  it('limpeza exige motivo e informa o resultado', async () => {
    const user = userEvent.setup()
    wrap(<AdminStoragePage />)
    await user.click(await screen.findByRole('button', { name: 'Limpar arquivos sem vínculo' }))
    await user.click(screen.getByRole('button', { name: 'Apagar arquivos' }))
    expect(calls).toHaveLength(0)
    await user.type(screen.getByLabelText(/Motivo/), 'Limpeza de envios que falharam')
    await user.click(screen.getByRole('button', { name: 'Apagar arquivos' }))
    expect(await screen.findByText(/2 arquivo\(s\) apagado\(s\)/)).toBeInTheDocument()
    expect(calls[0]?.args[0]).toBe('Limpeza de envios que falharam')
  })
})
