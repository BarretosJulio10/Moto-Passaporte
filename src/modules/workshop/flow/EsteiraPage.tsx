import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ButtonLink } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { PageHeader } from '@/components/AppLayout'
import { listOrders } from '../service-orders/api'
import { listQuotes } from '../quotes/api'
import { agendaRange, fetchFinance, listAppointments } from '../management/api'
import { WorkshopShell, type WorkshopContext } from '../shared/WorkshopShell'
import { formatCents } from '../shared/rpc'
import { buildFlow, isStale, matches, STAGES, waitLabel, type FlowCard, type OrderRowFlow, type StageKey } from './stages'

const TOUCH_KEY = 'mp-esteira-toque'
const REFRESH_MS = 20_000

const BADGE: Record<FlowCard['badges'][number]['tone'], string> = {
  ok: 'bg-ok/15 text-ok',
  warn: 'bg-brass/20 text-graphite',
  danger: 'bg-danger/15 text-danger',
  info: 'bg-ink/10 text-ink',
}

/** Busca OS, orçamentos e (com permissão) o que falta receber, e monta a esteira. Atualiza sozinho. */
export function useFlow({ orgId, perms }: Pick<WorkshopContext, 'orgId' | 'perms'>) {
  const orders = useQuery({ queryKey: ['flow-orders', orgId], queryFn: () => listOrders(orgId) as Promise<OrderRowFlow[]>, refetchInterval: REFRESH_MS })
  const quotes = useQuery({ queryKey: ['flow-quotes', orgId], queryFn: () => listQuotes(orgId), refetchInterval: REFRESH_MS })
  const today = new Date().toISOString().slice(0, 10)
  const finance = useQuery({
    queryKey: ['flow-finance', orgId], enabled: perms.manage_finance, refetchInterval: REFRESH_MS,
    queryFn: () => fetchFinance(orgId, `${today.slice(0, 8)}01`, today),
  })
  const cards = useMemo(
    () => buildFlow(orgId, orders.data ?? [], quotes.data ?? [], perms.manage_finance ? finance.data?.receivables ?? [] : null),
    [orgId, orders.data, quotes.data, finance.data, perms.manage_finance],
  )
  return {
    cards,
    loading: orders.isLoading || quotes.isLoading,
    error: orders.isError && quotes.isError,
    pendingTotal: perms.manage_finance ? finance.data?.pending_total_cents ?? null : null,
  }
}

function useTouchMode(): [boolean, (v: boolean) => void] {
  const [on, setOn] = useState(() => { try { return localStorage.getItem(TOUCH_KEY) === '1' } catch { return false } })
  const set = (v: boolean) => { try { localStorage.setItem(TOUCH_KEY, v ? '1' : '0') } catch { /* sem armazenamento */ } setOn(v) }
  useEffect(() => {
    if (!on) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') set(false) }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [on])
  return [on, set]
}

/** /oficina/:orgId — Esteira: a moto anda da Entrada até Entregue, com o próximo passo em um toque. */
export function EsteiraPage() {
  return <WorkshopShell>{(ctx) => <Esteira {...ctx} />}</WorkshopShell>
}

function Esteira({ orgId, shop, perms }: WorkshopContext) {
  const flow = useFlow({ orgId, perms })
  const [touch, setTouch] = useTouchMode()
  const [term, setTerm] = useState('')
  const [tab, setTab] = useState<StageKey>('entrada')
  const day = agendaRange('dia', new Date())
  const agenda = useQuery({ queryKey: ['ws-agenda', orgId, 'dia', day.from.toISOString()], queryFn: () => listAppointments(orgId, day.from, day.to), refetchInterval: 60_000 })
  const arriving = (agenda.data ?? []).filter((a) => a.status === 'requested' || a.status === 'confirmed' || a.status === 'awaiting_arrival')
  const base = `/oficina/${orgId}`
  const cards = flow.cards.filter((c) => matches(c, term))
  const byStage = (k: StageKey) => cards.filter((c) => c.stage === k)
  const count = (k: StageKey) => flow.cards.filter((c) => c.stage === k).length

  const actions = (
    <>
      {perms.manage_quotes && <ButtonLink to={`${base}/entrada/nova`} className={touch ? 'h-14 text-lg' : ''}>+ Nova entrada</ButtonLink>}
      {perms.manage_quotes && <ButtonLink to={`${base}/orcamentos/novo`} variant="secondary" className={touch ? 'h-14 text-lg' : ''}>Orçamento sem a moto</ButtonLink>}
      {perms.execute_orders && <ButtonLink to={`${base}/os/nova`} variant="secondary" className={touch ? 'h-14 text-lg' : ''}>Abrir OS direto</ButtonLink>}
      <button type="button" onClick={() => setTouch(!touch)} aria-pressed={touch}
        className={`rounded-doc border px-4 font-semibold ${touch ? 'h-14 border-ink bg-ink text-sheet' : 'h-11 border-rule bg-sheet text-ink hover:border-ink'}`}>
        {touch ? 'Sair do modo toque' : 'Modo toque'}
      </button>
    </>
  )

  const body = (
    <>
      <div className={`flex flex-wrap items-center gap-3 ${touch ? 'mt-2' : 'mt-5'}`}>
        <label className="min-w-0 flex-1">
          <span className="sr-only">Buscar por placa, cliente ou número</span>
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Buscar placa, cliente ou nº"
            autoCapitalize="characters" autoComplete="off"
            className={`w-full rounded-doc border border-rule bg-sheet px-4 ${touch ? 'h-14 text-lg' : 'h-11'}`} />
        </label>
        <dl className="flex flex-wrap gap-2 text-sm">
          <Stat label="na oficina" value={flow.cards.filter((c) => c.kind === 'order' && c.stage !== 'entregue').length} />
          <Stat label="no caixa" value={count('caixa')} />
          <Stat label="entregues hoje" value={count('entregue')} />
          {flow.pendingTotal !== null && <Stat label="a receber" value={formatCents(flow.pendingTotal)} />}
        </dl>
      </div>

      {arriving.length > 0 && (
        <p className={`mt-3 rounded-doc border border-rule bg-sheet px-4 py-2 text-graphite ${touch ? 'text-base' : 'text-sm'}`}>
          <strong className="text-ink">Chegam hoje:</strong>{' '}
          {arriving.slice(0, 5).map((a) => `${new Date(a.starts_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} ${a.customer_name ?? a.contact_name}`).join(' · ')}
          {arriving.length > 5 ? ` e mais ${arriving.length - 5}` : ''} ·{' '}
          <Link to={`${base}/agenda`} className="font-semibold underline underline-offset-4">agenda</Link>
        </p>
      )}

      {flow.error && <div className="mt-4"><Notice tone="error">Não foi possível carregar a esteira. Verifique a internet.</Notice></div>}
      {flow.loading ? <p className="mt-6 text-muted" role="status">Carregando a esteira…</p> : (
        <>
          {/* Celular: uma etapa por vez, em abas */}
          <div className={touch ? 'hidden' : 'mt-5 lg:hidden'}>
            <div className="-mx-1 overflow-x-auto" role="tablist" aria-label="Etapas">
              <div className="flex min-w-max gap-1.5 px-1">
                {STAGES.map((s) => (
                  <button key={s.key} type="button" role="tab" aria-selected={tab === s.key} onClick={() => setTab(s.key)}
                    className={`rounded-full border px-3 py-2 text-sm font-semibold ${tab === s.key ? 'border-ink bg-ink text-sheet' : 'border-rule bg-sheet text-ink'}`}>
                    {s.label} <span className="tabular-nums opacity-70">{byStage(s.key).length}</span>
                  </button>
                ))}
              </div>
            </div>
            <ul className="mt-3 space-y-3">
              {byStage(tab).map((c) => <li key={`${c.kind}-${c.id}`}><FlowCardView card={c} touch={false} /></li>)}
              {byStage(tab).length === 0 && <li className="rounded-doc border border-dashed border-rule p-6 text-center text-sm text-muted">Nada nesta etapa.</li>}
            </ul>
          </div>
          {/* Computador e modo toque: as 7 colunas lado a lado */}
          <div className={`${touch ? 'mt-4' : 'mt-5 hidden lg:block'} -mx-1 overflow-x-auto pb-2`}>
            <div className="flex min-w-max gap-3 px-1">
              {STAGES.map((s, i) => (
                <section key={s.key} aria-label={s.label} className={`${touch ? 'w-80' : 'w-64'} shrink-0 rounded-sheet border border-rule bg-paper/60 p-2`}>
                  <header className="flex items-baseline justify-between gap-2 px-1 pb-2">
                    <h2 className={`font-bold text-ink ${touch ? 'text-lg' : ''}`}><span className="text-muted">{i + 1}.</span> {s.label}</h2>
                    <span className="rounded-full bg-sheet px-2 text-sm font-semibold tabular-nums text-ink">{byStage(s.key).length}</span>
                  </header>
                  <p className="px-1 pb-2 text-xs text-muted">{s.hint}</p>
                  <ul className="space-y-2">
                    {byStage(s.key).map((c) => <li key={`${c.kind}-${c.id}`}><FlowCardView card={c} touch={touch} /></li>)}
                  </ul>
                  {byStage(s.key).length === 0 && <p className="px-1 py-4 text-center text-xs text-muted">—</p>}
                </section>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  )

  if (touch) {
    return (
      <div className="fixed inset-0 z-40 overflow-y-auto bg-paper px-4 pb-8 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-muted">Esteira</p>
            <p className="heading text-2xl text-ink">{shop.business_name}</p>
          </div>
          <div className="flex flex-wrap gap-2">{actions}</div>
        </div>
        {body}
      </div>
    )
  }
  return (
    <div>
      <PageHeader title="Esteira" intro="Cada moto na etapa em que está, da entrada até a entrega. Toque no botão do cartão para o próximo passo." actions={actions} />
      {body}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-doc border border-rule bg-sheet px-3 py-1.5">
      <dt className="sr-only">{label}</dt>
      <dd><strong className="tabular-nums text-ink">{value}</strong> <span className="text-muted">{label}</span></dd>
    </div>
  )
}

export function FlowCardView({ card: c, touch }: { card: FlowCard; touch: boolean }) {
  const stale = isStale(c)
  return (
    <article className={`rounded-doc border bg-sheet ${stale ? 'border-brass' : 'border-rule'} ${touch ? 'p-4' : 'p-3'}`}>
      <Link to={c.href} className="block">
        <div className="flex items-start justify-between gap-2">
          <p className={`font-mono font-bold tracking-wider text-ink ${touch ? 'text-2xl' : 'text-lg'}`}>{c.plate ?? 'SEM PLACA'}</p>
          <p className="shrink-0 text-xs text-muted">{c.kind === 'order' ? `OS ${c.number}` : `Orç. ${c.number}`}</p>
        </div>
        <p className={`truncate text-graphite ${touch ? 'text-base' : 'text-sm'}`}>{c.vehicle}</p>
        <p className={`truncate font-semibold text-ink ${touch ? 'text-base' : 'text-sm'}`}>{c.customer}</p>
        <p className="mt-1 text-xs text-muted">
          {c.kind === 'order' ? 'aberta' : c.badges.some((b) => b.label === 'Rascunho') ? 'criado' : 'enviado'} {waitLabel(c.since)}
          {c.mechanic ? ` · ${c.mechanic}` : ''}
          {c.pendingCents ? ` · ${formatCents(c.pendingCents)} a receber` : ''}
        </p>
        {(c.badges.length > 0 || stale) && (
          <p className="mt-2 flex flex-wrap gap-1">
            {stale && <span className="rounded-full bg-brass/20 px-2 py-0.5 text-xs font-semibold text-graphite">Parada há muito tempo</span>}
            {c.badges.map((b) => <span key={b.label} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE[b.tone]}`}>{b.label}</span>)}
          </p>
        )}
      </Link>
      {c.stage !== 'entregue' && (
        <Link to={c.href}
          className={`mt-3 flex w-full items-center justify-center rounded-doc bg-ink font-bold text-sheet hover:opacity-90 ${touch ? 'h-14 text-lg' : 'h-10 text-sm'}`}>
          {c.action} ›
        </Link>
      )}
    </article>
  )
}
