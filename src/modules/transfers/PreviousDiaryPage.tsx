import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Notice } from '@/components/Notice'
import { formatDate } from '@/core/shared/format'
import { deleteDiaryEntry, fetchDiary } from '@/modules/diary/api'
import { DiaryEntryCard } from '@/modules/diary/DiaryEntryCard'
import { fetchPreviousMotorcycles } from './api'

/** /painel/motos-anteriores/:id — o antigo titular consulta e exclui as próprias entradas do diário (KI-019). */
export function PreviousDiaryPage() {
  const { id = '' } = useParams()
  const queryClient = useQueryClient()
  const previous = useQuery({ queryKey: ['previous-motorcycles'], queryFn: fetchPreviousMotorcycles })
  const diary = useQuery({ queryKey: ['previous-diary', id], queryFn: () => fetchDiary(id), enabled: Boolean(id) })
  const moto = previous.data?.find((m) => m.motorcycle_id === id)

  if (previous.isLoading) return <p className="text-muted" role="status">Carregando…</p>
  if (!moto) {
    return (
      <div>
        <h1 className="heading text-3xl text-ink">Moto não encontrada</h1>
        <Link to="/painel" className="mt-5 inline-block font-semibold text-ink underline underline-offset-4">Voltar ao painel</Link>
      </div>
    )
  }

  const mine = (diary.data ?? []).filter((e) => e.is_mine)
  async function onDelete(entryId: string) {
    await deleteDiaryEntry(entryId)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['previous-diary', id] }),
      queryClient.invalidateQueries({ queryKey: ['previous-motorcycles'] }),
    ])
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to="/painel" className="text-sm text-ink underline underline-offset-4">Voltar ao painel</Link>
        <h1 className="heading mt-4 text-3xl text-ink">Seu diário da {[moto.brand, moto.model].join(' ')}</h1>
        <p className="mt-1 max-w-prose text-muted">
          Esta moto foi sua até {formatDate(moto.owned_until, 'short')}. Você não edita mais, mas pode consultar e excluir o que escreveu.
          As entradas privadas continuam só suas.
        </p>
      </div>
      {diary.isError && <Notice tone="error">Não foi possível carregar o diário.</Notice>}
      {diary.isSuccess && mine.length === 0 && <p className="text-muted">Nenhuma entrada sua nesta moto.</p>}
      {mine.map((e) => <DiaryEntryCard key={e.id} entry={e} onDelete={onDelete} readOnly />)}
    </div>
  )
}
