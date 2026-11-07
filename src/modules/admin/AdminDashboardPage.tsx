import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getSupabase } from '@/lib/supabase'
import { Notice } from '@/components/Notice'
import { formatBytes } from '@/modules/attachments/files'
import { formatPlanPrice } from '@/modules/plans/api'
import { fetchJobStatus, fetchMetrics, JOB_LABEL, JOB_STATUS_LABEL, type Metrics } from './adminApi'
import { ACTION_LABEL, ENTITY_LABEL } from './auditLabels'

type Group = { title: string; items: { label: string; value: (m: Metrics) => string; alert?: (m: Metrics) => boolean; to?: string }[] }

const n = (v: number) => v.toLocaleString('pt-BR')

const GROUPS: Group[] = [
  {
    title: 'Uso',
    items: [
      { label: 'Usuários', value: (m) => n(m.users_total), to: '/admin/usuarios' },
      { label: 'Novos (7 dias)', value: (m) => n(m.users_new_7d) },
      { label: 'Motos', value: (m) => n(m.motorcycles_total) },
      { label: 'Oficinas ativas', value: (m) => `${n(m.workshops_active)} de ${n(m.workshops_total)}`, to: '/admin/oficinas' },
      { label: 'Registros (30 dias)', value: (m) => n(m.records_30d) },
      { label: 'Relatórios (30 dias)', value: (m) => n(m.reports_30d) },
    ],
  },
  {
    title: 'Assinaturas e receita',
    items: [
      { label: 'Assinaturas ativas', value: (m) => n(m.subscriptions_active), to: '/admin/assinaturas' },
      { label: 'Em atraso', value: (m) => n(m.subscriptions_past_due), alert: (m) => m.subscriptions_past_due > 0 },
      { label: 'Canceladas (ainda no período)', value: (m) => n(m.subscriptions_canceling) },
      { label: 'Receita mensal recorrente', value: (m) => formatPlanPrice(m.mrr_cents) },
      { label: 'Pagamentos pendentes', value: (m) => n(m.payments_pending) },
      { label: 'Recusados (30 dias)', value: (m) => n(m.payments_rejected_30d), alert: (m) => m.payments_rejected_30d > 0 },
    ],
  },
  {
    title: 'Pendências',
    items: [
      { label: 'Verificações de placa', value: (m) => n(m.claims_pending), alert: (m) => m.claims_pending > 0, to: '/admin/verificacoes' },
      { label: 'Oficinas não verificadas', value: (m) => n(m.workshops_unverified), to: '/admin/oficinas' },
      { label: 'Contas suspensas/bloqueadas', value: (m) => n(m.users_restricted) },
      { label: 'Faturas com falha', value: (m) => n(m.invoices_failed), alert: (m) => m.invoices_failed > 0 },
      { label: 'Transferências em aberto', value: (m) => n(m.transfers_pending) },
      { label: 'Pedidos de acesso de oficinas', value: (m) => n(m.access_requests_pending) },
    ],
  },
  {
    title: 'Armazenamento',
    items: [
      { label: 'Espaço usado', value: (m) => formatBytes(m.storage_bytes), to: '/admin/armazenamento' },
      { label: 'Arquivos', value: (m) => n(m.files_total) },
    ],
  },
]

/** Painel administrativo (PRD 7.1). */
export function AdminDashboardPage() {
  const metrics = useQuery({ queryKey: ['admin-metrics'], queryFn: fetchMetrics })
  const jobs = useQuery({ queryKey: ['admin-jobs'], queryFn: fetchJobStatus })

  const events = useQuery({
    queryKey: ['admin-audit'],
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('audit_logs')
        .select('id, entity_type, action, created_at, actor_user_id')
        .order('created_at', { ascending: false })
        .limit(15)
      if (error) throw error
      return data
    },
  })

  return (
    <div>
      <h1 className="heading text-3xl text-ink">Administração</h1>
      <p className="mt-1 text-muted">Visão geral da plataforma. Dados privados só aparecem na consulta de uma conta, com motivo registrado.</p>

      {metrics.isError && <div className="mt-6"><Notice tone="error">Não foi possível carregar os indicadores.</Notice></div>}
      {metrics.data?.billing_environment === 'test' && (
        <p className="mt-4 text-sm text-muted">Pagamentos em ambiente de teste: a receita mostrada considera só assinaturas de produção.</p>
      )}
      {GROUPS.map((g) => (
        <section key={g.title} className="mt-8" aria-label={g.title}>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">{g.title}</h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-rule py-5 sm:grid-cols-3 lg:grid-cols-6">
            {g.items.map((it) => {
              const m = metrics.data
              const alert = m && it.alert?.(m)
              const value = m ? it.value(m) : '…'
              return (
                <div key={it.label}>
                  <dt className="text-sm text-muted">{it.label}</dt>
                  <dd className={`heading mt-1 text-2xl ${alert ? 'text-danger' : 'text-ink'}`}>
                    {it.to && m ? <Link to={it.to} className="underline-offset-4 hover:underline">{value}</Link> : value}
                  </dd>
                </div>
              )
            })}
          </dl>
        </section>
      ))}

      <section className="mt-10" aria-labelledby="jobs-title">
        <h2 id="jobs-title" className="heading text-2xl text-ink">Rotinas automáticas</h2>
        {jobs.isError && <div className="mt-4"><Notice tone="error">Não foi possível carregar as rotinas.</Notice></div>}
        {jobs.data && (
          <ul className="mt-4 divide-y divide-rule border-y border-rule text-sm">
            {jobs.data.map((j) => {
              const label = JOB_LABEL[j.job] ?? { name: j.job, every: '' }
              const bad = j.last_status === 'failed' || j.failures_24h > 0
              return (
                <li key={j.job} className="grid gap-1 py-3 sm:grid-cols-[1fr_auto] sm:gap-4">
                  <span>
                    <span className="font-semibold text-ink">{label.name}</span>
                    <span className="block text-muted">
                      {label.every}
                      {j.last_detail ? ` · ${j.last_detail}` : ''}
                    </span>
                  </span>
                  <span className={bad ? 'font-semibold text-danger' : 'text-graphite'}>
                    {j.last_status
                      ? `${JOB_STATUS_LABEL[j.last_status] ?? j.last_status} em ${new Date(j.last_started_at ?? '').toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`
                      : 'Ainda não executada'}
                    {j.failures_24h > 0 && ` · ${j.failures_24h} falha(s) em 24 h`}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="mt-10" aria-labelledby="audit-title">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="audit-title" className="heading text-2xl text-ink">Atividade recente</h2>
          <Link to="/admin/auditoria" className="text-sm font-semibold text-ink underline underline-offset-4">Ver toda a auditoria</Link>
        </div>
        {events.isError && <div className="mt-4"><Notice tone="error">Não foi possível carregar a auditoria.</Notice></div>}
        {events.data && events.data.length === 0 && <p className="mt-4 text-muted">Nenhuma atividade registrada ainda.</p>}
        {events.data && events.data.length > 0 && (
          <ol className="mt-4 divide-y divide-rule border-y border-rule text-sm">
            {events.data.map((e) => (
              <li key={e.id} className="grid gap-1 py-3 sm:grid-cols-[11rem_1fr]">
                <span className="text-muted">{new Date(e.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                <span className="text-graphite">
                  {e.actor_user_id ? 'Usuário' : 'Sistema'} {ACTION_LABEL[e.action] ?? e.action} {ENTITY_LABEL[e.entity_type] ?? e.entity_type}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="mt-10" aria-labelledby="tools-title">
        <h2 id="tools-title" className="heading text-2xl text-ink">Ferramentas</h2>
        <ul className="mt-4 divide-y divide-rule border-y border-rule">
          <li>
            <Link to="/admin/usuarios" className="block py-3 hover:bg-sheet focus-visible:bg-sheet">
              <span className="font-semibold text-ink">Usuários</span>
              <span className="block text-sm text-muted">Buscar contas, ver dados com motivo registrado, suspender, bloquear ou reativar.</span>
            </Link>
          </li>
          <li>
            <Link to="/admin/oficinas" className="block py-3 hover:bg-sheet focus-visible:bg-sheet">
              <span className="font-semibold text-ink">Oficinas</span>
              <span className="block text-sm text-muted">Verificar cadastros, suspender, bloquear ou reativar, com motivo registrado.</span>
            </Link>
          </li>
          <li>
            <Link to="/admin/verificacoes" className="block py-3 hover:bg-sheet focus-visible:bg-sheet">
              <span className="font-semibold text-ink">Verificação de placas</span>
              <span className="block text-sm text-muted">Pedidos de quem tentou cadastrar uma placa que já tem passaporte.</span>
            </Link>
          </li>
          <li>
            <Link to="/admin/armazenamento" className="block py-3 hover:bg-sheet focus-visible:bg-sheet">
              <span className="font-semibold text-ink">Armazenamento</span>
              <span className="block text-sm text-muted">Consumo por categoria, conta, moto e oficina; alertas de limite; limpeza de envios sem registro.</span>
            </Link>
          </li>
          <li>
            <Link to="/admin/auditoria" className="block py-3 hover:bg-sheet focus-visible:bg-sheet">
              <span className="font-semibold text-ink">Auditoria</span>
              <span className="block text-sm text-muted">Buscar quem fez o quê e quando, com filtros; conteúdo dos eventos com motivo.</span>
            </Link>
          </li>
          <li>
            <Link to="/admin/configuracoes" className="block py-3 hover:bg-sheet focus-visible:bg-sheet">
              <span className="font-semibold text-ink">Configurações</span>
              <span className="block text-sm text-muted">Contatos de suporte, limites e regras da plataforma.</span>
            </Link>
          </li>
          <li>
            <Link to="/admin/planos" className="block py-3 hover:bg-sheet focus-visible:bg-sheet">
              <span className="font-semibold text-ink">Planos e preços</span>
              <span className="block text-sm text-muted">Preço, periodicidade, limites, benefícios e visibilidade no site, com histórico.</span>
            </Link>
          </li>
          <li>
            <Link to="/admin/pagamentos" className="block py-3 hover:bg-sheet focus-visible:bg-sheet">
              <span className="font-semibold text-ink">Pagamentos (Mercado Pago)</span>
              <span className="block text-sm text-muted">Conta que recebe as assinaturas: token, chave pública, ambiente e teste de conexão.</span>
            </Link>
          </li>
        </ul>
        <p className="mt-3 text-muted">
          Gestão de armazenamento chega na próxima etapa.
        </p>
      </section>
    </div>
  )
}
