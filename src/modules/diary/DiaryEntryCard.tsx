import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { formatDate } from '@/core/shared/format'
import { AttachmentList } from '@/modules/attachments/AttachmentList'
import type { DiaryEntry } from './api'
import { DIARY_CATEGORY_LABEL, VISIBILITY_LABEL } from './schemas'

type Props = {
  entry: DiaryEntry
  onDelete: (id: string) => Promise<void>
  /** Moto que já foi do autor: só consultar e excluir. */
  readOnly?: boolean
}

export function DiaryEntryCard({ entry: e, onDelete, readOnly = false }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function confirmDelete() {
    setBusy(true)
    setError('')
    try {
      await onDelete(e.id)
    } catch {
      setError('Não foi possível excluir agora. Tente de novo.')
      setBusy(false)
    }
  }

  const shareable = e.visibility === 'shareable'
  return (
    <article aria-labelledby={`diary-${e.id}`} className="rounded-doc border border-rule bg-sheet p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted">
            {formatDate(e.entry_date)}, {DIARY_CATEGORY_LABEL[e.category]}
          </p>
          <h3 id={`diary-${e.id}`} className="heading mt-0.5 text-lg text-ink">{e.title}</h3>
          {e.location && <p className="mt-0.5 text-sm text-muted">Local: {e.location}</p>}
        </div>
        <span
          className={`shrink-0 rounded-[0.35rem] border px-2 py-0.5 text-xs font-semibold ${
            shareable ? 'border-stamp text-stamp' : 'border-rule bg-paper text-muted'
          }`}
        >
          {VISIBILITY_LABEL[e.visibility]}
        </span>
      </div>

      {!e.is_mine && <p className="mt-2 text-sm text-stamp">Escrita por um dono anterior.</p>}
      {e.body && <p className="mt-3 whitespace-pre-line text-graphite">{e.body}</p>}

      <AttachmentList attachments={e.photos} />

      {e.is_mine && !confirming && (
        <div className="mt-3 flex flex-wrap gap-1">
          {!readOnly && <Link
            to={`/painel/motos/${e.motorcycle_id}/diario/${e.id}/editar`}
            className="px-2 py-2 text-sm font-semibold text-ink underline-offset-4 hover:underline sm:text-[0.95rem]"
          >
            Editar
          </Link>}
          <Button variant="quiet" type="button" onClick={() => setConfirming(true)}>Excluir</Button>
        </div>
      )}

      {confirming && (
        <div className="mt-4 flex flex-col gap-3 rounded-doc border border-rule bg-paper p-3">
          <p className="text-sm text-graphite">
            Excluir esta entrada{e.photos.length > 0 ? ` e ${e.photos.length === 1 ? 'a foto' : `as ${e.photos.length} fotos`}` : ''}? Não dá para desfazer.
          </p>
          {error && <Notice tone="error">{error}</Notice>}
          <div className="flex gap-2">
            <Button type="button" size="sm" loading={busy} onClick={confirmDelete}>{busy ? 'Excluindo…' : 'Excluir'}</Button>
            <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>Cancelar</Button>
          </div>
        </div>
      )}
    </article>
  )
}
