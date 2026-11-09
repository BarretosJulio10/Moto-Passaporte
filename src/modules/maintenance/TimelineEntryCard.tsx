import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { TextField } from '@/components/Field'
import { formatDate, formatKm } from '@/core/shared/format'
import { CATEGORY_LABEL, SOURCE_COLOR, SOURCE_LABEL } from './labels'
import { formatBRL } from './schemas'
import type { TimelineEntry } from './api'
import { AttachmentList } from '@/modules/attachments/AttachmentList'
import { AttachmentPicker, type PendingAttachment } from '@/modules/attachments/AttachmentPicker'
import { MAX_FILES_PER_RECORD, type StorageUsage } from '@/modules/attachments/files'
import { PremiumLink } from '@/modules/plans/PremiumLink'

type Props = {
  entry: TimelineEntry
  successor?: TimelineEntry
  original?: TimelineEntry
  onVoid: (id: string, reason: string) => Promise<void>
  /** Envia comprovantes para o registro; devolve mensagens de falha. */
  onAttach?: (id: string, pending: PendingAttachment[]) => Promise<string[]>
  usage?: StorageUsage
  /** Visão da oficina autorizada: corrige só os próprios registros; não anula. */
  workshop?: { organizationId: string }
}

export function TimelineEntryCard({ entry: e, successor, original, onVoid, onAttach, usage, workshop }: Props) {
  const [voiding, setVoiding] = useState(false)
  const [reasonError, setReasonError] = useState<string | undefined>()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [attaching, setAttaching] = useState(false)
  const [pending, setPending] = useState<PendingAttachment[]>([])
  const [attachBusy, setAttachBusy] = useState(false)
  const [attachErrors, setAttachErrors] = useState<string[]>([])

  const superseded = e.status === 'superseded'
  const canChange = workshop
    ? Boolean(e.is_own) && !superseded && !e.is_void
    : !superseded && !e.is_void && e.source_type !== 'workshop'
  const correctHref = workshop
    ? `/oficina/${workshop.organizationId}/motos/${e.motorcycle_id}/servico?corrigir=${e.id}`
    : `/painel/motos/${e.motorcycle_id}/historico/novo?corrigir=${e.id}`
  const evidence = e.evidence_level ?? e.source_type
  const color = SOURCE_COLOR[evidence]
  const attachments = e.attachments ?? []
  const canAttach = Boolean(onAttach) && !superseded && !e.is_void && attachments.length < MAX_FILES_PER_RECORD

  async function submitAttachments() {
    if (!onAttach || pending.length === 0) return
    setAttachBusy(true)
    setAttachErrors([])
    const failures = await onAttach(e.id, pending)
    setAttachBusy(false)
    setAttachErrors(failures)
    if (failures.length === 0) {
      setPending([])
      setAttaching(false)
    } else {
      setPending([])
    }
  }

  async function submitVoid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const reason = String(new FormData(event.currentTarget).get('reason') ?? '').trim()
    if (reason.length < 3) {
      setReasonError('Explique o motivo da anulação.')
      return
    }
    setReasonError(undefined)
    setBusy(true)
    setSubmitError(null)
    try {
      await onVoid(e.id, reason)
      setVoiding(false)
    } catch (err) {
      setSubmitError((err as Error).message || 'Não foi possível anular.')
    } finally {
      setBusy(false)
    }
  }

  if (e.locked && !e.is_void) {
    return (
      <article
        className={`rounded-sheet border border-rule bg-paper p-4 sm:p-5 ${superseded ? 'border-dashed opacity-70' : ''}`}
        aria-label={`${CATEGORY_LABEL[e.category]}: ${e.title} (no cofre)`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted">
              {formatDate(e.service_date, 'short')}, {CATEGORY_LABEL[e.category]}
              {e.workshop_name ? ` · ${e.workshop_name}` : ''}
            </p>
            <h3 className={`mt-0.5 font-semibold text-ink ${superseded ? 'line-through' : ''}`}>{e.title}</h3>
          </div>
          <span className="inline-flex items-center gap-1 rounded-[0.4rem] border border-rule px-2 py-0.5 text-xs font-semibold text-muted">
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
              <rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
            </svg>
            No cofre
          </span>
        </div>
        <p className="mt-3 text-sm text-graphite">
          Detalhes e comprovantes deste serviço estão guardados e disponíveis no Premium.{' '}
          <PremiumLink>Ver planos</PremiumLink>
        </p>
      </article>
    )
  }

  if (e.is_void) {
    return (
      <article className="rounded-doc border border-dashed border-rule px-4 py-3 text-sm text-muted">
        Anulação registrada em {formatDate(e.created_at, 'short')}: {e.correction_reason}
      </article>
    )
  }

  return (
    <article
      className={`rounded-sheet border bg-sheet p-4 sm:p-5 ${superseded ? 'border-dashed border-rule opacity-70' : 'border-rule'}`}
      aria-label={`${CATEGORY_LABEL[e.category]}: ${e.title}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">
            {formatDate(e.service_date, 'short')}, {CATEGORY_LABEL[e.category]}
          </p>
          <h3 className={`mt-0.5 font-semibold text-ink ${superseded ? 'line-through' : ''}`}>{e.title}</h3>
        </div>
        <span
          className="rounded-[0.4rem] border-2 px-2 py-0.5 text-xs font-semibold"
          style={{ borderColor: color, color, boxShadow: `inset 0 0 0 1px var(--color-sheet), inset 0 0 0 2px ${color}` }}
        >
          {SOURCE_LABEL[evidence]}
        </span>
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {e.mileage !== null && (
          <div className="flex gap-1.5"><dt className="text-muted">Km</dt><dd className="font-semibold text-graphite">{formatKm(e.mileage)}</dd></div>
        )}
        {e.workshop_name && (
          <div className="flex gap-1.5"><dt className="text-muted">Oficina</dt><dd className="font-semibold text-graphite">{e.workshop_name}</dd></div>
        )}
        {e.recorded_by_name && (
          <div className="flex gap-1.5"><dt className="text-muted">Registrado por</dt><dd className="font-semibold text-graphite">{e.recorded_by_name}</dd></div>
        )}
        {e.service_value_cents !== null && (
          <div className="flex gap-1.5"><dt className="text-muted">Valor</dt><dd className="font-semibold text-graphite">{formatBRL(e.service_value_cents)}</dd></div>
        )}
      </dl>

      {e.description && <p className="mt-3 max-w-[68ch] whitespace-pre-line text-graphite">{e.description}</p>}

      {e.items.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-semibold text-ink">
            {e.items.length} {e.items.length === 1 ? 'peça' : 'peças'}
          </summary>
          <ul className="mt-2 divide-y divide-rule border-y border-rule">
            {e.items.map((i) => (
              <li key={i.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span className="text-graphite">
                  {i.item_name}
                  {i.brand ? `, ${i.brand}` : ''}
                  {i.part_number ? ` (cód. ${i.part_number})` : ''}
                </span>
                <span className="text-muted">{Number(i.quantity).toLocaleString('pt-BR')} un.</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {e.notes && <p className="mt-3 text-sm text-muted">{e.notes}</p>}

      <AttachmentList attachments={attachments} />

      {original && e.correction_reason && (
        <p className="mt-3 text-sm text-stamp">
          Corrige o registro de {formatDate(original.service_date, 'short')}. Motivo: {e.correction_reason}
        </p>
      )}
      {superseded && successor && (
        <p className="mt-3 text-sm font-semibold text-muted">
          {successor.is_void ? `Anulado. Motivo: ${successor.correction_reason}` : 'Substituído por uma correção.'}
        </p>
      )}

      {(canChange || canAttach) && !voiding && !attaching && (
        <div className="mt-3 flex flex-wrap gap-1">
          {canAttach && (
            <Button variant="quiet" type="button" onClick={() => setAttaching(true)}>
              {attachments.length ? 'Anexar mais' : 'Anexar comprovante'}
            </Button>
          )}
          {canChange && (
            <>
          <Link
            to={correctHref}
            className="px-2 py-2 text-sm font-semibold text-ink underline-offset-4 hover:underline sm:text-[0.95rem]"
          >
            Corrigir
          </Link>
          {!workshop && <Button variant="quiet" type="button" onClick={() => setVoiding(true)}>Anular</Button>}
            </>
          )}
        </div>
      )}

      {attaching && (
        <div className="mt-4 flex flex-col gap-3 rounded-doc border border-rule bg-paper p-3">
          <p className="text-sm text-muted">Nota fiscal, ordem de serviço, recibo ou foto. Depois de enviado, o arquivo não pode ser trocado.</p>
          <AttachmentPicker value={pending} onChange={setPending} usage={usage} existingCount={attachments.length} disabled={attachBusy} />
          {attachErrors.length > 0 && (
            <Notice tone="error" title="Alguns arquivos não foram enviados">
              <ul>{attachErrors.map((m) => <li key={m}>{m}</li>)}</ul>
            </Notice>
          )}
          <div className="flex gap-2">
            <Button type="button" size="sm" loading={attachBusy} disabled={pending.length === 0} onClick={submitAttachments}>
              {attachBusy ? 'Enviando…' : 'Enviar'}
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={attachBusy} onClick={() => { setAttaching(false); setPending([]); setAttachErrors([]) }}>
              Fechar
            </Button>
          </div>
        </div>
      )}

      {voiding && (
        <form onSubmit={submitVoid} noValidate className="mt-4 flex flex-col gap-3 rounded-doc border border-rule bg-paper p-3">
          <p className="text-sm text-muted">O registro continua no histórico, marcado como anulado.</p>
          {submitError && <Notice tone="error">{submitError}</Notice>}
          <TextField label="Motivo da anulação" name="reason" maxLength={500} placeholder="Ex.: lancei na moto errada" error={reasonError} />
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={busy}>Anular registro</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setVoiding(false)}>Cancelar</Button>
          </div>
        </form>
      )}
    </article>
  )
}
