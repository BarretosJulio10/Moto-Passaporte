import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { formatPlanPrice, PERIOD_LABEL, type BillingPeriod } from '@/modules/plans/api'
import { reconcileSubscriptions, STATUS_LABEL, type SubscriptionStatus } from '@/modules/plans/billingApi'
import { INVOICE_STATUS_LABEL } from '@/modules/plans/billingApi'
import { adminListInvoices, adminListPasses, adminListPaymentEvents, adminListSubscriptions } from './paymentsApi'
import { PASS_STATUS_LABEL, PAY_METHOD_LABEL } from '@/modules/plans/billingApi'

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
  const invoices = useQuery({ queryKey: ['admin-invoices'], queryFn: adminListInvoices })
  const passes = useQuery({ queryKey: ['admin-passes'], queryFn: adminListPasses })
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
      qc.invalidateQueries({ queryKey: ['admin-invoices'] })
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

      <section className="mt-10" aria-labelledby="passes-title">
        <h2 id="passes-title" className="heading text-2xl text-ink">Pagamentos por período (Pix, débito, boleto)</h2>
        {passes.data?.length === 0 && <p className="mt-3 text-muted">Nenhum pagamento por período ainda.</p>}
        <ul className="mt-3 divide-y divide-rule border-y border-rule text-sm">
          {passes.data?.map((x) => (
            <li key={x.id} className="flex flex-wrap justify-between gap-2 py-2.5">
              <span className="text-graphite">
                {x.user_name ?? 'Sem nome'} · {x.plan_name} · {x.months} {x.months === 1 ? 'mês' : 'meses'}
                <span className="block text-xs text-muted">
                  {x.status === 'paid' && x.starts_at && x.ends_at
                    ? `Vale de ${new Date(x.starts_at).toLocaleDateString('pt-BR')} a ${new Date(new Date(x.ends_at).getTime() - 1).toLocaleDateString('pt-BR')}`
                    : `Pedido em ${new Date(x.created_at).toLocaleDateString('pt-BR')}`}
                  {x.payment_method ? ` · ${PAY_METHOD_LABEL[x.payment_method] ?? x.payment_method}` : ''}
                  {x.provider_payment_id ? ` · MP ${x.provider_payment_id}` : ''}
                  {x.environment === 'test' ? ' · teste' : ''}
                </span>
              </span>
              <span>
                <span className="font-semibold text-ink">{formatPlanPrice(x.price_cents)}</span>{' '}
                <span className={x.status === 'failed' ? 'text-danger' : 'text-muted'}>{PASS_STATUS_LABEL[x.status] ?? x.status}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10" aria-labelledby="invoices-title">
        <h2 id="invoices-title" className="heading text-2xl text-ink">Faturas</h2>
        {invoices.data?.length === 0 && <p className="mt-3 text-muted">Nenhuma fatura ainda.</p>}
        <ul className="mt-3 divide-y divide-rule border-y border-rule text-sm">
          {invoices.data?.map((i) => (
            <li key={i.id} className="flex flex-wrap justify-between gap-2 py-2.5">
              <span className="text-graphite">
                Nº {i.number} · {i.user_name} · {i.plan_name}
                <span className="block text-xs text-muted">
                  {new Date(i.period_start).toLocaleDateString('pt-BR')} a {new Date(i.period_end).toLocaleDateString('pt-BR')}
                  {i.environment === 'test' ? ' · teste' : ''}
                  {i.attempts > 0 ? ` · ${i.attempts} tentativa(s) não aprovada(s)` : ''}
                </span>
              </span>
              <span>
                <span className="font-semibold text-ink">{formatPlanPrice(i.amount_cents)}</span>{' '}
                <span className={i.status === 'failed' ? 'text-danger' : 'text-muted'}>{INVOICE_STATUS_LABEL[i.status] ?? i.status}</span>
              </span>
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
