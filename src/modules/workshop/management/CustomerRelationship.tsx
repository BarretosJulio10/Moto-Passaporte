import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { formatKm } from '@/core/shared/format'
import { vehicleLabel, type Vehicle } from '../customers/api'
import { Card } from '../shared/WorkshopShell'
import { formatCents, formatDateTime } from '../shared/rpc'
import { CONTACT_LABEL, PAY_LABEL, REMINDER_LABEL, fetchCustomerContacts, formatDay, setReminderStatus } from './api'
import { ReminderForm } from './widgets'

/** Lembretes, últimos contatos e (com permissão) pagamentos do cliente (PRD 2.1 §4.2). */
export function RelationshipCard({ orgId, customerId, vehicles, canEdit }: { orgId: string; customerId: string; vehicles: Vehicle[]; canEdit: boolean }) {
  const qc = useQueryClient()
  const key = ['ws-customer-contacts', orgId, customerId]
  const q = useQuery({ queryKey: key, queryFn: () => fetchCustomerContacts(orgId, customerId) })
  const [adding, setAdding] = useState(false)
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: key }), qc.invalidateQueries({ queryKey: ['ws-relationship', orgId] })])
  const d = q.data
  const active = vehicles.filter((v) => v.status === 'active')
  const vName = (id: string | null) => { const v = active.find((x) => x.id === id); return v ? vehicleLabel(v) : null }

  return (
    <Card title="Relacionamento" actions={canEdit && !adding && <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>Novo lembrete</Button>}>
      {adding && (
        <div className="mb-4">
          <ReminderForm orgId={orgId} customerId={customerId} vehicleId={active.length === 1 ? active[0]?.id : null}
            onDone={async () => { await refresh(); setAdding(false) }} onCancel={() => setAdding(false)} />
        </div>
      )}
      {q.isLoading && <p className="text-sm text-muted" role="status">Carregando…</p>}
      {d && (
        <div className="flex flex-col gap-4 text-sm">
          <section>
            <h3 className="font-semibold text-ink">Lembretes</h3>
            {d.reminders.length === 0 ? <p className="text-muted">Nenhum lembrete aberto.</p> : (
              <ul className="mt-1 divide-y divide-rule/70">
                {d.reminders.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                    <span>{r.title}<span className="text-muted"> · {REMINDER_LABEL[r.kind]}{r.due_date ? ` · ${formatDay(r.due_date)}` : ''}{r.due_km != null ? ` · ${formatKm(r.due_km)}` : ''}{vName(r.vehicle_id) ? ` · ${vName(r.vehicle_id)}` : ''}</span></span>
                    {canEdit && <span className="flex gap-1">
                      <Button size="sm" variant="quiet" onClick={async () => { await setReminderStatus(orgId, r.id, 'done'); await refresh() }}>Feito</Button>
                      <Button size="sm" variant="quiet" onClick={async () => { await setReminderStatus(orgId, r.id, 'dismissed'); await refresh() }}>Descartar</Button>
                    </span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h3 className="font-semibold text-ink">Últimos contatos</h3>
            {d.contacts.length === 0 ? <p className="text-muted">Nenhum contato registrado.</p> : (
              <ul className="mt-1 flex flex-col gap-1">
                {d.contacts.map((c, i) => (
                  <li key={i} className="text-graphite">{CONTACT_LABEL[c.reason]} · {formatDateTime(c.created_at)}{c.by ? ` · ${c.by}` : ''}</li>
                ))}
              </ul>
            )}
          </section>
          {d.payments && (
            <section>
              <h3 className="font-semibold text-ink">Pagamentos</h3>
              {d.payments.length === 0 ? <p className="text-muted">Nenhum recebimento registrado.</p> : (
                <ul className="mt-1 flex flex-col gap-1">
                  {d.payments.slice(0, 10).map((p, i) => (
                    <li key={i} className={p.voided ? 'text-muted line-through' : 'text-graphite'}>
                      {formatDay(p.paid_at)} · OS nº {p.order_number} · {PAY_LABEL[p.method]} · <span className="tabular-nums">{formatCents(p.amount_cents)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}
    </Card>
  )
}
