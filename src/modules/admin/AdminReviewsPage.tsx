import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { TextField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { translateDbError } from '@/core/shared/dbErrors'
import { adminListReviews, adminModerateReview, stars, type AdminReview } from '@/modules/workshop/growth/api'
import { validReason } from './adminApi'

const d = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—')

/** Moderação de avaliações de oficinas (PRD 2.1 §18, ADR-047). A oficina só denuncia; quem oculta é a plataforma. */
export function AdminReviewsPage() {
  const [onlyReported, setOnlyReported] = useState(true)
  const list = useQuery({ queryKey: ['admin-reviews', onlyReported], queryFn: () => adminListReviews(onlyReported) })
  return (
    <div>
      <Link to="/admin" className="text-sm text-muted underline underline-offset-4">Administração</Link>
      <h1 className="heading mt-2 text-3xl text-ink">Avaliações de oficinas</h1>
      <p className="mt-1 max-w-2xl text-muted">
        Só cliente com OS concluída avalia. Oculte apenas o que fere as regras (ofensa, dados pessoais, conteúdo falso evidente). Nota baixa
        não é motivo para ocultar. Toda decisão fica na auditoria.
      </p>
      <div className="mt-5 flex gap-2" role="tablist">
        <Button size="sm" variant={onlyReported ? 'primary' : 'secondary'} role="tab" aria-selected={onlyReported} onClick={() => setOnlyReported(true)}>Denunciadas</Button>
        <Button size="sm" variant={!onlyReported ? 'primary' : 'secondary'} role="tab" aria-selected={!onlyReported} onClick={() => setOnlyReported(false)}>Recentes</Button>
      </div>
      {list.isError && <div className="mt-4"><Notice tone="error">{translateDbError(list.error as { code?: string; message?: string })}</Notice></div>}
      {list.data?.length === 0 && <p className="mt-4 text-muted">{onlyReported ? 'Nenhuma denúncia aguardando.' : 'Nenhuma avaliação.'}</p>}
      <ul className="mt-4 divide-y divide-rule border-y border-rule">
        {list.data?.map((r) => <Item key={r.id} r={r} />)}
      </ul>
    </div>
  )
}

function Item({ r }: { r: AdminReview }) {
  const qc = useQueryClient()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function act(action: 'hide' | 'keep' | 'restore') {
    const bad = validReason(reason)
    if (bad) return setError(bad)
    setBusy(true)
    setError(null)
    try {
      await adminModerateReview(r.id, action, reason.trim())
      await qc.invalidateQueries({ queryKey: ['admin-reviews'] })
    } catch (err) {
      setError(translateDbError(err as { code?: string; message?: string }))
    } finally {
      setBusy(false)
    }
  }
  return (
    <li className="py-4 text-sm">
      <p className="font-semibold text-ink">
        <a href={`/oficinas/${r.workshop_slug}`} target="_blank" rel="noreferrer" className="underline underline-offset-4">{r.workshop}</a>
        {' · '}<span className="text-amber-600">{stars(r.rating)}</span> · {r.display_name} · {d(r.created_at)}
        {r.status === 'hidden' ? ' · OCULTA' : ''}
      </p>
      {r.comment && <p className="mt-1 whitespace-pre-line text-graphite">“{r.comment}”</p>}
      {r.reply && <p className="mt-1 text-muted">Resposta da oficina: {r.reply}</p>}
      {r.reported_at && <p className="mt-1 text-graphite"><span className="font-semibold">Denúncia ({d(r.reported_at)}):</span> {r.report_reason}</p>}
      {r.moderated_at && <p className="mt-1 text-muted">Decisão em {d(r.moderated_at)}: {r.moderation_note}</p>}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <TextField label="Motivo (fica na auditoria)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className="min-w-[16rem] flex-1" />
        {r.status === 'published' ? <Button size="sm" loading={busy} onClick={() => act('hide')}>Ocultar</Button> : <Button size="sm" loading={busy} onClick={() => act('restore')}>Publicar de novo</Button>}
        {r.status === 'published' && r.reported_at && !r.moderated_at && <Button size="sm" variant="secondary" loading={busy} onClick={() => act('keep')}>Manter publicada</Button>}
      </div>
      {error && <div className="mt-2"><Notice tone="error">{error}</Notice></div>}
    </li>
  )
}
