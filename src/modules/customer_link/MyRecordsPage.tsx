import { useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { PageHeader } from '@/components/AppLayout'
import { translateDbError } from '@/core/shared/dbErrors'
import { formatKm } from '@/core/shared/format'
import { formatCents, formatPhone, onlyDigits } from '@/modules/workshop/shared/rpc'
import { STATUS_LABEL as QUOTE_STATUS, type QuoteStatus } from '@/modules/workshop/quotes/api'
import { ORDER_STATUS_LABEL, type OrderStatus } from '@/modules/workshop/service-orders/api'
import { APPT_LABEL, type ApptStatus } from '@/modules/workshop/management/api'
import { fetchMyRecords, unlinkMine } from './api'

const day = (iso: string | null | undefined) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('pt-BR') : '—')

/** Meus atendimentos: orçamentos, OS, agendamentos e lembretes das oficinas que o cliente ligou à conta (PRD 2.1 §4.3). */
export function MyRecordsPage() {
  const qc = useQueryClient()
  const location = useLocation()
  const linked = (location.state as { linked?: boolean } | null)?.linked === true
  const q = useQuery({ queryKey: ['my-workshop-records'], queryFn: fetchMyRecords })

  return (
    <div>
      <PageHeader title="Meus atendimentos" intro="Orçamentos e serviços das oficinas que você ligou à sua conta. Para aprovar um orçamento, use o link que a oficina mandou." />
      {linked && <div className="mt-4 max-w-2xl"><Notice tone="success" title="Pronto">O atendimento foi ligado à sua conta.</Notice></div>}
      {q.isLoading && <p className="mt-6 text-muted" role="status">Carregando…</p>}
      {q.isError && <div className="mt-6"><Notice tone="error">{translateDbError(q.error as { code?: string; message?: string })}</Notice></div>}
      {q.data?.length === 0 && (
        <div className="mt-6 rounded-sheet border border-dashed border-rule bg-sheet p-8 text-muted">
          Nenhuma oficina ligada ainda. Quando uma oficina mandar um orçamento, comprovante ou convite, abra o link com a sua conta e confirme.
        </div>
      )}
      <div className="mt-6 flex flex-col gap-8">
        {q.data?.map((r) => (
          <section key={r.customer_id} className="rounded-sheet border border-rule bg-sheet p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="heading text-2xl text-ink">{r.workshop.name}</h2>
                <p className="text-sm text-muted">{[[r.workshop.city, r.workshop.state].filter(Boolean).join(', '), r.vehicles.join(', ')].filter(Boolean).join(' · ')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {r.workshop.slug && <a href={`/oficinas/${r.workshop.slug}`} className="inline-flex items-center rounded-doc border border-ink/30 px-3 py-2 text-sm font-semibold text-ink hover:border-ink">Perfil da oficina</a>}
                {r.workshop.whatsapp && <a href={`https://wa.me/55${onlyDigits(r.workshop.whatsapp).replace(/^55(?=\d{10,11}$)/, '')}`} target="_blank" rel="noreferrer"
                  className="inline-flex items-center rounded-doc border border-ink/30 px-3 py-2 text-sm font-semibold text-ink hover:border-ink">WhatsApp {formatPhone(onlyDigits(r.workshop.whatsapp).replace(/^55(?=\d{10,11}$)/, ''))}</a>}
              </div>
            </div>

            {(r.reminders.length > 0 || r.appointments.length > 0) && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {r.reminders.length > 0 && (
                  <div className="rounded-doc border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                    <p className="font-semibold">Próximas manutenções</p>
                    <ul>{r.reminders.map((x, i) => <li key={i}>{x.title}{x.due_date ? ` · ${day(x.due_date)}` : ''}{x.due_km != null ? ` · ${formatKm(x.due_km)}` : ''}</li>)}</ul>
                  </div>
                )}
                {r.appointments.length > 0 && (
                  <div className="rounded-doc border border-rule p-3 text-sm">
                    <p className="font-semibold text-ink">Agendamentos</p>
                    <ul>{r.appointments.map((a, i) => <li key={i}>{new Date(a.starts_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · {a.service} · {APPT_LABEL[a.status as ApptStatus] ?? a.status}</li>)}</ul>
                  </div>
                )}
              </div>
            )}

            <h3 className="mt-6 font-semibold text-ink">Serviços</h3>
            {r.orders.length === 0 ? <p className="text-sm text-muted">Nenhuma ordem de serviço.</p> : (
              <ul className="mt-2 flex flex-col gap-3">
                {r.orders.map((o) => (
                  <li key={o.number} className="rounded-doc border border-rule p-3 text-sm">
                    <p className="flex flex-wrap justify-between gap-2"><span className="font-semibold text-ink">OS nº {o.number} · {ORDER_STATUS_LABEL[o.status as OrderStatus] ?? o.status}</span>
                      <span className="tabular-nums">{o.final_total_cents != null ? formatCents(o.final_total_cents) : ''}</span></p>
                    <p className="text-muted">Aberta {day(o.created_at)}{o.completed_at ? ` · concluída ${day(o.completed_at)}` : ''}{o.km_out ? ` · ${formatKm(o.km_out)}` : ''}{o.receipt_code ? ` · comprovante ${o.receipt_code}` : ''}</p>
                    <ul className="mt-1 text-graphite">
                      {o.items.map((i, k) => <li key={k} className={i.status === 'not_done' ? 'text-muted line-through' : ''}>{i.status === 'done' ? '✓ ' : i.status === 'pending' ? '• ' : ''}{i.description}{i.part_brand ? ` (${i.part_brand})` : ''}</li>)}
                    </ul>
                  </li>
                ))}
              </ul>
            )}

            <h3 className="mt-6 font-semibold text-ink">Orçamentos</h3>
            {r.quotes.length === 0 ? <p className="text-sm text-muted">Nenhum orçamento.</p> : (
              <ul className="mt-2 divide-y divide-rule/70 text-sm">
                {r.quotes.map((x) => (
                  <li key={x.number} className="flex flex-wrap justify-between gap-2 py-2">
                    <span><span className="font-semibold text-ink">Nº {x.number}{x.is_complement ? ' (complementar)' : ''}</span> · {QUOTE_STATUS[x.status as QuoteStatus] ?? x.status} · {day(x.sent_at)}
                      <span className="block text-muted">{x.items.map((i) => i.description).join(', ')}</span></span>
                    <span className="tabular-nums">{formatCents(x.approved_total_cents ?? x.total_cents)}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-6 border-t border-rule pt-3">
              <Button size="sm" variant="quiet" onClick={async () => {
                if (!window.confirm(`Desligar a ${r.workshop.name} da sua conta? Você deixa de ver estes atendimentos aqui.`)) return
                await unlinkMine(r.customer_id)
                await qc.invalidateQueries({ queryKey: ['my-workshop-records'] })
              }}>Desligar esta oficina da minha conta</Button>
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
