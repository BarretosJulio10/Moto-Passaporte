import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { useAuth } from '@/core/auth/AuthProvider'
import { Notice } from '@/components/Notice'
import { getStorageUsage } from '@/modules/attachments/api'
import { formatBytes } from '@/modules/attachments/files'
import { usePublicSettings } from '@/modules/public_site/usePublicSettings'
import { fetchMyPlan, formatPlanPrice, formatQuota, PERIOD_LABEL } from './api'
import {
  cancelSubscription,
  fetchMyInvoices,
  fetchMyPayments,
  INVOICE_STATUS_LABEL,
  fetchMySubscription,
  PAYMENT_STATUS_LABEL,
  startSubscription,
  STATUS_LABEL,
  syncSubscription,
  startPassPayment,
  syncPassPayments,
  fetchMyPasses,
  PASS_STATUS_LABEL,
  PAY_METHOD_LABEL,
  daysLeft,
  type MySubscription,
} from './billingApi'
import { PlansGrid } from './PlansGrid'

function Meter({ label, used, total, text }: { label: string; used: number; total: number; text: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="font-semibold text-graphite">{label}</span>
        <span className="text-muted">{text}</span>
      </div>
      <div className="mt-1.5 h-2 rounded-full bg-paper" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={used}>
        <div className={`h-2 rounded-full ${pct >= 90 ? 'bg-danger' : 'bg-ink'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/** Resumo de uso do plano no painel. */
export function PlanSummary() {
  const { user } = useAuth()
  const plan = useQuery({ queryKey: ['my-plan', user?.id], enabled: Boolean(user), queryFn: fetchMyPlan })
  if (!plan.data) return null
  const p = plan.data
  return (
    <p className="text-sm text-muted">
      Plano <span className="font-semibold text-graphite">{p.name}</span> · {p.motorcycles_used} de {p.max_motorcycles}{' '}
      {p.max_motorcycles === 1 ? 'moto' : 'motos'} ·{' '}
      {p.paid_until && daysLeft(p.paid_until) <= 7 && (
        <span className="font-semibold text-danger">{daysLeft(p.paid_until) <= 1 ? 'vence hoje' : `vence em ${daysLeft(p.paid_until)} dias`} · </span>
      )}
      <Link to="/painel/plano" className="font-semibold text-ink underline underline-offset-4">
        {p.paid_until && daysLeft(p.paid_until) <= 7 ? 'Renovar' : 'Ver plano'}
      </Link>
    </p>
  )
}

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—')
/** Último dia do bônus (o fim gravado é a meia-noite seguinte). */
export const bonusLastDay = (iso: string) => new Date(new Date(iso).getTime() - 1).toLocaleDateString('pt-BR')

/** Premium pago por período: até quando vale e, perto do fim, convite para renovar (30/15/7/hoje). */
export function PaidUntil({ until, now = new Date() }: { until: string; now?: Date }) {
  const left = daysLeft(until, now)
  const last = bonusLastDay(until)
  const urgent = left <= 7
  const soon = left <= 30
  const text =
    left <= 1 ? `Seu Premium vence hoje (${last}).`
      : `Premium pago até ${last}${soon ? ` — faltam ${left} dias` : ''}.`
  return (
    <div className={`mt-3 rounded-doc border p-3 text-sm ${urgent ? 'border-danger bg-paper text-danger' : 'border-rule bg-paper text-graphite'}`} role={urgent ? 'alert' : 'status'}>
      <p className="font-semibold">{text}</p>
      {soon && (
        <p className="mt-1">
          Renove por Pix, débito ou boleto: o novo período começa quando o atual terminar, sem perder dias.{' '}
          <a href="#planos" className="font-semibold text-ink underline underline-offset-4">Renovar agora</a>
        </p>
      )}
    </div>
  )
}

function SubscriptionCard({ sub, onCancel, canceling, bonusUntil }: { sub: MySubscription; onCancel: () => void; canceling: boolean; bonusUntil?: string | null }) {
  const open = ['pending', 'active', 'past_due', 'paused'].includes(sub.status)
  return (
    <section className="mt-6 max-w-xl rounded-sheet border border-rule bg-sheet p-5" aria-label="Assinatura">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-ink">{sub.plan_name}</p>
        <span className="rounded-doc bg-paper px-2 py-0.5 text-sm text-graphite">{STATUS_LABEL[sub.status]}</span>
      </div>
      <p className="mt-1 text-sm text-muted">
        {formatPlanPrice(sub.price_cents)} · {PERIOD_LABEL[sub.billing_period]}
        {sub.environment === 'test' ? ' · ambiente de teste' : ''}
      </p>
      <div className="mt-3 text-sm text-graphite">
        {sub.status === 'pending' && bonusUntil && (
          <p>Assinatura registrada. A primeira cobrança acontece em {bonusLastDay(bonusUntil)}, quando o seu bônus terminar; até lá o Premium segue sem custo.</p>
        )}
        {sub.status === 'pending' && !bonusUntil && <p>Assim que o Mercado Pago confirmar o pagamento, o Premium é liberado. Isso pode levar alguns minutos.</p>}
        {sub.status === 'active' && <p>Próxima renovação em {date(sub.current_period_end)}.</p>}
        {sub.status === 'past_due' && (
          <p className="text-danger">
            A última cobrança não foi aprovada. O Premium continua até {date(sub.grace_until)}; confira o cartão no Mercado Pago.
          </p>
        )}
        {sub.status === 'paused' && <p>Assinatura pausada. O Premium vale até {date(sub.current_period_end)}.</p>}
        {sub.status === 'canceled' &&
          (sub.has_access ? <p>Cancelada em {date(sub.canceled_at)}. O Premium continua até {date(sub.current_period_end)}.</p> : <p>Cancelada. Você está no plano gratuito.</p>)}
      </div>
      {open && (
        <div className="mt-4">
          <Button
            variant="quiet"
            size="sm"
            loading={canceling}
            onClick={() => {
              const end = sub.current_period_end && sub.has_access ? ` O Premium continua até ${date(sub.current_period_end)}.` : ''
              if (window.confirm(`Cancelar a assinatura? Não haverá novas cobranças.${end}`)) onCancel()
            }}
          >
            Cancelar assinatura
          </Button>
        </div>
      )}
    </section>
  )
}

export function MyPlanPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const returning = params.get('assinatura') === 'retorno'
  const returningPay = params.get('pagamento') === 'retorno'
  const [message, setMessage] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(
    returning
      ? { tone: 'info', text: 'Estamos confirmando seu pagamento com o Mercado Pago. Pode levar alguns minutos.' }
      : returningPay
        ? { tone: 'info', text: 'Estamos confirmando seu pagamento. Pix costuma confirmar em segundos; boleto, em até 3 dias úteis. Avisaremos no sino.' }
        : null,
  )
  const [subscribing, setSubscribing] = useState<string | null>(null)
  const plan = useQuery({ queryKey: ['my-plan', user?.id], enabled: Boolean(user), queryFn: fetchMyPlan })
  const usage = useQuery({ queryKey: ['storage-usage', user?.id], enabled: Boolean(user), queryFn: getStorageUsage })
  const sub = useQuery({ queryKey: ['my-subscription', user?.id], enabled: Boolean(user), queryFn: fetchMySubscription })
  const payments = useQuery({ queryKey: ['my-payments', user?.id], enabled: Boolean(user), queryFn: fetchMyPayments })
  const invoices = useQuery({ queryKey: ['my-invoices', user?.id], enabled: Boolean(user), queryFn: fetchMyInvoices })
  const passes = useQuery({ queryKey: ['my-passes', user?.id], enabled: Boolean(user), queryFn: fetchMyPasses })
  const { data: settings } = usePublicSettings()

  const refreshAll = () =>
    Promise.all(['my-plan', 'my-subscription', 'my-payments', 'my-invoices', 'my-passes', 'storage-usage'].map((k) => qc.invalidateQueries({ queryKey: [k] })))

  const synced = useRef(false)
  useEffect(() => {
    if ((!returning && !returningPay) || !user || synced.current) return
    synced.current = true
    ;(returningPay ? syncPassPayments() : syncSubscription())
      .catch(() => null)
      .finally(() => {
        void refreshAll()
        setParams({}, { replace: true })
      })
  }, [returning, returningPay, user])

  const cancel = useMutation({
    mutationFn: cancelSubscription,
    onSuccess: async () => {
      setMessage({ tone: 'success', text: 'Assinatura cancelada. Não haverá novas cobranças.' })
      await refreshAll()
    },
    onError: (e) => setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'Não foi possível cancelar agora.' }),
  })

  async function payOnce(code: string) {
    setSubscribing(`pass:${code}`)
    setMessage(null)
    try {
      const url = await startPassPayment(code)
      window.location.assign(url)
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'Não foi possível abrir o pagamento.' })
      setSubscribing(null)
    }
  }

  async function subscribe(code: string) {
    setSubscribing(code)
    setMessage(null)
    try {
      const url = await startSubscription(code)
      window.location.assign(url)
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'Não foi possível iniciar a assinatura.' })
      setSubscribing(null)
    }
  }

  const s = sub.data
  const hasOpen = Boolean(s && ['active', 'past_due', 'paused'].includes(s.status))

  return (
    <div>
      <Link to="/painel" className="text-sm text-muted underline underline-offset-4">Painel</Link>
      <h1 className="heading mt-2 text-3xl text-ink">Meu plano</h1>
      {message && <div className="mt-4 max-w-xl"><Notice tone={message.tone}>{message.text}</Notice></div>}
      {plan.isLoading && <p className="mt-6 text-muted" role="status">Carregando…</p>}
      {plan.isError && <div className="mt-6"><Notice tone="error">Não foi possível carregar seu plano.</Notice></div>}
      {plan.data && (
        <section className="mt-6 max-w-xl rounded-sheet border border-rule bg-sheet p-5" aria-label="Uso do plano">
          <p className="font-semibold text-ink">{plan.data.name}</p>
          {plan.data.paid_until && !hasOpen && <PaidUntil until={plan.data.paid_until} />}
          {plan.data.bonus && (
            <p className="mt-1 text-sm text-graphite">
              {plan.data.bonus_until
                ? <>Bônus Premium sem cobrança até <strong>{bonusLastDay(plan.data.bonus_until)}</strong>. Depois disso a conta volta ao gratuito, a não ser que você assine. Se assinar agora, a primeira cobrança só acontece quando o bônus terminar.</>
                : 'Bônus Premium sem cobrança, sem prazo para terminar.'}
            </p>
          )}
          <div className="mt-4 grid gap-4">
            <Meter label="Motos" used={plan.data.motorcycles_used} total={plan.data.max_motorcycles}
              text={`${plan.data.motorcycles_used} de ${plan.data.max_motorcycles}`} />
            {usage.data && (
              <Meter label="Espaço para anexos" used={usage.data.used_bytes} total={usage.data.quota_bytes}
                text={`${formatBytes(usage.data.used_bytes)} de ${formatQuota(plan.data.storage_quota_mb)}`} />
            )}
          </div>
          {plan.data.motorcycles_used > plan.data.max_motorcycles && (
            <p className="mt-4 text-sm text-muted">
              Você tem mais motos do que o plano atual permite. Elas continuam com você, mas não dá para cadastrar novas.
            </p>
          )}
          {plan.data.motorcycles_used === plan.data.max_motorcycles && (
            <p className="mt-4 text-sm text-muted">Você chegou ao limite de motos do seu plano.</p>
          )}
        </section>
      )}

      {s && <SubscriptionCard sub={s} onCancel={() => cancel.mutate()} canceling={cancel.isPending} bonusUntil={plan.data?.bonus ? plan.data.bonus_until : null} />}

      {invoices.data && invoices.data.length > 0 && (
        <section className="mt-8 max-w-xl" aria-labelledby="invoices-title">
          <h2 id="invoices-title" className="heading text-xl text-ink">Faturas</h2>
          <ul className="mt-3 divide-y divide-rule border-y border-rule text-sm">
            {invoices.data.map((i) => (
              <li key={i.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                <span className="text-graphite">
                  {date(i.period_start)} a {date(i.period_end)}
                  <span className="block text-xs text-muted">
                    Nº {i.number}
                    {i.status === 'open' ? ` · vence em ${new Date(`${i.due_date}T12:00:00`).toLocaleDateString('pt-BR')}` : ''}
                    {i.attempts > 0 && i.status !== 'paid' ? ` · ${i.attempts} tentativa(s) não aprovada(s)` : ''}
                  </span>
                </span>
                <span className="text-right">
                  <span className="font-semibold text-ink">{formatPlanPrice(i.amount_cents)}</span>{' '}
                  <span className={i.status === 'failed' ? 'text-danger' : 'text-muted'}>{INVOICE_STATUS_LABEL[i.status] ?? i.status}</span>
                  {['paid', 'refunded', 'charged_back'].includes(i.status) && (
                    <Link to={`/painel/plano/recibo/${i.id}`} className="ml-2 font-semibold text-ink underline underline-offset-4">Recibo</Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {passes.data && passes.data.length > 0 && (
        <section className="mt-8 max-w-xl" aria-labelledby="passes-title">
          <h2 id="passes-title" className="heading text-xl text-ink">Pagamentos por Pix, débito ou boleto</h2>
          <ul className="mt-3 divide-y divide-rule border-y border-rule text-sm">
            {passes.data.map((x) => (
              <li key={x.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                <span className="text-graphite">
                  {x.plan_name} · {x.months} {x.months === 1 ? 'mês' : 'meses'}
                  <span className="block text-xs text-muted">
                    {x.status === 'paid' && x.starts_at && x.ends_at
                      ? `${date(x.starts_at)} a ${bonusLastDay(x.ends_at)}${x.payment_method ? ` · ${PAY_METHOD_LABEL[x.payment_method] ?? x.payment_method}` : ''}`
                      : `Pedido em ${date(x.created_at)}`}
                  </span>
                </span>
                <span className="text-right">
                  <span className="font-semibold text-ink">{formatPlanPrice(x.price_cents)}</span>{' '}
                  <span className="text-muted">{PASS_STATUS_LABEL[x.status] ?? x.status}</span>
                  {x.status === 'pending' && x.checkout_url && (
                    <a href={x.checkout_url} className="ml-2 font-semibold text-ink underline underline-offset-4">Continuar pagamento</a>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-muted">O comprovante fica na sua conta do Mercado Pago e no e-mail enviado por ele.</p>
        </section>
      )}

      {payments.data && payments.data.length > 0 && (
        <section className="mt-8 max-w-xl" aria-labelledby="payments-title">
          <h2 id="payments-title" className="heading text-xl text-ink">Tentativas de pagamento</h2>
          <ul className="mt-3 divide-y divide-rule border-y border-rule text-sm">
            {payments.data.map((p) => (
              <li key={p.id} className="flex flex-wrap justify-between gap-2 py-2.5">
                <span className="text-graphite">{date(p.paid_at ?? p.created_at)} · {p.plan_name}</span>
                <span>
                  <span className="font-semibold text-ink">{formatPlanPrice(p.amount_cents)}</span>{' '}
                  <span className="text-muted">{PAYMENT_STATUS_LABEL[p.status] ?? p.status}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-muted">Comprovantes ficam disponíveis na sua conta do Mercado Pago.</p>
        </section>
      )}

      {settings && settings.plans.length > 0 && !hasOpen && (
        <section className="mt-10" id="planos" aria-labelledby="options-title">
          <h2 id="options-title" className="heading text-2xl text-ink">{plan.data?.paid_until ? 'Renovar ou mudar de plano' : 'Planos disponíveis'}</h2>
          <PlansGrid plans={settings.plans} billingEnabled={settings.billingEnabled} showSignup={false}
            onSubscribe={subscribe} onPayOnce={payOnce} subscribingCode={subscribing} />
        </section>
      )}
    </div>
  )
}
