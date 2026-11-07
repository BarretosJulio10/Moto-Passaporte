import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { formatPlanPrice, PERIOD_LABEL, type BillingPeriod } from '@/modules/plans/api'
import { reconcileSubscriptions, STATUS_LABEL, type SubscriptionStatus } from '@/modules/plans/billingApi'
import { adminListPaymentEvents, adminListSubscriptions } from './paymentsApi'

const RESULT_LABEL: Record<string, string> = {
  received: 'Recebido',
  processed: 'Processado',
  ignored: 'Ignorado',
  invalid_signature: 'Assinatura inválida',
  error: 'Erro',
}

const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR') : '—')

/** Investigação e conciliação de cobranças, sem editar registros financeiros (PRD 8.3, 8.5). */
export function AdminSubscriptionsPage() {
  const qc = useQueryClient()
  const subs = useQuery({ queryKey: ['admin-subscriptions'], queryFn: adminListSubscriptions })
  const events = useQuery({ queryKey: ['admin-payment-events'], queryFn: adminListPaymentEvents })
  const [summary, setSummary] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  const reconcile = useMutation({
    mutationFn: reconcileSubscriptions,
    onSuccess: (r) => {
      setSummary({
        tone: r.ok ? 'success' : 'error',
        text: r.checked === 0
          ? 'Nada a conciliar.'
          : `${r.synced} de ${r.checked} assinatura(s) conferida(s) com o Mercado Pago.${r.failures.length ? ` Falhas: ${r.failures.join('; ')}` : ''}`,
      })
      qc.invalidateQueries({ queryKey: ['admin-subscriptions'] })
      qc.invalidateQueries({ queryKey: ['admin-payment-events'] })
    },
    onError: (e) => setSummary({ tone: 'error', text: e instanceof Error ? e.message : 'Não foi possível conciliar agora.' }),
  })

  return (
    <div>
      <Link to="/admin/pagamentos" className="text-sm text-muted underline underline-offset-4">Pagamentos</Link>
      <h1 className="heading mt-2 text-3xl text-ink">Assinaturas e avisos</h1>
      <p className="mt-1 max-w-2xl text-muted">
        Situação das assinaturas e dos avisos recebidos do Mercado Pago. A conciliação consulta cada assinatura em andamento no Mercado Pago e
        corrige o que estiver diferente. Nada aqui é editado à mão.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => reconcile.mutate()} loading={reconcile.isPending}>Conciliar agora</Button>
      </div>
      {summary && <div className="mt-3 max-w-2xl"><Notice tone={summary.tone}>{summary.text}</Notice></div>}

      <section className="mt-8" aria-labelledby="subs-title">
        <h2 id="subs-title" className="heading text-2xl text-ink">Assinaturas</h2>
        {subs.isLoading && <p className="mt-3 text-muted" role="status">Carregando…</p>}
        {subs.isError && <div className="mt-3"><Notice tone="error">Não foi possível carregar as assinaturas.</Notice></div>}
        {subs.data?.length === 0 && <p className="mt-3 text-muted">Nenhuma assinatura ainda.</p>}
        <ul className="mt-3 divide-y divide-rule border-y border-rule">
          {subs.data?.map((s) => (
            <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-3 py-3 text-sm">
              <div>
                <p className="font-semibold text-ink">{s.user_name}</p>
                <p className="text-muted">
                  {s.plan_name} · {formatPlanPrice(s.price_cents)} · {PERIOD_LABEL[s.billing_period as BillingPeriod]}
                  {s.environment === 'test' ? ' · teste' : ''} · {s.payments_approved} pagamento(s) aprovado(s)
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-graphite">{STATUS_LABEL[s.status as SubscriptionStatus] ?? s.status}</p>
                <p className="text-muted">
                  {s.current_period_end ? `Vale até ${new Date(s.current_period_end).toLocaleDateString('pt-BR')}` : 'Sem período pago'} · conferida{' '}
                  {dt(s.last_synced_at)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10" aria-labelledby="events-title">
        <h2 id="events-title" className="heading text-2xl text-ink">Últimos avisos do Mercado Pago</h2>
        {events.data?.length === 0 && <p className="mt-3 text-muted">Nenhum aviso recebido ainda.</p>}
        <ul className="mt-3 divide-y divide-rule border-y border-rule text-sm">
          {events.data?.map((e) => (
            <li key={e.id} className="flex flex-wrap justify-between gap-2 py-2.5">
              <span className="text-graphite">
                {dt(e.received_at)} · {e.event_type ?? 'sem tipo'} {e.resource_id ? `#${e.resource_id}` : ''}
              </span>
              <span className={e.result === 'error' || e.result === 'invalid_signature' ? 'text-danger' : 'text-muted'}>
                {RESULT_LABEL[e.result] ?? e.result}
                {e.detail ? ` — ${e.detail}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
