import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/core/auth/AuthProvider'
import { Notice } from '@/components/Notice'
import { ButtonLink } from '@/components/Button'
import { formatKm, formatPlate } from '@/core/shared/format'
import { fetchMyMotorcycles } from '@/modules/motorcycles/api'
import { fetchPendingRequests } from '@/modules/workshop_access/api'
import { PendingRequestsNotice } from '@/modules/workshop_access/OwnerAccessSection'
import { IncomingTransfers, PreviousMotorcycles } from '@/modules/transfers/IncomingTransfers'
import { PlanSummary } from '@/modules/plans/MyPlanPage'
import { PushPrompt } from '@/modules/notifications/PushPrompt'
import { DueReminders } from '@/modules/reminders/DueReminders'
import { MyClaims, OwnershipNotices } from '@/modules/claims/MyClaims'
import { PageHeader } from '@/components/AppLayout'
import { daysSince, fetchCare } from '@/modules/motorcycles/careApi'

export function DashboardPage() {
  const { user } = useAuth()
  const firstName = ((user?.user_metadata?.full_name as string | undefined) ?? '').split(' ')[0]

  const motorcycles = useQuery({
    queryKey: ['my-motorcycles', user?.id],
    enabled: Boolean(user),
    queryFn: fetchMyMotorcycles,
  })

  const pending = useQuery({ queryKey: ['pending-access', user?.id], enabled: Boolean(user), queryFn: fetchPendingRequests })

  const hasMotos = Boolean(motorcycles.data && motorcycles.data.length > 0)

  return (
    <div>
      <PageHeader
        title={firstName ? `Olá, ${firstName}` : 'Seu painel'}
        intro={<PlanSummary />}
        actions={hasMotos ? <ButtonLink to="/painel/motos/nova" variant="secondary">Cadastrar moto</ButtonLink> : undefined}
      />

      <div className="mt-8 grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_24rem] 2xl:grid-cols-[minmax(0,1fr)_28rem]">
        <section aria-labelledby="motos-title" className="min-w-0">
          <h2 id="motos-title" className="sr-only">Minhas motos</h2>
          {pending.data && pending.data.length > 0 && (
            <div className="mb-6">
              <PendingRequestsNotice requests={pending.data} />
            </div>
          )}
          <IncomingTransfers />
          {hasMotos && <PushPrompt />}
          <div className="mt-6">
            {motorcycles.isLoading && <p className="text-muted" role="status">Carregando suas motos…</p>}
            {motorcycles.isError && (
              <Notice tone="error">Não foi possível carregar suas motos. Recarregue a página para tentar de novo.</Notice>
            )}
            {motorcycles.data && motorcycles.data.length === 0 && (
              <div className="rounded-sheet border border-dashed border-rule bg-sheet p-8 sm:p-12">
                <p className="heading text-2xl text-ink">Comece pelo passaporte da sua moto</p>
                <p className="mt-2 max-w-xl text-muted">
                  Cadastre a moto para guardar manutenções, notas e quilometragem, receber o check-up semanal e mostrar o histórico a quem for comprar.
                </p>
                <ButtonLink to="/painel/motos/nova" className="mt-6">Cadastrar moto</ButtonLink>
              </div>
            )}
            {hasMotos && (
              <ul className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
                {motorcycles.data!.map((m) => (
                  <li key={m.id}><MotoCard moto={m} /></li>
                ))}
              </ul>
            )}
          </div>
          <div className="mt-10 empty:hidden">
            <PreviousMotorcycles />
          </div>
        </section>

        <aside className="flex min-w-0 flex-col gap-6" aria-label="Avisos e pendências">
          <DueReminders />
          <OwnershipNotices />
          <MyClaims />
          <QuickLinks />
        </aside>
      </div>
    </div>
  )
}

type Moto = Awaited<ReturnType<typeof fetchMyMotorcycles>>[number]

/** Cartão da moto com o check-up resumido (km, óleo, corrente) e atalhos. */
function MotoCard({ moto: m }: { moto: Moto }) {
  const care = useQuery({ queryKey: ['care', m.id], queryFn: () => fetchCare(m.id ?? ''), enabled: Boolean(m.id), staleTime: 60_000 })
  const c = care.data
  const days = c ? daysSince(c.km_updated_at) : null
  const oil = c?.oil
  const chips: { text: string; tone: 'ok' | 'warn' | 'danger' }[] = []
  if (c) {
    if (days === null || days >= 6) chips.push({ text: days === null ? 'Informe o km' : `Km de ${days} dias atrás`, tone: 'warn' })
    if (oil && oil.enabled) {
      if (!oil.configured) chips.push({ text: 'Defina a troca de óleo', tone: 'warn' })
      else if (oil.status === 'due') chips.push({ text: 'Óleo vencido', tone: 'danger' })
      else if (oil.status === 'soon') chips.push({ text: `Óleo em ${formatKm(oil.km_left)}`, tone: 'warn' })
      else if (oil.km_left !== null) chips.push({ text: `Óleo em ${formatKm(oil.km_left)}`, tone: 'ok' })
    }
    if (c.chain.enabled && c.chain.due) chips.push({ text: 'Conferir corrente', tone: 'warn' })
  }
  const tone = { ok: 'bg-paper text-graphite', warn: 'bg-brass/15 text-ink', danger: 'bg-danger text-white' }
  return (
    <article className="flex h-full flex-col rounded-sheet border border-rule bg-sheet p-5 transition hover:border-ink/40">
      <Link to={`/painel/motos/${m.id}`} className="group">
        <p className="heading text-xl text-ink group-hover:underline group-hover:underline-offset-4">{[m.brand, m.model, m.version].filter(Boolean).join(' ')}</p>
        <p className="mt-0.5 text-sm text-muted">
          {m.manufacturing_year}{m.model_year ? `/${m.model_year}` : ''} · placa {formatPlate(m.current_plate)}
        </p>
      </Link>
      <p className="mt-4 text-3xl font-semibold tabular-nums text-ink">{formatKm(m.latest_mileage)}</p>
      <p className="text-xs text-muted">última leitura{days !== null ? (days === 0 ? ' hoje' : days === 1 ? ' ontem' : ` há ${days} dias`) : ''}</p>
      {chips.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Check-up">
          {chips.map((ch) => <li key={ch.text} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone[ch.tone]}`}>{ch.text}</li>)}
        </ul>
      )}
      <div className="mt-auto flex flex-wrap gap-2 pt-5">
        <ButtonLink to={`/painel/motos/${m.id}/checkup`} size="sm">Check-up</ButtonLink>
        <ButtonLink to={`/painel/motos/${m.id}/historico/novo`} size="sm" variant="secondary">Registrar serviço</ButtonLink>
        <ButtonLink to={`/painel/motos/${m.id}`} size="sm" variant="quiet">Abrir</ButtonLink>
      </div>
    </article>
  )
}

function QuickLinks() {
  const links: [string, string, string][] = [
    ['/painel/notificacoes', 'Notificações e avisos no celular', 'Ative os avisos e escolha o que receber.'],
    ['/painel/plano', 'Meu plano', 'Uso, pagamentos e Premium.'],
    ['/instalar', 'Instalar o app', 'Ícone na tela inicial e avisos com o app fechado.'],
  ]
  return (
    <nav aria-label="Atalhos" className="rounded-sheet border border-rule bg-sheet p-2">
      {links.map(([to, title, text]) => (
        <Link key={to} to={to} className="block rounded-doc px-3 py-2.5 hover:bg-paper">
          <span className="block text-sm font-semibold text-ink">{title}</span>
          <span className="block text-xs text-muted">{text}</span>
        </Link>
      ))}
    </nav>
  )
}
