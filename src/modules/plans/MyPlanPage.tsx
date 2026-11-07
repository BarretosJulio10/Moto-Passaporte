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
  fetchMyPayments,
  fetchMySubscription,
  PAYMENT_STATUS_LABEL,
  startSubscription,
  STATUS_LABEL,
  syncSubscription,
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
      <Link to="/painel/plano" className="font-semibold text-ink underline underline-offset-4">Ver plano</Link>
    </p>
  )
}

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—')

function SubscriptionCard({ sub, onCancel, canceling }: { sub: MySubscription; onCancel: () => void; canceling: boolean }) {
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
        {sub.status === 'pending' && <p>Assim que o Mercado Pago confirmar o pagamento, o Premium é liberado. Isso pode levar alguns minutos.</p>}
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
  const [message, setMessage] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(
    returning ? { tone: 'info', text: 'Estamos confirmando seu pagamento com o Mercado Pago. Pode levar alguns minutos.' } : null,
  )
  const [subscribing, setSubscribing] = useState<string | null>(null)
  const plan = useQuery({ queryKey: ['my-plan', user?.id], enabled: Boolean(user), queryFn: fetchMyPlan })
  const usage = useQuery({ queryKey: ['storage-usage', user?.id], enabled: Boolean(user), queryFn: getStorageUsage })
  const sub = useQuery({ queryKey: ['my-subscription', user?.id], enabled: Boolean(user), queryFn: fetchMySubscription })
  const payments = useQuery({ queryKey: ['my-payments', user?.id], enabled: Boolean(user), queryFn: fetchMyPayments })
  const { data: settings } = usePublicSettings()

  const refreshAll = () =>
    Promise.all(['my-plan', 'my-subscription', 'my-payments', 'storage-usage'].map((k) => qc.invalidateQueries({ queryKey: [k] })))

  const synced = useRef(false)
  useEffect(() => {
    if (!returning || !user || synced.current) return
    synced.current = true
    syncSubscription()
      .catch(() => null)
      .finally(() => {
        void refreshAll()
        setParams({}, { replace: true })
      })
  }, [returning, user])

  const cancel = useMutation({
    mutationFn: cancelSubscription,
    onSuccess: async () => {
      setMessage({ tone: 'success', text: 'Assinatura cancelada. Não haverá novas cobranças.' })
      await refreshAll()
    },
    onError: (e) => setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'Não foi possível cancelar agora.' }),
  })

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

      {s && <SubscriptionCard sub={s} onCancel={() => cancel.mutate()} canceling={cancel.isPending} />}

      {payments.data && payments.data.length > 0 && (
        <section className="mt-8 max-w-xl" aria-labelledby="payments-title">
          <h2 id="payments-title" className="heading text-xl text-ink">Pagamentos</h2>
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
        <section className="mt-10" aria-labelledby="options-title">
          <h2 id="options-title" className="heading text-2xl text-ink">Planos disponíveis</h2>
          <PlansGrid plans={settings.plans} billingEnabled={settings.billingEnabled} showSignup={false}
            onSubscribe={subscribe} subscribingCode={subscribing} />
        </section>
      )}
    </div>
  )
}
