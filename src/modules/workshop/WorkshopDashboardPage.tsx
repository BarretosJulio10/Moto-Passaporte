import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ButtonLink } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { PageHeader } from '@/components/AppLayout'
import { todayISO } from '@/core/shared/format'
import { PlateSearchPanel } from '@/modules/workshop_access/PlateSearchPanel'
import { WorkshopAccessList } from '@/modules/workshop_access/WorkshopAccessList'
import { fetchDashboard } from './quotes/api'
import { fetchOrdersSummary } from './service-orders/api'
import { WorkshopShell } from './shared/WorkshopShell'
import { formatCents } from './shared/rpc'
import { APPT_LABEL, agendaRange, fetchFinance, listAppointments } from './management/api'
import type { MyWorkshop } from './api'
import type { WorkshopPermissions } from './customers/api'

const PERIODS = [
  { value: 'today', label: 'Hoje' },
  { value: 'week', label: '7 dias' },
  { value: 'month', label: 'Este mês' },
  { value: 'custom', label: 'Período' },
] as const
type Period = (typeof PERIODS)[number]['value']

function rangeFor(p: Period): { from: string; to: string } {
  const to = todayISO()
  const d = new Date(`${to}T12:00:00`)
  if (p === 'today') return { from: to, to }
  if (p === 'week') { d.setDate(d.getDate() - 6); return { from: d.toISOString().slice(0, 10), to } }
  return { from: `${to.slice(0, 8)}01`, to }
}

/** Visão geral da oficina (PRD 2.1 §3): orçamentos, OS, agenda do dia e (com permissão) recebimentos. */
export function WorkshopDashboardPage() {
  return <WorkshopShell>{({ orgId, shop, perms }) => <Dashboard orgId={orgId} shop={shop} perms={perms} />}</WorkshopShell>
}

function Dashboard({ orgId, shop, perms }: { orgId: string; shop: MyWorkshop; perms: WorkshopPermissions }) {
  const location = useLocation()
  const created = (location.state as { created?: boolean } | null)?.created === true
  const [period, setPeriod] = useState<Period>('month')
  const [custom, setCustom] = useState(rangeFor('month'))
  const range = period === 'custom' ? custom : rangeFor(period)
  const dash = useQuery({ queryKey: ['ws-dashboard', orgId, range.from, range.to], queryFn: () => fetchDashboard(orgId, range.from, range.to) })
  const os = useQuery({ queryKey: ['ws-orders-summary', orgId, range.from, range.to], queryFn: () => fetchOrdersSummary(orgId, range.from, range.to) })
  const fin = useQuery({ queryKey: ['ws-finance', orgId, range.from, range.to], queryFn: () => fetchFinance(orgId, range.from, range.to), enabled: perms.manage_finance })
  const today = agendaRange('dia', new Date())
  const agenda = useQuery({ queryKey: ['ws-agenda', orgId, 'dia', today.from.toISOString()], queryFn: () => listAppointments(orgId, today.from, today.to) })
  const d = dash.data
  const s = os.data
  const f = fin.data
  const appts = (agenda.data ?? []).filter((a) => a.status !== 'canceled')
  const base = `/oficina/${orgId}`

  const approvalRate = d && d.approved_period + d.rejected_period > 0 ? Math.round((d.approved_period / (d.approved_period + d.rejected_period)) * 100) : null
  const place = [shop.city, shop.state].filter(Boolean).join(', ') || 'Cidade não informada'

  // "Precisa de atenção": só o que pede ação, do mais urgente ao menos urgente; itens zerados somem.
  const attention: Attention[] = []
  if (s && s.late > 0) attention.push({ tone: 'danger', to: `${base}/os?situacao=active`, label: `${s.late} OS atrasada${s.late === 1 ? '' : 's'}`, detail: 'Passaram do prazo combinado. Avise o cliente ou ajuste a previsão.' })
  if (s && s.ready_pickup > 0) attention.push({ tone: 'warn', to: `${base}/os?situacao=ready`, label: `${s.ready_pickup} moto${s.ready_pickup === 1 ? '' : 's'} pronta${s.ready_pickup === 1 ? '' : 's'} para retirada`, detail: 'Concluídas, esperando o cliente buscar.' })
  if (d && d.awaiting_no_view + d.expiring_soon > 0) attention.push({ tone: 'warn', to: `${base}/orcamentos?situacao=open`, label: `${d.awaiting_no_view + d.expiring_soon} orçamento${d.awaiting_no_view + d.expiring_soon === 1 ? '' : 's'} para cobrar`,
    detail: [d.awaiting_no_view > 0 && `${d.awaiting_no_view} sem abrir há 2 dias`, d.expiring_soon > 0 && `${d.expiring_soon} vence${d.expiring_soon === 1 ? '' : 'm'} até amanhã`].filter(Boolean).join(' · ') })
  if (f && f.receivables.length > 0) attention.push({ tone: 'info', to: `${base}/financeiro`, label: `${formatCents(f.pending_total_cents)} a receber`, detail: `${f.receivables.length} OS concluída${f.receivables.length === 1 ? '' : 's'} com saldo em aberto.` })
  if (d && d.drafts > 0) attention.push({ tone: 'info', to: `${base}/orcamentos?situacao=draft`, label: `${d.drafts} rascunho${d.drafts === 1 ? '' : 's'} de orçamento`, detail: 'Termine e envie ao cliente.' })
  if (s && s.awaiting_parts > 0) attention.push({ tone: 'info', to: `${base}/os?situacao=active`, label: `${s.awaiting_parts} OS aguardando peças`, detail: 'Confira pedidos e previsão de chegada.' })

  return (
    <div>
      {created && (
        <div className="mb-6 max-w-3xl">
          <Notice tone="success" title="Oficina cadastrada">
            Complete o perfil com especialidades, horário e descrição para os motociclistas encontrarem você.
          </Notice>
        </div>
      )}
      <PageHeader title="Visão geral"
        intro={<>{place} · {shop.role === 'responsible' ? 'você é o responsável' : 'você é da equipe'} ·{' '}
          <a href={`/oficinas/${shop.public_slug}`} target="_blank" rel="noreferrer" className="underline underline-offset-4">ver perfil público</a></>}
        actions={<>
          {perms.manage_quotes && <ButtonLink to={`${base}/orcamentos/novo`}>Criar orçamento</ButtonLink>}
          {perms.execute_orders && <ButtonLink to={`${base}/os/nova`} variant="secondary">Abrir OS</ButtonLink>}
          {perms.manage_quotes && <ButtonLink to={`${base}/clientes/novo`} variant="secondary">Cadastrar cliente</ButtonLink>}
        </>} />

      {/* 1. Agora: o que precisa de ação + o dia */}
      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-labelledby="atencao" className="min-w-0 rounded-sheet border border-rule bg-sheet p-4 sm:p-5">
          <h2 id="atencao" className="heading text-lg text-ink">Precisa de atenção</h2>
          {(dash.isLoading || os.isLoading) ? <p className="mt-3 text-sm text-muted" role="status">Carregando…</p>
            : attention.length === 0 ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-graphite">
                <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-success/15 text-success">✓</span>
                Tudo em dia: nada atrasado, nenhum orçamento esquecido.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-rule/70">
                {attention.map((it) => (
                  <li key={it.label}>
                    <Link to={it.to} className="group flex items-center gap-3 py-3">
                      <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${TONE_DOT[it.tone]}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-ink group-hover:underline">{it.label}</span>
                        <span className="block text-sm text-muted">{it.detail}</span>
                      </span>
                      <span aria-hidden="true" className="text-muted group-hover:text-ink">›</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
        </section>

        <section aria-labelledby="hoje" className="min-w-0 rounded-sheet border border-rule bg-sheet p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 id="hoje" className="heading text-lg text-ink">Hoje</h2>
            <Link to={`${base}/agenda`} className="text-sm font-semibold text-ink underline underline-offset-4">Abrir agenda</Link>
          </div>
          {s && (
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              <MiniStat to={`${base}/os?situacao=active`} label="em execução" value={s.in_progress} />
              <MiniStat to={`${base}/os?situacao=active`} label="em diagnóstico" value={s.awaiting_diagnosis} />
              <MiniStat to={`${base}/os?situacao=active`} label="aguardando peças" value={s.awaiting_parts} />
            </dl>
          )}
          {s && perms.execute_orders && s.mine > 0 && <p className="mt-2 text-sm text-graphite">Você tem {s.mine} OS designada{s.mine === 1 ? '' : 's'}.</p>}
          <h3 className="mt-4 text-sm font-semibold text-graphite">Horários marcados</h3>
          {agenda.isLoading ? <p className="mt-1 text-sm text-muted" role="status">Carregando…</p> : appts.length === 0 ? (
            <p className="mt-1 text-sm text-muted">Nenhum horário para hoje.</p>
          ) : (
            <ul className="mt-1 divide-y divide-rule/70 text-sm">
              {appts.slice(0, 6).map((a) => (
                <li key={a.id} className="flex items-baseline gap-3 py-2">
                  <span className="w-12 shrink-0 font-semibold tabular-nums text-ink">{new Date(a.starts_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="min-w-0 flex-1 truncate text-graphite">{a.customer_name ?? a.contact_name} · {a.service_description}</span>
                  <span className="shrink-0 text-xs text-muted">{APPT_LABEL[a.status]}</span>
                </li>
              ))}
              {appts.length > 6 && <li className="py-2 text-sm text-muted">e mais {appts.length - 6}…</li>}
            </ul>
          )}
        </section>
      </div>

      {/* 2. Resultado do período */}
      <section aria-labelledby="resultado" className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="resultado" className="heading text-lg text-ink">Resultado do período</h2>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Período dos indicadores">
            {PERIODS.map((p) => (
              <button key={p.value} type="button" aria-pressed={period === p.value} onClick={() => setPeriod(p.value)}
                className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${period === p.value ? 'border-ink bg-ink text-sheet' : 'border-rule bg-sheet text-ink hover:border-ink'}`}>
                {p.label}
              </button>
            ))}
            {period === 'custom' && (
              <span className="flex flex-wrap items-center gap-2 text-sm">
                <input type="date" aria-label="De" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })}
                  className="rounded-doc border border-rule bg-sheet px-2 py-1.5" />
                até
                <input type="date" aria-label="Até" value={custom.to} min={custom.from} max={todayISO()} onChange={(e) => setCustom({ ...custom, to: e.target.value })}
                  className="rounded-doc border border-rule bg-sheet px-2 py-1.5" />
              </span>
            )}
          </div>
        </div>
        {dash.isLoading && <p className="mt-3 text-muted" role="status">Carregando indicadores…</p>}
        {d && (
          <ul className="mt-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Kpi to={`${base}/orcamentos`} step="1" label="Orçado" value={formatCents(d.quoted_cents_period)}
              sub={`${d.awaiting} aguardando resposta (${formatCents(d.awaiting_cents)})`} />
            <Kpi to={`${base}/orcamentos?situacao=won`} step="2" label="Aprovado pelo cliente" value={formatCents(d.approved_cents_period)}
              sub={`${d.approved_period} orçamento${d.approved_period === 1 ? '' : 's'}${approvalRate !== null ? ` · ${approvalRate}% de aprovação` : ''}`} />
            {s && <Kpi to={`${base}/os?situacao=delivered`} step="3" label="Concluído" value={formatCents(s.completed_cents_period)}
              sub={`${s.completed_period} OS concluída${s.completed_period === 1 ? '' : 's'}${f ? ` · ${formatCents(f.discounts_cents)} em descontos` : ''}`} />}
            {f ? <Kpi to={`${base}/financeiro`} step="4" label="Recebido" value={formatCents(f.received_cents)} sub="registrado em Financeiro" strong />
              : s && <Kpi to={`${base}/os?situacao=active`} step="4" label="Em execução" value={formatCents(s.in_execution_cents)} sub={`${s.active} OS em andamento`} />}
          </ul>
        )}
        {d && (
          <p className="mt-2 text-xs text-muted">
            Do orçamento ao dinheiro no caixa: aprovado e concluído ainda não são recebimento; recebido é o que a equipe registrou em Financeiro.
          </p>
        )}
        {d && (
          <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-graphite">
            <Link to={`${base}/clientes`} className="hover:underline"><strong className="tabular-nums text-ink">{d.customers}</strong> clientes</Link>
            <Link to={`${base}/motos`} className="hover:underline"><strong className="tabular-nums text-ink">{d.vehicles}</strong> motos</Link>
            <Link to={`${base}/servicos`} className="hover:underline"><strong className="tabular-nums text-ink">{d.services}</strong> serviços no catálogo</Link>
            {d.new_customers_period > 0 && <span><strong className="tabular-nums text-ink">{d.new_customers_period}</strong> cliente{d.new_customers_period === 1 ? ' novo' : 's novos'} no período</span>}
          </p>
        )}
      </section>

      {/* 3. Motos de clientes no Passaporte */}
      <section aria-labelledby="passaporte" className="mt-8">
        <h2 id="passaporte" className="heading text-lg text-ink">Motos no Passaporte</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">Pesquise uma moto pela placa para pedir acesso ao histórico; as autorizadas pelo dono aparecem ao lado.</p>
        <div className="mt-3 grid grid-cols-1 gap-4 xl:grid-cols-2">
          {shop.can_request_access ? (
            <PlateSearchPanel organizationId={shop.organization_id} />
          ) : (
            <Notice tone="info" title="Pesquisa por placa">
              Seu acesso nesta oficina não inclui pesquisar placas e pedir acesso. Fale com o responsável se precisar.
            </Notice>
          )}
          <WorkshopAccessList organizationId={shop.organization_id} />
        </div>
      </section>
    </div>
  )
}

type Attention = { tone: 'danger' | 'warn' | 'info'; to: string; label: string; detail: string }
const TONE_DOT: Record<Attention['tone'], string> = { danger: 'bg-danger', warn: 'bg-amber-500', info: 'bg-ink/40' }

function MiniStat({ to, label, value }: { to: string; label: string; value: number }) {
  return (
    <Link to={to} className="rounded-doc border border-rule px-2 py-2 hover:border-ink/50">
      <dd className="heading text-xl tabular-nums text-ink">{value}</dd>
      <dt className="text-xs text-muted">{label}</dt>
    </Link>
  )
}

function Kpi({ to, label, value, sub, step, strong }: { to: string; label: string; value: number | string; sub: string; step?: string; strong?: boolean }) {
  return (
    <li>
      <Link to={to} className={`block h-full rounded-sheet border bg-sheet px-4 py-3 hover:border-ink/50 ${strong ? 'border-ink/40' : 'border-rule'}`}>
        <p className="flex items-center gap-2 text-sm text-muted">
          {step && <span aria-hidden="true" className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-paper text-[0.7rem] font-bold text-graphite">{step}</span>}
          {label}
        </p>
        <p className="heading mt-1 text-lg tabular-nums text-ink sm:text-2xl">{value}</p>
        <p className="text-xs text-muted">{sub}</p>
      </Link>
    </li>
  )
}
