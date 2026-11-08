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
import { Card, WorkshopShell } from './shared/WorkshopShell'
import { formatCents } from './shared/rpc'
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

/** Visão geral da oficina (PRD 2.1 §3). Mostra só o que já existe; OS, agenda e recebimentos chegam nas próximas fases. */
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
  const d = dash.data
  const base = `/oficina/${orgId}`

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
        intro={<>{[shop.city, shop.state].filter(Boolean).join(', ') || 'Cidade não informada'} · {shop.role === 'responsible' ? 'você é o responsável' : 'você é da equipe'} · perfil público em{' '}
          <a href={`/oficinas/${shop.public_slug}`} target="_blank" rel="noreferrer" className="underline underline-offset-4">{window.location.host}/oficinas/{shop.public_slug}</a></>}
        actions={perms.manage_quotes && <>
          <ButtonLink to={`${base}/orcamentos/novo`}>Criar orçamento</ButtonLink>
          <ButtonLink to={`${base}/clientes/novo`} variant="secondary">Cadastrar cliente</ButtonLink>
        </>} />

      <div className="mt-6 flex flex-wrap items-end gap-2" role="group" aria-label="Período dos indicadores">
        {PERIODS.map((p) => (
          <button key={p.value} type="button" aria-pressed={period === p.value} onClick={() => setPeriod(p.value)}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${period === p.value ? 'border-ink bg-ink text-sheet' : 'border-rule text-ink hover:border-ink'}`}>
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

      {dash.isLoading && <p className="mt-4 text-muted" role="status">Carregando indicadores…</p>}
      {d && (
        <>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi to={`${base}/orcamentos?situacao=open`} label="Aguardando o cliente" value={d.awaiting} sub={`${formatCents(d.awaiting_cents)} em aberto`} />
            <Kpi to={`${base}/orcamentos?situacao=won`} label="Aprovados no período" value={d.approved_period} sub={`${formatCents(d.approved_cents_period)} autorizados`} />
            <Kpi to={`${base}/orcamentos?situacao=draft`} label="Rascunhos" value={d.drafts} sub={`${d.today_quotes} orçamento${d.today_quotes === 1 ? '' : 's'} criado${d.today_quotes === 1 ? '' : 's'} hoje`} />
            <Kpi to={`${base}/orcamentos?situacao=expired`} label="Vencidos ou sem resposta" value={d.expired_period + d.awaiting_no_view}
              sub={`${d.awaiting_no_view} sem abrir há 2 dias · ${d.expiring_soon} vence${d.expiring_soon === 1 ? '' : 'm'} até amanhã`} />
          </ul>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Money label="Valor orçado (enviado no período)" value={d.quoted_cents_period} />
            <Money label="Valor aprovado pelo cliente" value={d.approved_cents_period} />
            <div className="rounded-sheet border border-rule bg-sheet px-4 py-3">
              <p className="text-sm text-muted">Taxa de aprovação</p>
              <p className="heading text-2xl text-ink">
                {d.approved_period + d.rejected_period > 0 ? `${Math.round((d.approved_period / (d.approved_period + d.rejected_period)) * 100)}%` : '—'}
              </p>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">Valor aprovado não é dinheiro recebido. Recebimentos, ordens de serviço e agenda entram nas próximas fases do módulo.</p>
        </>
      )}

      <div className="mt-8 grid gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          {shop.can_request_access ? (
            <PlateSearchPanel organizationId={shop.organization_id} />
          ) : (
            <Notice tone="info" title="Pesquisa por placa">
              Seu acesso nesta oficina não inclui pesquisar placas e pedir acesso. Fale com o responsável se precisar.
            </Notice>
          )}
          {d && (
            <Card title="Cadastros">
              <ul className="grid grid-cols-3 gap-3 text-center">
                <li><Link to={`${base}/clientes`} className="block rounded-doc border border-rule px-2 py-3 hover:border-ink"><span className="heading block text-2xl text-ink">{d.customers}</span><span className="text-sm text-muted">clientes</span></Link></li>
                <li><Link to={`${base}/motos`} className="block rounded-doc border border-rule px-2 py-3 hover:border-ink"><span className="heading block text-2xl text-ink">{d.vehicles}</span><span className="text-sm text-muted">motos</span></Link></li>
                <li><Link to={`${base}/servicos`} className="block rounded-doc border border-rule px-2 py-3 hover:border-ink"><span className="heading block text-2xl text-ink">{d.services}</span><span className="text-sm text-muted">serviços</span></Link></li>
              </ul>
              {d.new_customers_period > 0 && <p className="mt-2 text-sm text-muted">{d.new_customers_period} cliente{d.new_customers_period === 1 ? ' novo' : 's novos'} no período.</p>}
            </Card>
          )}
        </div>
        <WorkshopAccessList organizationId={shop.organization_id} />
      </div>
    </div>
  )
}

function Kpi({ to, label, value, sub }: { to: string; label: string; value: number; sub: string }) {
  return (
    <li>
      <Link to={to} className="block h-full rounded-sheet border border-rule bg-sheet px-4 py-3 hover:border-ink/50">
        <p className="text-sm text-muted">{label}</p>
        <p className="heading text-3xl text-ink tabular-nums">{value}</p>
        <p className="text-xs text-muted">{sub}</p>
      </Link>
    </li>
  )
}

function Money({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-sheet border border-rule bg-sheet px-4 py-3">
      <p className="text-sm text-muted">{label}</p>
      <p className="heading text-2xl text-ink tabular-nums">{formatCents(value)}</p>
    </div>
  )
}
