import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { formatDateTime } from '../shared/rpc'
import { Card } from '../shared/WorkshopShell'
import { STATUS_LABEL as QUOTE_STATUS_LABEL } from '../quotes/api'
import { createOrderFromQuote, fetchEntryInfo, markDiagnosed, quoteFromOrder, setOrderStatus, type Order } from '../service-orders/api'

type Step = { label: string; done: boolean; current: boolean }

/** OS aberta na entrada (ADR-060): mostra em que passo está e o botão do próximo. */
export function EntryFlowCard({ orgId, order, canManage, canExecute, onChanged, run, busy }: {
  orgId: string; order: Order; canManage: boolean; canExecute: boolean
  onChanged: () => Promise<unknown>; run: (name: string, fn: () => Promise<unknown>) => Promise<void>; busy: string
}) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const info = useQuery({ queryKey: ['ws-entry', orgId, order.id, order.status], queryFn: () => fetchEntryInfo(orgId, order.id) })
  const [diag, setDiag] = useState('')
  const i = info.data
  if (!i?.opened_at_entry) return null
  const refresh = async () => { await qc.invalidateQueries({ queryKey: ['ws-entry', orgId, order.id] }); await onChanged() }
  const q = i.quote
  const approved = q && (q.status === 'approved' || q.status === 'partially_approved')
  const steps: Step[] = [
    { label: 'Entrada', done: true, current: false },
    { label: 'Diagnóstico', done: Boolean(i.diagnosed_at), current: !i.diagnosed_at },
    { label: 'Orçamento', done: Boolean(approved), current: Boolean(i.diagnosed_at) && !approved },
    { label: 'Aprovado na OS', done: i.has_work, current: Boolean(approved) && !i.has_work },
  ]
  const closed = ['completed', 'awaiting_pickup', 'delivered', 'canceled'].includes(order.status)
  if (i.has_work) {
    return (
      <p className="text-sm text-muted">
        Entrada {i.diagnosed_at ? `· diagnóstico em ${formatDateTime(i.diagnosed_at)}${i.diagnosed_by_name ? ` por ${i.diagnosed_by_name}` : ''}` : ''}
        {q ? <> · <Link to={`/oficina/${orgId}/orcamentos/${q.id}`} className="underline underline-offset-4">orçamento nº {q.number}</Link> aprovado</> : ''}
      </p>
    )
  }
  return (
    <Card title="Atendimento desta entrada">
      <ol className="flex flex-wrap gap-2" aria-label="Passos">
        {steps.map((s, n) => (
          <li key={s.label} className={`rounded-full border px-3 py-1 text-sm font-semibold ${s.done ? 'border-ok bg-ok/10 text-ok' : s.current ? 'border-ink bg-ink text-sheet' : 'border-rule text-muted'}`}>
            {n + 1}. {s.label}{s.done ? ' ✓' : ''}
          </li>
        ))}
      </ol>
      {closed ? null : !i.diagnosed_at ? (
        <div className="mt-4 space-y-3">
          <p className="text-graphite">
            {order.status === 'open' ? 'A moto entrou. Mande para o mecânico olhar ou registre o diagnóstico aqui.' : 'Aguardando o mecânico olhar a moto (ele marca "Diagnóstico pronto" no App da Pista).'}
          </p>
          <div className="flex flex-wrap gap-2">
            {order.status === 'open' && canExecute && (
              <Button loading={busy === 'to-diag'} onClick={() => run('to-diag', async () => { await setOrderStatus(orgId, order.id, 'awaiting_diagnosis'); await refresh() })}>Mandar para diagnóstico</Button>
            )}
          </div>
          {canExecute && (
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-graphite" htmlFor="diag-text">Diagnóstico (opcional)</label>
              <textarea id="diag-text" value={diag} onChange={(e) => setDiag(e.target.value.slice(0, 2000))} rows={3}
                placeholder="O que foi encontrado na moto" className="w-full rounded-doc border border-rule bg-sheet px-3 py-2" />
              <Button variant="secondary" loading={busy === 'diag'} onClick={() => run('diag', async () => { await markDiagnosed(orgId, order.id, diag); setDiag(''); await refresh() })}>Diagnóstico pronto</Button>
            </div>
          )}
        </div>
      ) : !q || ['canceled', 'rejected', 'expired'].includes(q.status) ? (
        <div className="mt-4 space-y-3">
          <p className="text-graphite">
            Diagnóstico pronto {i.diagnosed_by_name ? `(${i.diagnosed_by_name}, ${formatDateTime(i.diagnosed_at)})` : ''}.
            {q ? ` O orçamento nº ${q.number} foi ${QUOTE_STATUS_LABEL[q.status as keyof typeof QUOTE_STATUS_LABEL]?.toLowerCase() ?? q.status}.` : ''} Monte o orçamento: cliente, moto, km, problema e diagnóstico já vão preenchidos.
          </p>
          {canManage && (
            <Button loading={busy === 'quote'} onClick={() => run('quote', async () => { const id = await quoteFromOrder(orgId, order.id); navigate(`/oficina/${orgId}/orcamentos/${id}`) })}>
              {q ? 'Montar novo orçamento' : 'Montar orçamento'}
            </Button>
          )}
        </div>
      ) : approved ? (
        <div className="mt-4 space-y-3">
          <p className="text-graphite">O cliente aprovou o orçamento nº {q.number}. Passe os itens aprovados para esta OS e libere para a pista.</p>
          {canManage && (
            <Button loading={busy === 'merge'} onClick={() => run('merge', async () => { await createOrderFromQuote(orgId, q.id); await refresh() })}>Passar itens aprovados para esta OS</Button>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <p className="text-graphite">Orçamento nº {q.number}: <strong>{QUOTE_STATUS_LABEL[q.status as keyof typeof QUOTE_STATUS_LABEL] ?? q.status}</strong>.</p>
          <Link to={`/oficina/${orgId}/orcamentos/${q.id}`} className="inline-flex h-11 items-center rounded-doc bg-ink px-4 font-semibold text-sheet">
            {q.status === 'draft' ? 'Terminar e enviar o orçamento' : 'Ver orçamento e cobrar resposta'}
          </Link>
        </div>
      )}
    </Card>
  )
}
