import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { CheckboxField, SelectField, TextAreaField, TextField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { translateDbError } from '@/core/shared/dbErrors'
import { parseBRL } from '@/modules/maintenance/schemas'
import {
  adminListPlans,
  adminPlanHistory,
  adminSavePlan,
  adminSetPlanActive,
  formatPlanPrice,
  formatQuota,
  ENTITLEMENT_LABEL,
  PERIOD_LABEL,
  type AdminPlan,
  type Entitlement,
  type BillingPeriod,
  type PlanInput,
  type PlanKind,
} from '@/modules/plans/api'

const PERIODS: BillingPeriod[] = ['monthly', 'semiannual', 'annual']

const FIELD_LABEL: Record<string, string> = {
  name: 'nome',
  description: 'descrição',
  price_cents: 'preço',
  price_note: 'observação do preço',
  max_motorcycles: 'motos',
  storage_quota_mb: 'espaço',
  features: 'benefícios',
  trial_days: 'teste grátis',
  cancellation_text: 'regras de cancelamento',
  is_active: 'ativo',
  entitlements: 'recursos',
  max_share_links: 'links de compartilhamento',
  is_public: 'visível no site',
  sort_order: 'ordem',
}

export type Draft = Omit<PlanInput, 'price_cents' | 'features' | 'max_motorcycles' | 'storage_quota_mb' | 'trial_days' | 'sort_order' | 'max_share_links'> & {
  max_share_links: string
  price: string
  features: string
  max_motorcycles: string
  storage_quota_mb: string
  trial_days: string
  sort_order: string
}

function toDraft(p: AdminPlan | null): Draft {
  if (!p) {
    return {
      id: null, code: '', kind: 'premium', billing_period: 'monthly', name: '', description: '', price: '',
      price_note: '', max_motorcycles: '3', storage_quota_mb: '500', features: '', trial_days: '0',
      cancellation_text: '', is_public: true, sort_order: '100', entitlements: ['pdf_reports', 'maintenance_reminders'], max_share_links: '10',
    }
  }
  return {
    id: p.id,
    code: p.code,
    kind: p.kind as PlanKind,
    billing_period: p.billing_period as BillingPeriod,
    name: p.name,
    description: p.description ?? '',
    price: (p.price_cents / 100).toFixed(2).replace('.', ','),
    price_note: p.price_note ?? '',
    max_motorcycles: String(p.max_motorcycles),
    storage_quota_mb: String(p.storage_quota_mb),
    features: p.features.join('\n'),
    trial_days: String(p.trial_days),
    cancellation_text: p.cancellation_text ?? '',
    is_public: p.is_public,
    sort_order: String(p.sort_order),
    entitlements: (p.entitlements ?? []) as Entitlement[],
    max_share_links: String(p.max_share_links ?? 3),
  }
}

/** Converte o rascunho do formulário; devolve a mensagem do primeiro erro encontrado. */
export function parseDraft(d: Draft): PlanInput | string {
  const isFree = d.kind === 'free'
  const price = isFree ? 0 : parseBRL(d.price)
  if (!isFree && (price === undefined || !Number.isFinite(price) || price <= 0)) return 'Informe um preço maior que zero. Exemplo: 9,90'
  if (!d.id && !/^[a-z0-9_]{2,40}$/.test(d.code.trim())) return 'Código: de 2 a 40 letras minúsculas, números ou _.'
  if (d.name.trim().length < 2) return 'Informe o nome do plano.'
  const int = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v) : Number.NaN)
  const motos = int(d.max_motorcycles)
  const quota = int(d.storage_quota_mb)
  const trial = isFree ? 0 : int(d.trial_days)
  const sort = int(d.sort_order)
  if (!(motos >= 1 && motos <= 100)) return 'Motos: de 1 a 100.'
  if (!(quota >= 1 && quota <= 100000)) return 'Espaço: de 1 a 100.000 MB.'
  if (!(trial >= 0 && trial <= 90)) return 'Teste grátis: de 0 a 90 dias.'
  if (!(sort >= 0 && sort <= 999)) return 'Ordem: de 0 a 999.'
  const links = int(d.max_share_links)
  if (!(links >= 1 && links <= 50)) return 'Links de compartilhamento: de 1 a 50.'
  const features = d.features.split('\n').map((f) => f.trim()).filter(Boolean)
  if (features.length > 12) return 'No máximo 12 benefícios.'
  if (features.some((f) => f.length > 120)) return 'Cada benefício pode ter até 120 caracteres.'
  return {
    id: d.id,
    code: d.code.trim(),
    kind: d.kind,
    billing_period: isFree ? 'none' : d.billing_period,
    name: d.name,
    description: d.description,
    price_cents: price ?? 0,
    price_note: d.price_note,
    max_motorcycles: motos,
    storage_quota_mb: quota,
    features,
    trial_days: trial,
    cancellation_text: d.cancellation_text,
    is_public: isFree ? true : d.is_public,
    sort_order: sort,
    entitlements: d.entitlements,
    max_share_links: links,
  }
}

function PlanForm({ plan, onDone }: { plan: AdminPlan | null; onDone: () => void }) {
  const qc = useQueryClient()
  const [d, setD] = useState<Draft>(() => toDraft(plan))
  const [error, setError] = useState<string | null>(null)
  const isFree = d.kind === 'free'
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((prev) => ({ ...prev, [k]: v }))

  const save = useMutation({
    mutationFn: adminSavePlan,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-plans'] })
      qc.invalidateQueries({ queryKey: ['plan-history'] })
      onDone()
    },
    onError: (e) => setError(translateDbError(e as { code?: string; message?: string })),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    const parsed = parseDraft(d)
    if (typeof parsed === 'string') return setError(parsed)
    setError(null)
    save.mutate(parsed)
  }

  return (
    <form onSubmit={submit} className="mt-4 grid gap-4 rounded-sheet border border-rule bg-sheet p-5" aria-label={plan ? `Editar ${plan.name}` : 'Novo plano'}>
      <h3 className="font-semibold text-ink">{plan ? `Editar ${plan.name}` : 'Novo plano Premium'}</h3>
      {plan && (
        <p className="text-sm text-muted">
          Código <code>{plan.code}</code> · {PERIOD_LABEL[plan.billing_period as BillingPeriod]}. Código e periodicidade não mudam; para outra periodicidade, crie outro plano.
          Mudanças não alteram assinaturas já contratadas.
        </p>
      )}
      {!plan && (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Código" value={d.code} onChange={(e) => set('code', e.target.value)} hint="Ex.: premium_anual_promo. Não muda depois." />
          <SelectField label="Periodicidade" value={d.billing_period} options={PERIODS} optionLabel={(v) => PERIOD_LABEL[v as BillingPeriod]}
            onChange={(e) => set('billing_period', e.target.value as BillingPeriod)} />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Nome" value={d.name} onChange={(e) => set('name', e.target.value)} maxLength={60} />
        {!isFree && <TextField label="Preço (R$)" value={d.price} onChange={(e) => set('price', e.target.value)} inputMode="decimal" placeholder="9,90" />}
      </div>
      <TextField label="Descrição curta" value={d.description} onChange={(e) => set('description', e.target.value)} maxLength={300} />
      {!isFree && (
        <TextField label="Observação do preço" value={d.price_note} onChange={(e) => set('price_note', e.target.value)} maxLength={40} hint="Ex.: R$ 7,49 por mês. Aparece abaixo do preço." />
      )}
      <div className="grid gap-4 sm:grid-cols-4">
        <TextField label="Motos" value={d.max_motorcycles} onChange={(e) => set('max_motorcycles', e.target.value)} inputMode="numeric" />
        <TextField label="Espaço (MB)" value={d.storage_quota_mb} onChange={(e) => set('storage_quota_mb', e.target.value)} inputMode="numeric" />
        {!isFree && <TextField label="Teste grátis (dias)" value={d.trial_days} onChange={(e) => set('trial_days', e.target.value)} inputMode="numeric" />}
        <TextField label="Ordem no site" value={d.sort_order} onChange={(e) => set('sort_order', e.target.value)} inputMode="numeric" />
      </div>
      <fieldset>
        <legend className="text-sm font-semibold text-graphite">Recursos liberados</legend>
        <div className="mt-2 flex flex-wrap gap-5">
          {(Object.keys(ENTITLEMENT_LABEL) as Entitlement[]).map((k) => (
            <CheckboxField
              key={k}
              label={ENTITLEMENT_LABEL[k]}
              checked={d.entitlements.includes(k)}
              onChange={(e) => set('entitlements', e.target.checked ? [...d.entitlements, k] : d.entitlements.filter((x) => x !== k))}
            />
          ))}
        </div>
        <div className="mt-3 max-w-xs">
          <TextField label="Links de compartilhamento ativos por moto" value={d.max_share_links}
            onChange={(e) => set('max_share_links', e.target.value)} inputMode="numeric" />
        </div>
      </fieldset>
      <TextAreaField label="Textos de benefícios no site (um por linha)" value={d.features} onChange={(e) => set('features', e.target.value)} rows={4} />
      {!isFree && (
        <TextAreaField label="Regras de cancelamento" value={d.cancellation_text} onChange={(e) => set('cancellation_text', e.target.value)} rows={3} maxLength={1000} />
      )}
      {!isFree && <CheckboxField label="Mostrar no site" checked={d.is_public} onChange={(e) => set('is_public', e.target.checked)} />}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={save.isPending}>Salvar</Button>
        <Button type="button" variant="secondary" onClick={onDone}>Cancelar</Button>
      </div>
    </form>
  )
}

function changedFields(curr: Record<string, unknown>, prev: Record<string, unknown> | undefined): string[] {
  if (!prev) return []
  return Object.entries(FIELD_LABEL).filter(([k]) => JSON.stringify(curr[k]) !== JSON.stringify(prev[k])).map(([, label]) => label)
}

function PlanHistory({ planId }: { planId: string }) {
  const history = useQuery({ queryKey: ['plan-history', planId], queryFn: () => adminPlanHistory(planId) })
  if (history.isLoading) return <p className="mt-3 text-sm text-muted" role="status">Carregando histórico…</p>
  if (history.isError) return <div className="mt-3"><Notice tone="error">Não foi possível carregar o histórico.</Notice></div>
  const rows = history.data ?? []
  return (
    <ol className="mt-3 space-y-2 border-l-2 border-rule pl-4 text-sm" aria-label="Histórico de alterações">
      {rows.map((h, i) => {
        const snap = h.snapshot as Record<string, unknown>
        const prev = rows[i + 1]?.snapshot as Record<string, unknown> | undefined
        const fields = changedFields(snap, prev)
        return (
          <li key={h.version}>
            <span className="font-semibold text-ink">Versão {h.version}</span>{' '}
            <span className="text-muted">
              {new Date(h.changed_at).toLocaleString('pt-BR')} · {h.changed_by_name}
            </span>
            <p className="text-graphite">
              {prev ? (fields.length ? `Alterou: ${fields.join(', ')}.` : 'Sem mudança visível.') : 'Criação do plano.'}{' '}
              {formatPlanPrice(Number(snap.price_cents ?? 0))}
            </p>
          </li>
        )
      })}
    </ol>
  )
}

/** Gestão comercial de planos (PRD 7.4). */
export function AdminPlansPage() {
  const qc = useQueryClient()
  const plans = useQuery({ queryKey: ['admin-plans'], queryFn: adminListPlans })
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [historyOf, setHistoryOf] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => adminSetPlanActive(id, active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-plans'] }),
    onError: (e) => setError(translateDbError(e as { code?: string; message?: string })),
  })

  return (
    <div>
      <Link to="/admin" className="text-sm text-muted underline underline-offset-4">Administração</Link>
      <h1 className="heading mt-2 text-3xl text-ink">Planos e preços</h1>
      <p className="mt-1 max-w-2xl text-muted">
        O que aparece no site e os limites de cada plano. Toda alteração fica registrada. Mudar o preço não altera assinaturas já contratadas.
      </p>
      <div className="mt-4">
        <Notice tone="info">A contratação pelo site só é liberada depois da integração com o Mercado Pago validada.</Notice>
      </div>
      {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
      {plans.isLoading && <p className="mt-6 text-muted" role="status">Carregando planos…</p>}
      {plans.isError && <div className="mt-6"><Notice tone="error">Não foi possível carregar os planos.</Notice></div>}

      <ul className="mt-6 divide-y divide-rule border-y border-rule">
        {plans.data?.map((p) => (
          <li key={p.id} className="py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <p className="font-semibold text-ink">
                  {p.name}{' '}
                  {!p.is_active && <span className="ml-1 rounded-doc bg-paper px-2 py-0.5 text-xs text-muted">Inativo</span>}
                  {p.is_active && !p.is_public && <span className="ml-1 rounded-doc bg-paper px-2 py-0.5 text-xs text-muted">Fora do site</span>}
                </p>
                <p className="text-sm text-muted">
                  {formatPlanPrice(p.price_cents)} · {PERIOD_LABEL[p.billing_period as BillingPeriod]} · {p.max_motorcycles}{' '}
                  {p.max_motorcycles === 1 ? 'moto' : 'motos'} · {formatQuota(p.storage_quota_mb)}
                  {p.trial_days > 0 ? ` · ${p.trial_days} dias grátis` : ''} · {p.max_share_links} links
                  {p.entitlements.length > 0 ? ` · ${p.entitlements.map((e) => ENTITLEMENT_LABEL[e as Entitlement] ?? e).join(', ')}` : ''} · versão {p.version}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => setEditing(p.id)}>Editar</Button>
                <Button size="sm" variant="quiet" onClick={() => setHistoryOf(historyOf === p.id ? null : p.id)} aria-expanded={historyOf === p.id}>
                  Histórico
                </Button>
                {p.kind !== 'free' && (
                  <Button size="sm" variant="quiet" loading={toggle.isPending && toggle.variables?.id === p.id}
                    onClick={() => toggle.mutate({ id: p.id, active: !p.is_active })}>
                    {p.is_active ? 'Desativar' : 'Ativar'}
                  </Button>
                )}
              </div>
            </div>
            {editing === p.id && <PlanForm plan={p} onDone={() => setEditing(null)} />}
            {historyOf === p.id && <PlanHistory planId={p.id} />}
          </li>
        ))}
      </ul>

      <div className="mt-6">
        {editing === 'new' ? (
          <PlanForm plan={null} onDone={() => setEditing(null)} />
        ) : (
          <Button variant="secondary" onClick={() => setEditing('new')}>Novo plano Premium</Button>
        )}
      </div>
    </div>
  )
}
