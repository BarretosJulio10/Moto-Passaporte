import { useMemo, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { CheckboxField, TextAreaField, TextField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { translateDbError } from '@/core/shared/dbErrors'
import { formatDate } from '@/core/shared/format'
import { formatCents, formatDateTime, formatPhone } from '../shared/rpc'
import { QuoteDocument, type DocItem, type QuoteDoc } from '../quotes/QuoteDocument'
import { decideQuote, fetchPublicQuote, approvedTotal, type PublicQuote } from './api'
import { SaveToAccount } from '@/modules/customer_link/SaveToAccount'

type Err = { code?: string; message?: string }

function sessionId() {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function toDoc(p: PublicQuote): QuoteDoc {
  return {
    workshop: p.workshop, number: p.number, versionNo: p.version_no, issuedAt: p.issued_at, validUntil: p.valid_until,
    customerName: p.customer_name, vehicle: p.vehicle, km: p.km, problem: p.problem, diagnosis: p.diagnosis, notes: p.notes,
    paymentTerms: p.payment_terms, estimatedDays: p.estimated_days, items: p.items as DocItem[], subtotalCents: p.subtotal_cents,
    discountType: p.discount_type, discountValue: p.discount_value, discountCents: p.discount_cents, totalCents: p.total_cents,
    isComplement: p.is_complement, parentNumber: p.parent_number, complementReason: p.complement_reason,
  }
}

/** Página do cliente: ver, aprovar tudo, aprovar parte ou recusar, sem conta (PRD 2.1 §7). */
export function QuoteApprovalPage() {
  const { token = '' } = useParams()
  const queryClient = useQueryClient()
  const key = ['public-quote', token]
  const q = useQuery({ queryKey: key, queryFn: () => fetchPublicQuote(token), retry: false, refetchOnWindowFocus: false, staleTime: Infinity })

  if (q.isLoading) return <div className="mx-auto max-w-4xl px-4 py-12"><p className="text-muted" role="status">Abrindo o orçamento…</p></div>
  if (q.isError) return <Shell><Notice tone="error">{translateDbError(q.error as Err)}</Notice></Shell>
  const data = q.data!

  if (data.state === 'not_found') {
    return <Shell><Notice tone="error" title="Link não encontrado">Confira se o endereço está completo ou peça um novo link à oficina.</Notice></Shell>
  }
  if (data.state === 'revoked' || data.state === 'replaced') {
    return (
      <Shell>
        <Notice tone="info" title={data.state === 'replaced' ? 'Este link foi substituído' : 'Este link não está mais ativo'}>
          {data.state === 'replaced'
            ? `${data.workshop ?? 'A oficina'} enviou uma versão mais nova deste orçamento. Use o link mais recente que você recebeu.`
            : `${data.workshop ?? 'A oficina'} desativou este link. Se ainda precisar, peça um novo.`}
        </Notice>
      </Shell>
    )
  }
  const p = data as PublicQuote
  const decision = p.decision
  const marks = decision ? Object.fromEntries(p.items.map((i) => [i.position, decision.approved_positions.includes(i.position)])) : undefined

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
      <div className="print:hidden">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">{p.workshop.business_name} · orçamento pelo Moto Passaporte</p>
        <h1 className="heading mt-1 text-3xl text-ink">Orçamento nº {p.number}</h1>
        {p.state === 'open' && <p className="mt-1 text-muted">Confira os itens e responda até {formatDate(p.valid_until)}.</p>}
      </div>
      {p.state === 'expired' && (
        <div className="mt-4 print:hidden">
          <Notice tone="info" title="O prazo deste orçamento terminou">
            Ele não pode mais ser aprovado por aqui. Fale com a oficina{p.workshop.whatsapp ? ` pelo WhatsApp ${formatPhone(p.workshop.whatsapp)}` : ''} para receber um novo.
          </Notice>
        </div>
      )}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <QuoteDocument doc={toDoc(p)} itemMarks={marks}
            footer={decision && <Receipt p={p} />} />
        </div>
        <aside className="print:hidden lg:sticky lg:top-6 lg:self-start">
          {p.state === 'open' && <DecisionPanel p={p} token={token} onDone={(fresh) => queryClient.setQueryData(key, fresh)} />}
          {decision && (
            <div className="rounded-sheet border border-ok/40 bg-ok/5 p-4">
              <p className="heading text-lg text-ink">Resposta registrada</p>
              <p className="mt-1 text-sm text-graphite">
                {decision.decision === 'rejected' ? 'Você recusou este orçamento.' : `Você autorizou ${decision.approved_positions.length} de ${p.items.length} itens, no total de ${formatCents(decision.approved_total_cents)}.`}
              </p>
              <p className="mt-2 text-sm text-muted">Comprovante {decision.receipt_code}. A oficina já foi avisada.</p>
              <Button className="mt-3" variant="secondary" size="sm" onClick={() => window.print()}>Salvar comprovante em PDF</Button>
            </div>
          )}
          <div className="mt-4"><SaveToAccount kind="quote" token={token} workshop={p.workshop.business_name} /></div>
        </aside>
      </div>
    </div>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-2xl px-4 py-12">{children}</div>
}

function Receipt({ p }: { p: PublicQuote }) {
  const d = p.decision!
  return (
    <section className="report-break-avoid mt-5 rounded-doc border-2 border-ink p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">Comprovante de resposta · {d.receipt_code}</p>
      <p className="mt-1">
        <span className="font-semibold">{d.decision === 'approved' ? 'Aprovado integralmente' : d.decision === 'partial' ? 'Aprovado em parte' : 'Recusado'}</span>
        {' '}por {d.signer_name} em {formatDateTime(d.created_at)}, versão {p.version_no} do orçamento nº {p.number}.
      </p>
      {d.decision !== 'rejected' && <p>Itens autorizados: {d.approved_positions.join(', ')}. Total autorizado: <span className="font-semibold">{formatCents(d.approved_total_cents)}</span>.</p>}
      {d.rejected_positions.length > 0 && d.decision !== 'rejected' && <p>Itens recusados: {d.rejected_positions.join(', ')}.</p>}
      {d.reason && <p>Motivo informado: {d.reason}</p>}
      <p className="mt-1 text-xs text-muted">
        Registro eletrônico de aceite comercial (termos {d.terms_version}), com data, hora e dados técnicos da conexão. Não equivale a assinatura digital ICP-Brasil.
        Serviços adicionais exigem novo orçamento e nova aprovação.
      </p>
    </section>
  )
}

function DecisionPanel({ p, token, onDone }: { p: PublicQuote; token: string; onDone: (fresh: PublicQuote) => void }) {
  const [selected, setSelected] = useState<number[]>(() => p.items.map((i) => i.position))
  const [name, setName] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [session] = useState(sessionId)
  const total = useMemo(() => approvedTotal(p, selected), [p, selected])
  const all = selected.length === p.items.length

  async function submit(positions: number[]) {
    if (name.trim().length < 3) return setError('Escreva o seu nome completo.')
    if (!confirmed) return setError('Marque a confirmação para continuar.')
    setSending(true)
    setError(null)
    try {
      onDone(await decideQuote(token, positions, name.trim(), true, rejecting ? reason : null, session))
    } catch (err) {
      setError(translateDbError(err as Err))
    } finally {
      setSending(false)
    }
  }

  const toggle = (pos: number) => setSelected((s) => (s.includes(pos) ? s.filter((x) => x !== pos) : [...s, pos].sort((a, b) => a - b)))

  return (
    <div className="rounded-sheet border border-rule bg-sheet p-4">
      {!rejecting ? (
        <>
          <p className="heading text-lg text-ink">O que você autoriza?</p>
          <p className="mt-1 text-sm text-muted">Desmarque o que não quiser fazer agora.</p>
          <ul className="mt-3 flex flex-col gap-2">
            {p.items.map((i) => (
              <li key={i.position}>
                <label className={`flex cursor-pointer items-start gap-3 rounded-doc border px-3 py-2 ${selected.includes(i.position) ? 'border-ink/50 bg-ink/5' : 'border-rule'}`}>
                  <input type="checkbox" checked={selected.includes(i.position)} onChange={() => toggle(i.position)} className="mt-1 h-4 w-4 accent-ink" />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="font-semibold text-ink">{i.position}. {i.description}</span>
                    <span className="block tabular-nums text-muted">{formatCents(i.subtotal_cents)}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-between border-t border-ink pt-2 font-semibold">
            <span>Total autorizado</span><span className="tabular-nums">{formatCents(total)}</span>
          </div>
          {p.discount_cents > 0 && !all && <p className="mt-1 text-xs text-muted">O desconto é aplicado na proporção dos itens escolhidos.</p>}
        </>
      ) : (
        <>
          <p className="heading text-lg text-ink">Recusar o orçamento</p>
          <TextAreaField label="Quer dizer o motivo? (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="mt-3" />
        </>
      )}
      <div className="mt-4 flex flex-col gap-3">
        <TextField label="Seu nome completo" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        <CheckboxField checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)}
          label={rejecting ? 'Confirmo que recuso este orçamento.'
            : all ? 'Autorizo a execução de todos os itens deste orçamento, nos valores informados.'
              : 'Autorizo somente os itens marcados, nos valores informados. Os demais ficam recusados.'} />
      </div>
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      <div className="mt-4 flex flex-col gap-2">
        {!rejecting ? (
          <>
            <Button onClick={() => submit(selected)} loading={sending} disabled={selected.length === 0}>
              {all ? 'Aprovar orçamento' : `Aprovar ${selected.length} ite${selected.length === 1 ? 'm' : 'ns'}`}
            </Button>
            <Button variant="quiet" onClick={() => { setRejecting(true); setConfirmed(false); setError(null) }}>Recusar orçamento</Button>
          </>
        ) : (
          <>
            <Button onClick={() => submit([])} loading={sending}>Confirmar recusa</Button>
            <Button variant="secondary" onClick={() => { setRejecting(false); setConfirmed(false); setError(null) }}>Voltar</Button>
          </>
        )}
      </div>
      <p className="mt-3 text-xs text-muted">
        Sua resposta fica registrada com data, hora e dados técnicos da conexão, como comprovante para você e para a oficina.
        Não precisa criar conta. Depois de enviada, não dá para mudar por aqui: fale com a oficina.
      </p>
    </div>
  )
}
