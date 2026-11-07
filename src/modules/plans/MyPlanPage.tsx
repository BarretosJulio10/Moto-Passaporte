import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/core/auth/AuthProvider'
import { Notice } from '@/components/Notice'
import { getStorageUsage } from '@/modules/attachments/api'
import { formatBytes } from '@/modules/attachments/files'
import { usePublicSettings } from '@/modules/public_site/usePublicSettings'
import { fetchMyPlan, formatQuota } from './api'
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

export function MyPlanPage() {
  const { user } = useAuth()
  const plan = useQuery({ queryKey: ['my-plan', user?.id], enabled: Boolean(user), queryFn: fetchMyPlan })
  const usage = useQuery({ queryKey: ['storage-usage', user?.id], enabled: Boolean(user), queryFn: getStorageUsage })
  const { data: settings } = usePublicSettings()

  return (
    <div>
      <Link to="/painel" className="text-sm text-muted underline underline-offset-4">Painel</Link>
      <h1 className="heading mt-2 text-3xl text-ink">Meu plano</h1>
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
          {plan.data.motorcycles_used >= plan.data.max_motorcycles && (
            <p className="mt-4 text-sm text-muted">Você chegou ao limite de motos do seu plano.</p>
          )}
        </section>
      )}

      {settings && settings.plans.length > 0 && (
        <section className="mt-10" aria-labelledby="options-title">
          <h2 id="options-title" className="heading text-2xl text-ink">Planos disponíveis</h2>
          <PlansGrid plans={settings.plans} billingEnabled={settings.billingEnabled} showSignup={false} />
        </section>
      )}
    </div>
  )
}
