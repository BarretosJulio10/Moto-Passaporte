import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { TextAreaField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { PageHeader } from '@/components/AppLayout'
import { translateDbError } from '@/core/shared/dbErrors'
import { Card, EmptyState, StatusChip, WorkshopShell } from '../shared/WorkshopShell'
import { formatDateTime } from '../shared/rpc'
import { listReviews, replyReview, reportReview, stars, type Review } from './api'

type Err = { code?: string; message?: string }

/** Avaliações recebidas (PRD 2.1 §18): responder em público e, se for o caso, denunciar à moderação. */
export function ReviewsPage() {
  return <WorkshopShell>{({ orgId, shop, perms }) => <ReviewsView orgId={orgId} slug={shop.public_slug} canReply={perms.manage_quotes} canReport={perms.responsible} />}</WorkshopShell>
}

function ReviewsView({ orgId, slug, canReply, canReport }: { orgId: string; slug: string; canReply: boolean; canReport: boolean }) {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['ws-reviews', orgId], queryFn: () => listReviews(orgId) })
  const refresh = () => qc.invalidateQueries({ queryKey: ['ws-reviews', orgId] })

  if (q.isLoading) return <p className="text-muted" role="status">Carregando…</p>
  if (q.isError || !q.data) return <Notice tone="error">{translateDbError(q.error as Err)}</Notice>
  const { summary, reviews } = q.data
  const max = Math.max(1, ...Object.values(summary.by_star))

  return (
    <div>
      <PageHeader title="Avaliações"
        intro={<>Quem recebe o comprovante de uma OS concluída pode avaliar uma vez. As avaliações aparecem no <Link to={`/oficinas/${slug}`} className="underline underline-offset-4">perfil público</Link>. Nota e comentário não mudam; você pode responder.</>} />
      <div className="mt-6 grid gap-6 xl:grid-cols-[20rem_minmax(0,1fr)]">
        <Card title="Resumo">
          {summary.count === 0 ? <p className="text-sm text-muted">Nenhuma avaliação publicada ainda.</p> : (
            <>
              <p className="heading text-4xl text-ink">{String(summary.average).replace('.', ',')}</p>
              <p className="tracking-wide text-amber-600" aria-hidden>{stars(summary.average ?? 0)}</p>
              <p className="text-sm text-muted">{summary.count} avaliaç{summary.count === 1 ? 'ão publicada' : 'ões publicadas'}</p>
              <ul className="mt-4 flex flex-col gap-1.5 text-sm">
                {(['5', '4', '3', '2', '1'] as const).map((k) => (
                  <li key={k} className="grid grid-cols-[2rem_minmax(0,1fr)_2rem] items-center gap-2">
                    <span className="text-muted">{k} ★</span>
                    <div className="h-2 rounded-full bg-paper"><div className="h-2 rounded-full bg-amber-500" style={{ width: `${(summary.by_star[k] / max) * 100}%` }} /></div>
                    <span className="text-right tabular-nums">{summary.by_star[k]}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-4 text-xs text-muted">Dica: depois de concluir a OS, envie o link do comprovante pelo WhatsApp; o cliente avalia por ele.</p>
        </Card>
        <div className="flex flex-col gap-4">
          {reviews.length === 0 && <EmptyState title="Sem avaliações">Elas chegam pelo comprovante das OS concluídas.</EmptyState>}
          {reviews.map((r) => <ReviewItem key={r.id} orgId={orgId} r={r} canReply={canReply} canReport={canReport} onChanged={refresh} />)}
        </div>
      </div>
    </div>
  )
}

function ReviewItem({ orgId, r, canReply, canReport, onChanged }: { orgId: string; r: Review; canReply: boolean; canReport: boolean; onChanged: () => Promise<unknown> }) {
  const [mode, setMode] = useState<'reply' | 'report' | null>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      if (mode === 'reply') await replyReview(orgId, r.id, text.trim())
      else await reportReview(orgId, r.id, text.trim())
      setMode(null)
      setText('')
      await onChanged()
    } catch (err) {
      setError(translateDbError(err as Err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="flex flex-wrap items-center gap-x-3">
          <span className="tracking-wide text-amber-600" aria-label={`${r.rating} de 5`}>{stars(r.rating)}</span>
          <span className="font-semibold text-ink">{r.display_name}</span>
          <span className="text-sm text-muted">{r.customer_name} · <Link to={`/oficina/${orgId}/os/${r.order_id}`} className="underline underline-offset-4">OS nº {r.order_number}</Link> · {formatDateTime(r.created_at)}</span>
        </p>
        <span className="flex gap-2">
          {r.status === 'hidden' && <StatusChip className="border-rule bg-paper text-muted">Ocultada pela moderação</StatusChip>}
          {r.reported_at && !r.moderated_at && <StatusChip className="border-amber-300 bg-amber-50 text-amber-900">Denunciada, em análise</StatusChip>}
        </span>
      </div>
      {r.comment && <p className="mt-2 whitespace-pre-line text-graphite">{r.comment}</p>}
      {r.reply && mode !== 'reply' && (
        <div className="mt-3 border-l-2 border-rule pl-3 text-sm"><p className="font-semibold text-ink">Sua resposta</p><p className="whitespace-pre-line text-graphite">{r.reply}</p></div>
      )}
      {r.moderated_at && <p className="mt-2 text-xs text-muted">Moderação em {formatDateTime(r.moderated_at)}{r.moderation_note ? `: ${r.moderation_note}` : ''}</p>}
      {mode ? (
        <div className="mt-3">
          <TextAreaField label={mode === 'reply' ? 'Resposta pública' : 'Por que esta avaliação deve ser analisada?'} value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={mode === 'reply' ? 1000 : 500}
            hint={mode === 'reply' ? 'Aparece no perfil logo abaixo da avaliação. Não exponha dados do cliente.' : 'Ex.: não é cliente, ofensa, dados pessoais. A avaliação continua pública até a decisão.'} />
          {error && <div className="mt-2"><Notice tone="error">{error}</Notice></div>}
          <div className="mt-2 flex gap-2">
            <Button size="sm" loading={busy} onClick={save}>{mode === 'reply' ? 'Publicar resposta' : 'Enviar denúncia'}</Button>
            <Button size="sm" variant="secondary" onClick={() => { setMode(null); setError(null) }}>Cancelar</Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {canReply && <Button size="sm" variant="secondary" onClick={() => { setMode('reply'); setText(r.reply ?? '') }}>{r.reply ? 'Editar resposta' : 'Responder'}</Button>}
          {canReport && r.status === 'published' && !(r.reported_at && !r.moderated_at) && <Button size="sm" variant="quiet" onClick={() => { setMode('report'); setText('') }}>Denunciar</Button>}
        </div>
      )}
    </Card>
  )
}
