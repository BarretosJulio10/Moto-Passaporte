import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { PageHeader } from '@/components/AppLayout'
import { translateDbError } from '@/core/shared/dbErrors'
import { formatKm } from '@/core/shared/format'
import { Card, WorkshopShell } from '../shared/WorkshopShell'
import { formatCents, formatDateTime } from '../shared/rpc'
import { STATUS_LABEL, type QuoteStatus } from '../quotes/api'
import { fetchRelationship, formatDay, setReminderStatus, REMINDER_LABEL } from './api'
import { ContactButton } from './widgets'

type Err = { code?: string; message?: string }
const INACTIVE = [90, 180, 365] as const

/**
 * Relacionamento e recuperação (PRD 2.1 §14): lembretes, orçamentos sem resposta, orçamentos perdidos e clientes sumidos.
 * A equipe abre o WhatsApp com a mensagem pronta; o sistema registra o contato preparado, não envia sozinho.
 */
export function RelationshipPage() {
  return <WorkshopShell>{({ orgId, shop, perms }) => <RelationshipView orgId={orgId} workshopName={shop.business_name} canEdit={perms.manage_quotes} />}</WorkshopShell>
}

function RelationshipView({ orgId, workshopName, canEdit }: { orgId: string; workshopName: string; canEdit: boolean }) {
  const qc = useQueryClient()
  const [days, setDays] = useState<number>(180)
  const q = useQuery({ queryKey: ['ws-relationship', orgId, days], queryFn: () => fetchRelationship(orgId, days) })
  const refresh = () => qc.invalidateQueries({ queryKey: ['ws-relationship', orgId] })
  const [error, setError] = useState<string | null>(null)

  async function close(id: string, status: 'done' | 'dismissed') {
    setError(null)
    try { await setReminderStatus(orgId, id, status); await refresh() } catch (err) { setError(translateDbError(err as Err)) }
  }

  if (q.isLoading) return <p className="text-muted" role="status">Carregando…</p>
  if (q.isError || !q.data) return <Notice tone="error">{translateDbError(q.error as Err)}</Notice>
  const r = q.data
  const due = r.reminders.filter((x) => x.due)
  const later = r.reminders.filter((x) => !x.due)
  const contacted = (at: string | null | undefined) => at ? <span className="text-xs text-muted">último contato {formatDateTime(at)}</span> : null

  return (
    <div>
      <PageHeader title="Relacionamento"
        intro="Quem precisa de um contato hoje. O botão abre o WhatsApp com a mensagem pronta para você revisar e enviar; nada é enviado sozinho." />
      {error && <div className="mt-4 max-w-xl"><Notice tone="error">{error}</Notice></div>}
      {!canEdit && <div className="mt-4 max-w-2xl"><Notice tone="info">Você pode consultar. Para registrar contatos e lembretes, o responsável precisa liberar "Clientes, agenda, orçamentos e OS".</Notice></div>}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card title={`Lembretes para agora (${due.length})`}>
          {due.length === 0 ? <p className="text-sm text-muted">Nenhum lembrete vencendo nos próximos 7 dias ou perto da quilometragem.</p> : (
            <ul className="divide-y divide-rule/70 text-sm">
              {due.map((x) => (
                <li key={x.id} className="py-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="min-w-0">
                      <Link to={`/oficina/${orgId}/clientes/${x.customer_id}`} className="font-semibold text-ink underline underline-offset-4">{x.customer_name}</Link>
                      {x.vehicle_label ? ` · ${x.vehicle_label}` : ''}
                      <span className="block text-graphite">{x.title}</span>
                      <span className="block text-xs text-muted">
                        {REMINDER_LABEL[x.kind]}{x.due_date ? ` · ${formatDay(x.due_date)}` : ''}{x.due_km != null ? ` · ${formatKm(x.due_km)}` : ''}
                        {x.vehicle_km != null ? ` (moto com ${formatKm(x.vehicle_km)})` : ''}
                      </span>
                      {contacted(x.last_contact_at)}
                    </span>
                    {canEdit && (
                      <span className="flex flex-wrap items-center gap-1">
                        <ContactButton orgId={orgId} customerId={x.customer_id} customerName={x.customer_name ?? ''} whatsapp={x.whatsapp}
                          workshopName={workshopName} reason="reminder" reference={x.id} detail={x.title.toLowerCase()} onLogged={refresh} />
                        <Button size="sm" variant="quiet" onClick={() => close(x.id, 'done')}>Feito</Button>
                        <Button size="sm" variant="quiet" onClick={() => close(x.id, 'dismissed')}>Descartar</Button>
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {later.length > 0 && <p className="mt-3 text-xs text-muted">{later.length} lembrete{later.length === 1 ? '' : 's'} para mais adiante (veja na página de cada cliente).</p>}
        </Card>

        <Card title={`Orçamentos sem resposta (${r.open_quotes.length})`}>
          {r.open_quotes.length === 0 ? <p className="text-sm text-muted">Nenhum orçamento enviado há mais de 2 dias esperando o cliente.</p> : (
            <ul className="divide-y divide-rule/70 text-sm">
              {r.open_quotes.map((x) => (
                <li key={x.quote_id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                  <span className="min-w-0">
                    <Link to={`/oficina/${orgId}/orcamentos/${x.quote_id}`} className="font-semibold text-ink underline underline-offset-4">Nº {x.number}</Link>
                    {' · '}{x.customer_name} · {formatCents(x.total_cents)}
                    <span className="block text-xs text-muted">{STATUS_LABEL[x.status as QuoteStatus]} · enviado {formatDateTime(x.sent_at)}{x.valid_until ? ` · vale até ${formatDay(x.valid_until)}` : ''}</span>
                    {contacted(x.last_contact_at)}
                  </span>
                  {canEdit && <ContactButton orgId={orgId} customerId={x.customer_id} customerName={x.customer_name} whatsapp={x.whatsapp}
                    workshopName={workshopName} reason="quote_followup" reference={x.quote_id} detail={`nº ${x.number}`} onLogged={refresh} />}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={`Orçamentos perdidos nos últimos 60 dias (${r.lost_quotes.length})`}>
          {r.lost_quotes.length === 0 ? <p className="text-sm text-muted">Nenhum orçamento recusado, vencido ou aprovado só em parte.</p> : (
            <ul className="divide-y divide-rule/70 text-sm">
              {r.lost_quotes.map((x) => (
                <li key={x.quote_id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                  <span className="min-w-0">
                    <Link to={`/oficina/${orgId}/orcamentos/${x.quote_id}`} className="font-semibold text-ink underline underline-offset-4">Nº {x.number}</Link>
                    {' · '}{x.customer_name} · {formatCents(x.total_cents)}
                    <span className="block text-xs text-muted">{STATUS_LABEL[x.status as QuoteStatus]} · {formatDateTime(x.updated_at)}</span>
                  </span>
                  {canEdit && <ContactButton orgId={orgId} customerId={x.customer_id} customerName={x.customer_name} whatsapp={x.whatsapp}
                    workshopName={workshopName} reason="quote_followup" reference={x.quote_id} detail={`nº ${x.number}`} onLogged={refresh} />}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={`Clientes sem voltar (${r.inactive_customers.length})`}
          actions={
            <span className="flex gap-1" role="group" aria-label="Tempo sem voltar">
              {INACTIVE.map((d) => (
                <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${days === d ? 'border-ink bg-ink text-sheet' : 'border-rule text-ink'}`}>
                  {d === 365 ? '1 ano' : `${d} dias`}
                </button>
              ))}
            </span>
          }>
          {r.inactive_customers.length === 0 ? <p className="text-sm text-muted">Ninguém sumido nesse período.</p> : (
            <ul className="divide-y divide-rule/70 text-sm">
              {r.inactive_customers.map((x) => (
                <li key={x.customer_id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                  <span className="min-w-0">
                    <Link to={`/oficina/${orgId}/clientes/${x.customer_id}`} className="font-semibold text-ink underline underline-offset-4">{x.customer_name}</Link>
                    <span className="block text-xs text-muted">última visita {formatDay(x.last_visit)}</span>
                    {contacted(x.last_contact_at)}
                  </span>
                  {canEdit && <ContactButton orgId={orgId} customerId={x.customer_id} customerName={x.customer_name} whatsapp={x.whatsapp}
                    workshopName={workshopName} reason="return" onLogged={refresh} />}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
