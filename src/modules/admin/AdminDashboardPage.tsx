import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getSupabase } from '@/lib/supabase'
import { Notice } from '@/components/Notice'

type Metric = { label: string; value: number | null }

async function count(table: 'profiles' | 'motorcycles' | 'organizations' | 'audit_logs', since?: string) {
  let q = getSupabase().from(table).select('*', { count: 'exact', head: true })
  if (since) q = q.gte('created_at', since)
  const { count: c, error } = await q
  if (error) throw error
  return c ?? 0
}

const ACTION_LABEL: Record<string, string> = {
  insert: 'criou',
  update: 'alterou',
  delete: 'removeu',
  chassis_changed: 'alterou o chassi de',
  duplicate_plate_claim: 'pediu verificação de placa em',
}

const ENTITY_LABEL: Record<string, string> = {
  motorcycles: 'moto',
  motorcycle_plates: 'placa',
  motorcycle_ownerships: 'titularidade',
  motorcycle_private: 'moto',
  mileage_records: 'leitura de km',
  motorcycle_claim_requests: 'pedido de verificação',
  organizations: 'organização',
  organization_members: 'membro de oficina',
  workshops: 'perfil de oficina',
  user_roles: 'papel de usuário',
  system_settings: 'configuração',
  subscription_plans: 'plano',
  payment_gateway_settings: 'pagamentos',
}

/** Painel administrativo base (PRD 7.1). Indicadores financeiros entram com a Fase 5. */
export function AdminDashboardPage() {
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()

  const metrics = useQuery({
    queryKey: ['admin-metrics'],
    queryFn: async (): Promise<Metric[]> => {
      const [users, newUsers, motos, newMotos, shops] = await Promise.all([
        count('profiles'),
        count('profiles', weekAgo),
        count('motorcycles'),
        count('motorcycles', weekAgo),
        count('organizations'),
      ])
      return [
        { label: 'Usuários', value: users },
        { label: 'Novos usuários (7 dias)', value: newUsers },
        { label: 'Motocicletas', value: motos },
        { label: 'Novas motos (7 dias)', value: newMotos },
        { label: 'Oficinas', value: shops },
      ]
    },
  })

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
      <p className="mt-1 text-muted">Visão geral da plataforma. Dados privados (placas, chassis) não aparecem aqui.</p>

      {metrics.isError && <div className="mt-6"><Notice tone="error">Não foi possível carregar os indicadores.</Notice></div>}
      <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-6 border-y border-rule py-6 sm:grid-cols-5">
        {(metrics.data ?? [{ label: 'Usuários', value: null }, { label: 'Novos usuários (7 dias)', value: null }, { label: 'Motocicletas', value: null }, { label: 'Novas motos (7 dias)', value: null }, { label: 'Oficinas', value: null }]).map((m) => (
          <div key={m.label}>
            <dt className="text-sm text-muted">{m.label}</dt>
            <dd className="heading mt-1 text-3xl text-ink">{m.value === null ? '…' : m.value.toLocaleString('pt-BR')}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-10" aria-labelledby="audit-title">
        <h2 id="audit-title" className="heading text-2xl text-ink">Atividade recente</h2>
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
          Gestão de usuários e oficinas, verificação de placa, pagamentos e armazenamento chegam nas próximas etapas.
        </p>
      </section>
    </div>
  )
}
