import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Notice } from '@/components/Notice'
import { MotoHeader } from '@/modules/motorcycles/MotoHeader'
import { deleteDiaryEntry, fetchDiary, groupByYear } from './api'
import { DiaryEntryCard } from './DiaryEntryCard'
import type { DiaryVisibility } from './schemas'

type Filter = 'all' | DiaryVisibility
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'private', label: 'Privadas' },
  { value: 'shareable', label: 'Compartilháveis' },
]

export function DiaryPage() {
  const { id = '' } = useParams()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<Filter>('all')
  const saved = (location.state as { saved?: 'created' | 'updated'; attachFailures?: string[] } | null) ?? null

  const diary = useQuery({ queryKey: ['diary', id], queryFn: () => fetchDiary(id), enabled: Boolean(id) })
  const all = diary.data ?? []
  const shown = filter === 'all' ? all : all.filter((e) => e.visibility === filter)

  async function handleDelete(entryId: string) {
    await deleteDiaryEntry(entryId)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['diary', id] }),
      queryClient.invalidateQueries({ queryKey: ['storage-usage'] }),
    ])
  }

  return (
    <div className="flex flex-col gap-6">
      <MotoHeader motorcycleId={id} />

      {saved?.saved && (
        <div>
          <Notice tone="success" title={saved.saved === 'created' ? 'Entrada adicionada ao diário' : 'Entrada atualizada'}>
            O diário fica separado do histórico técnico da moto.
          </Notice>
          {saved.attachFailures && saved.attachFailures.length > 0 && (
            <div className="mt-3">
              <Notice tone="error" title="Algumas fotos não foram enviadas">
                <ul>{saved.attachFailures.map((m) => <li key={m}>{m}</li>)}</ul>
                <p className="mt-1">Abra "Editar" na entrada para tentar de novo.</p>
              </Notice>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Mostrar entradas">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
                filter === f.value ? 'border-ink bg-ink text-sheet' : 'border-rule bg-sheet text-ink hover:border-ink'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Link
          to={`/painel/motos/${id}/diario/novo`}
          className="inline-flex items-center justify-center rounded-doc bg-ink px-5 py-3 font-semibold text-sheet hover:bg-ink/90"
        >
          Nova entrada
        </Link>
      </div>

      {diary.isLoading && <p className="text-muted" role="status">Carregando diário…</p>}
      {diary.isError && <Notice tone="error">Não foi possível carregar o diário. Tente de novo.</Notice>}

      {diary.isSuccess && all.length === 0 && (
        <div className="rounded-doc border border-dashed border-rule bg-sheet p-6">
          <h2 className="heading text-xl text-ink">Conte a história da sua moto</h2>
          <p className="mt-2 max-w-prose text-muted">
            Primeiro passeio, viagens, encontros, acessórios e personalizações. Cada entrada pode ser privada ou
            compartilhável. Serviços e manutenção ficam no Histórico.
          </p>
        </div>
      )}

      {diary.isSuccess && all.length > 0 && shown.length === 0 && (
        <p className="text-muted">Nenhuma entrada com esse filtro.</p>
      )}

      {groupByYear(shown).map((g) => (
        <section key={g.year} aria-labelledby={`dy-${g.year}`} className="flex flex-col gap-4">
          <h2 id={`dy-${g.year}`} className="display text-2xl text-ink">{g.year}</h2>
          {g.entries.map((e) => (
            <DiaryEntryCard key={e.id} entry={e} onDelete={handleDelete} />
          ))}
        </section>
      ))}
    </div>
  )
}
