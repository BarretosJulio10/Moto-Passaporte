import { Button, ButtonLink } from '@/components/Button'
import { formatPlanPrice, formatQuota, PERIOD_LABEL, PERIOD_SUFFIX, type PublicPlan } from './api'

function Features({ items }: { items: string[] }) {
  if (items.length === 0) return null
  return (
    <ul className="mt-4 space-y-1.5 text-sm text-graphite">
      {items.map((f) => (
        <li key={f} className="flex gap-2">
          <span aria-hidden="true" className="text-ink">—</span>
          {f}
        </li>
      ))}
    </ul>
  )
}

/** Planos vindos do cadastro (ADR-018): nada de preço ou limite fixo no código. */
export function PlansGrid({
  plans,
  billingEnabled,
  showSignup = true,
  onSubscribe,
  subscribingCode,
}: {
  plans: PublicPlan[]
  billingEnabled: boolean
  showSignup?: boolean
  /** No painel: assinar um plano Premium (só com a contratação liberada). */
  onSubscribe?: (code: string) => void
  subscribingCode?: string | null
}) {
  const free = plans.find((p) => p.kind === 'free')
  const premium = plans.filter((p) => p.kind === 'premium')
  const lead = premium[0]

  return (
    <div className="mt-10 grid gap-8 md:grid-cols-3">
      {free && (
        <div className="border-t-2 border-ink pt-4">
          <h3 className="font-semibold text-ink">{free.name}</h3>
          <p className="mt-1 heading text-2xl text-ink">Grátis</p>
          <p className="mt-2 text-muted">
            {free.max_motorcycles} {free.max_motorcycles === 1 ? 'moto' : 'motos'} e {formatQuota(free.storage_quota_mb)} para anexos.
            {free.description ? ` ${free.description}` : ''}
          </p>
          <Features items={free.features} />
          {showSignup && <ButtonLink to="/criar-conta" variant="secondary" className="mt-5">Criar conta grátis</ButtonLink>}
        </div>
      )}
      {lead && (
        <div className="border-t-2 border-rule pt-4">
          <h3 className="font-semibold text-ink">Premium</h3>
          <ul className="mt-2 space-y-2" aria-label="Preços do Premium">
            {premium.map((p) => (
              <li key={p.code} className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-graphite">{PERIOD_LABEL[p.billing_period]}</span>
                <span className="text-right">
                  <span className="font-semibold text-ink">{formatPlanPrice(p.price_cents)}</span>{' '}
                  <span className="text-sm text-muted">{PERIOD_SUFFIX[p.billing_period]}</span>
                  {p.price_note && <span className="block text-sm text-muted">{p.price_note}</span>}
                </span>
                {billingEnabled && onSubscribe && (
                  <Button size="sm" className="mt-1 w-full" loading={subscribingCode === p.code} disabled={Boolean(subscribingCode)}
                    onClick={() => onSubscribe(p.code)} aria-label={`Assinar ${p.name}`}>
                    Assinar {p.name.replace(/^Premium\s*/i, '').toLowerCase() || 'Premium'}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-muted">
            Até {lead.max_motorcycles} {lead.max_motorcycles === 1 ? 'moto' : 'motos'} e {formatQuota(lead.storage_quota_mb)} para anexos.
            {lead.trial_days > 0 ? ` ${lead.trial_days} dias grátis para experimentar.` : ''}
          </p>
          <Features items={lead.features} />
          {!billingEnabled && <p className="mt-4 text-sm font-semibold text-muted">Contratação em breve.</p>}
          {billingEnabled && !onSubscribe && (
            <ButtonLink to="/painel/plano" className="mt-5">Assinar o Premium</ButtonLink>
          )}
          {billingEnabled && (
            <p className="mt-3 text-sm text-muted">
              Pagamento pelo Mercado Pago, renovação automática. Cancele quando quiser: o Premium continua até o fim do período pago.
            </p>
          )}
        </div>
      )}
      {showSignup && (
      <div className="border-t-2 border-rule pt-4">
        <h3 className="font-semibold text-ink">Para quem vai comprar</h3>
        <p className="mt-2 text-muted">
          Consultar um passaporte compartilhado pelo vendedor é sempre grátis e não exige conta.
        </p>
      </div>
      )}
    </div>
  )
}
