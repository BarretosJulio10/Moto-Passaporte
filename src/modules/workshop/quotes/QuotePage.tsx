import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { TextAreaField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { PageHeader } from '@/components/AppLayout'
import { translateDbError } from '@/core/shared/dbErrors'
import { vehicleLabel } from '../customers/api'
import { Card, StatusChip, WorkshopShell } from '../shared/WorkshopShell'
import { formatCents, formatDateTime } from '../shared/rpc'
import { QuoteDocument, type QuoteDoc } from './QuoteDocument'
import { QuoteEditor } from './QuoteEditor'
import { ChecklistSummary } from '../service-orders/InspectionAndPhotos'
import { createOrderFromQuote } from '../service-orders/api'
import {
  approvalLink, AWAITING, cancelQuote, createQuote, EVENT_LABEL, fetchQuote, logQuoteEvent, quoteWhatsappText, reviseQuote,
  fetchQuoteEntry, revokeQuoteLink, sendQuote, STATUS_LABEL, STATUS_TONE, VERSION_STATUS_LABEL, whatsappUrl,
  type LinkResult, type Quote, type QuoteVersion,
} from './api'

type Err = { code?: string; message?: string }

export function QuotePage() {
  return <WorkshopShell>{({ orgId, perms }) => <QuoteView orgId={orgId} canEdit={perms.manage_quotes} />}</WorkshopShell>
}

export function toDoc(q: Quote, v: QuoteVersion): QuoteDoc {
  return {
    workshop: q.workshop, number: q.number, versionNo: v.version_no, issuedAt: v.sent_at, validUntil: v.valid_until,
    customerName: q.customer.full_name, customerPhone: q.customer.whatsapp ?? q.customer.phone, vehicle: q.vehicle, km: v.km,
    problem: v.problem, diagnosis: v.diagnosis, notes: v.notes, paymentTerms: v.payment_terms, estimatedDays: v.estimated_days,
    items: v.items, subtotalCents: v.subtotal_cents, discountType: v.discount_type, discountValue: v.discount_value,
    discountCents: v.discount_cents, totalCents: v.total_cents, isComplement: Boolean(q.parent_quote_id),
    parentNumber: q.parent?.number, complementReason: q.complement_reason, authorName: v.created_by_name,
  }
}

function QuoteView({ orgId, canEdit }: { orgId: string; canEdit: boolean }) {
  const { quoteId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const key = ['ws-quote', orgId, quoteId]
  const q = useQuery({ queryKey: key, queryFn: () => fetchQuote(orgId, quoteId), enabled: Boolean(quoteId) })
  const [link, setLink] = useState<LinkResult | null>(null)
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState('')
  const [askReason, setAskReason] = useState<'' | 'revise' | 'cancel' | 'complement'>('')
  const [reason, setReason] = useState('')

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: key }),
    queryClient.invalidateQueries({ queryKey: ['ws-quotes', orgId] }),
    queryClient.invalidateQueries({ queryKey: ['ws-dashboard', orgId] }),
  ])

  if (q.isLoading) return <p className="text-muted" role="status">Carregando…</p>
  if (q.isError || !q.data) return <Notice tone="error">{translateDbError(q.error as Err)}</Notice>
  const quote = q.data
  const current = quote.versions.find((v) => v.version_no === quote.current_version) ?? quote.versions[0]
  if (!current) return <Notice tone="error">Orçamento sem versão.</Notice>
  const shown = quote.versions.find((v) => v.version_no === (selectedVersion ?? quote.current_version)) ?? current
  const approval = quote.approvals.find((a) => a.version_id === shown.id)
  const marks = approval ? Object.fromEntries(shown.items.map((i) => [i.position, approval.approved_positions.includes(i.position)])) : undefined
  const awaiting = AWAITING.includes(quote.status)
  const url = link ? approvalLink(link.token) : null
  const vehicleText = quote.vehicle ? vehicleLabel(quote.vehicle) : null
  const waText = url ? quoteWhatsappText({
    customerName: quote.customer.full_name, workshopName: quote.workshop.business_name, number: quote.number, vehicle: vehicleText,
    totalCents: current.total_cents, validUntil: current.valid_until, link: url, complement: Boolean(quote.parent_quote_id),
  }) : ''

  async function run(name: string, fn: () => Promise<unknown>) {
    setBusy(name)
    setError(null)
    try { await fn() } catch (err) { setError(translateDbError(err as Err)) } finally { setBusy('') }
  }

  async function confirmReason() {
    const r = reason.trim()
    if (askReason !== 'cancel' && r.length < 3) { setError('Escreva o motivo (pelo menos 3 letras).'); return }
    await run(askReason, async () => {
      if (askReason === 'revise') { await reviseQuote(orgId, quote.id, r); setLink(null); setSelectedVersion(null) }
      if (askReason === 'cancel') { await cancelQuote(orgId, quote.id, r); setLink(null) }
      if (askReason === 'complement') {
        const id = await createQuote(orgId, quote.customer_id, quote.vehicle_id, quote.id, r)
        navigate(`/oficina/${orgId}/orcamentos/${id}`)
        return
      }
      await refresh()
      setAskReason('')
      setReason('')
    })
  }

  return (
    <div>
      <div className="print:hidden">
        <Link to={`/oficina/${orgId}/orcamentos`} className="text-sm text-muted underline underline-offset-4">Orçamentos</Link>
        <div className="mt-2">
          <PageHeader
            title={<span className="flex flex-wrap items-center gap-3">Orçamento nº {quote.number}<StatusChip className={STATUS_TONE[quote.status]}>{STATUS_LABEL[quote.status]}</StatusChip></span>}
            intro={<>
              <Link to={`/oficina/${orgId}/clientes/${quote.customer_id}`} className="underline underline-offset-4">{quote.customer.full_name}</Link>
              {vehicleText ? ` · ${vehicleText}` : ''} · versão {quote.current_version}
              {quote.parent && <> · complementa o <Link to={`/oficina/${orgId}/orcamentos/${quote.parent.id}`} className="underline underline-offset-4">nº {quote.parent.number}</Link></>}
            </>}
            actions={current.status !== 'draft' && (
              <Button variant="secondary" onClick={() => { void logQuoteEvent(orgId, quote.id, 'printed').catch(() => undefined); window.print() }}>Imprimir ou salvar em PDF</Button>
            )} />
        </div>
      </div>

      {error && <div className="mt-4 max-w-2xl print:hidden"><Notice tone="error">{error}</Notice></div>}

      <QuoteEntryCard orgId={orgId} quoteId={quote.id} />

      {current.status === 'draft' && quote.status === 'draft' && canEdit ? (
        <div className="mt-6">
          {current.change_reason && <div className="mb-4 max-w-2xl"><Notice tone="info" title={`Versão ${current.version_no}`}>Motivo da nova versão: {current.change_reason}</Notice></div>}
          <QuoteEditor key={current.id} orgId={orgId} quote={quote} version={current} onSaved={refresh}
            onSent={async (l) => { setLink(l); await refresh() }} />
        </div>
      ) : (
        <div className="mt-6 grid gap-6 2xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="min-w-0">
            {quote.versions.length > 1 && (
              <div className="mb-3 flex flex-wrap items-center gap-2 print:hidden" role="group" aria-label="Versões">
                <span className="text-sm text-muted">Versão:</span>
                {[...quote.versions].reverse().map((v) => (
                  <button key={v.id} type="button" aria-pressed={v.id === shown.id} onClick={() => setSelectedVersion(v.version_no)}
                    className={`rounded-full border px-3 py-1 text-sm font-semibold ${v.id === shown.id ? 'border-ink bg-ink text-sheet' : 'border-rule text-ink hover:border-ink'}`}>
                    {v.version_no}
                  </button>
                ))}
                <span className="text-sm text-muted">{VERSION_STATUS_LABEL[shown.status]}{shown.change_reason ? ` · motivo: ${shown.change_reason}` : ''}</span>
              </div>
            )}
            <QuoteDocument doc={toDoc(quote, shown)} approvalUrl={shown.id === current.id ? url : null} itemMarks={marks}
              footer={approval && (
                <section className="report-break-avoid mt-5 rounded-doc border border-ink/30 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">Resposta do cliente</p>
                  <p className="mt-1">
                    <span className="font-semibold">{approval.decision === 'approved' ? 'Aprovado integralmente' : approval.decision === 'partial' ? 'Aprovado em parte' : 'Recusado'}</span>
                    {' '}por {approval.signer_name} em {formatDateTime(approval.created_at)}. Total autorizado: <span className="font-semibold">{formatCents(approval.approved_total_cents)}</span>.
                  </p>
                  {approval.reason && <p className="mt-1">Motivo informado: {approval.reason}</p>}
                  <p className="mt-1 text-xs text-muted">Comprovante {approval.receipt_code} · confirmação: "{approval.confirmation_text}" · termos {approval.terms_version}. Registro eletrônico de aceite comercial; não é assinatura ICP-Brasil.</p>
                </section>
              )} />
          </div>

          <aside className="flex flex-col gap-4 print:hidden 2xl:sticky 2xl:top-6 2xl:self-start">
            {url && (
              <Card title="Link de aprovação pronto">
                <p className="text-sm text-graphite">Envie ao cliente. Ele vê os itens e aprova tudo ou só parte, sem precisar de conta.</p>
                <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Link de aprovação"
                  className="mt-3 w-full rounded-doc border border-rule bg-paper px-3 py-2 text-sm" />
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={whatsappUrl(quote.customer.whatsapp ?? quote.customer.phone, waText)} target="_blank" rel="noreferrer"
                    onClick={() => { void logQuoteEvent(orgId, quote.id, 'whatsapp_prepared').then(refresh).catch(() => undefined) }}
                    className="inline-flex items-center justify-center rounded-doc bg-ink px-4 py-2.5 text-sm font-semibold text-sheet hover:bg-ink-soft">
                    Enviar pelo WhatsApp
                  </a>
                  <Button size="sm" variant="secondary" onClick={() => void navigator.clipboard?.writeText(url)}>Copiar link</Button>
                </div>
                <p className="mt-2 text-xs text-muted">
                  O link aparece só agora. Abrir o WhatsApp não confirma a entrega: o sistema registra quando o cliente abrir o link.
                  {quote.customer.whatsapp ? '' : ' Este cliente não tem WhatsApp cadastrado; escolha o contato no WhatsApp.'}
                </p>
              </Card>
            )}

            {quote.link && !url && awaiting && (
              <Card title="Aguardando o cliente">
                <p className="text-sm text-graphite">
                  Link criado em {formatDateTime(quote.link.created_at)}, vale até {formatDateTime(quote.link.expires_at)}.
                  {quote.link.first_viewed_at ? ` Aberto ${quote.link.view_count} vez${quote.link.view_count === 1 ? '' : 'es'}; a última em ${formatDateTime(quote.link.last_viewed_at)}.` : ' O cliente ainda não abriu.'}
                </p>
                {canEdit && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" loading={busy === 'resend'} onClick={() => run('resend', async () => { setLink(await sendQuote(orgId, quote.id)); await refresh() })}>
                      Reenviar (novo link)
                    </Button>
                    <Button size="sm" variant="quiet" loading={busy === 'revoke'} onClick={() => run('revoke', async () => { await revokeQuoteLink(orgId, quote.id); await refresh() })}>
                      Desativar link
                    </Button>
                  </div>
                )}
                <p className="mt-2 text-xs text-muted">Reenviar gera um link novo e o anterior para de funcionar. O orçamento continua o mesmo.</p>
              </Card>
            )}

            {canEdit && quote.status !== 'canceled' && (
              <Card title="Ações">
                {askReason ? (
                  <div>
                    <TextAreaField rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
                      label={askReason === 'revise' ? 'O que mudou nesta nova versão?' : askReason === 'complement' ? 'Por que é preciso um orçamento complementar?' : 'Motivo do cancelamento (opcional)'} />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" loading={busy === askReason} onClick={confirmReason}>
                        {askReason === 'revise' ? 'Criar nova versão' : askReason === 'complement' ? 'Criar complementar' : 'Cancelar orçamento'}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => { setAskReason(''); setReason('') }}>Voltar</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-start gap-2">
                    {(awaiting || quote.status === 'rejected' || quote.status === 'expired') && (
                      <Button size="sm" variant="secondary" onClick={() => setAskReason('revise')}>Criar nova versão</Button>
                    )}
                    {(quote.status === 'approved' || quote.status === 'partially_approved') && !quote.parent_quote_id && (
                      <Button size="sm" loading={busy === 'os'} onClick={() => run('os', async () => {
                        const id = await createOrderFromQuote(orgId, quote.id)
                        navigate(`/oficina/${orgId}/os/${id}`)
                      })}>Abrir ordem de serviço</Button>
                    )}
                    {(quote.status === 'approved' || quote.status === 'partially_approved') && (
                      <Button size="sm" variant="secondary" onClick={() => setAskReason('complement')}>Orçamento complementar</Button>
                    )}
                    {quote.status !== 'approved' && quote.status !== 'partially_approved' && (
                      <Button size="sm" variant="quiet" onClick={() => setAskReason('cancel')}>Cancelar orçamento</Button>
                    )}
                    <p className="text-xs text-muted">
                      {quote.status === 'approved' || quote.status === 'partially_approved'
                        ? 'Serviço extra precisa de orçamento complementar e nova aprovação. A aprovação deste não vale para itens novos.'
                        : 'Nova versão preserva a anterior e invalida o link antigo.'}
                    </p>
                  </div>
                )}
              </Card>
            )}

            {quote.complements.length > 0 && (
              <Card title="Complementares">
                <ul className="flex flex-col gap-1 text-sm">
                  {quote.complements.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2">
                      <Link to={`/oficina/${orgId}/orcamentos/${c.id}`} className="font-semibold text-ink underline underline-offset-4">Nº {c.number}</Link>
                      <StatusChip className={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</StatusChip>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <Card title="Histórico">
              <ol className="flex flex-col gap-2.5 text-sm">
                {quote.events.map((e) => (
                  <li key={e.id} className="border-l-2 border-rule pl-3">
                    <p className="font-semibold text-ink">{EVENT_LABEL[e.kind] ?? e.kind}{e.version_no ? <span className="font-normal text-muted"> · v{e.version_no}</span> : null}</p>
                    <p className="text-muted">{formatDateTime(e.created_at)}{e.actor_label ? ` · ${e.actor_label}` : ''}</p>
                    {typeof e.data?.reason === 'string' && e.data.reason && <p className="text-graphite">"{e.data.reason}"</p>}
                  </li>
                ))}
              </ol>
            </Card>
          </aside>
        </div>
      )}
    </div>
  )
}

/** Orçamento nascido de uma entrada: o checklist feito quando o cliente deixou a moto (ADR-060). */
function QuoteEntryCard({ orgId, quoteId }: { orgId: string; quoteId: string }) {
  const [open, setOpen] = useState(false)
  const e = useQuery({ queryKey: ['ws-quote-entry', orgId, quoteId], queryFn: () => fetchQuoteEntry(orgId, quoteId) })
  const d = e.data
  if (!d) return null
  const problems = d.entry ? Object.values(d.entry.items).filter((v) => v.state === 'atencao' || v.state === 'avaria').length : 0
  return (
    <div className="mt-6 print:hidden">
      <Card title={`Entrada da moto · OS nº ${d.order_number}`}
        actions={<Link to={`/oficina/${orgId}/os/${d.order_id}`} className="text-sm font-semibold underline underline-offset-4">Abrir a OS</Link>}>
        {d.entry ? (
          <>
            <p className="text-sm text-graphite">
              Checklist de entrada feito em {formatDateTime(d.entry.recorded_at)}
              {problems > 0 ? ` · ${problems} item${problems === 1 ? '' : 's'} com atenção ou avaria` : ' · tudo OK'}
              {` · ${d.photos} foto${d.photos === 1 ? '' : 's'} de entrada`}
              {d.entry.customer_ack_at ? ` · cliente confirmou (${d.entry.customer_ack_name})` : ''}
            </p>
            <button type="button" onClick={() => setOpen(!open)} className="mt-2 text-sm font-semibold underline underline-offset-4">{open ? 'Esconder checklist' : 'Ver checklist'}</button>
            {open && <div className="mt-3"><ChecklistSummary data={d.entry} /></div>}
          </>
        ) : (
          <p className="text-sm text-muted">O checklist de entrada ainda não foi feito. Faça na OS antes de enviar o orçamento.</p>
        )}
      </Card>
    </div>
  )
}
