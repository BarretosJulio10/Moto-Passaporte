import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { SelectField, TextAreaField, TextField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { PageHeader } from '@/components/AppLayout'
import { translateDbError } from '@/core/shared/dbErrors'
import { fetchMembers } from '../teamApi'
import { fetchCustomer, listCustomers, vehicleLabel } from '../customers/api'
import { Card, StatusChip, WorkshopShell } from '../shared/WorkshopShell'
import { formatPhone, onlyDigits } from '../shared/rpc'
import {
  APPT_LABEL, APPT_STATUSES, APPT_TONE, agendaRange, listAppointments, localDayKey, saveAppointment, setAppointmentStatus, shiftRef,
  type AgendaView, type Appointment, type ApptStatus,
} from './api'
import { ContactButton } from './widgets'
import { whatsappUrl } from '../quotes/api'

type Err = { code?: string; message?: string }
const VIEWS: { v: AgendaView; label: string }[] = [{ v: 'dia', label: 'Dia' }, { v: 'semana', label: 'Semana' }, { v: 'mes', label: 'Mês' }]
const time = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

/** Agenda da oficina (PRD 2.1 §12): dia, semana e mês. Agendamento pelo perfil público fica para a Fase 5. */
export function AgendaPage() {
  return <WorkshopShell>{({ orgId, shop, perms }) => <AgendaViewPage orgId={orgId} workshopName={shop.business_name} canEdit={perms.manage_quotes} />}</WorkshopShell>
}

function AgendaViewPage({ orgId, workshopName, canEdit }: { orgId: string; workshopName: string; canEdit: boolean }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [view, setView] = useState<AgendaView>('dia')
  const [ref, setRef] = useState(() => new Date())
  const [form, setForm] = useState<'new' | Appointment | null>(null)
  const [error, setError] = useState<string | null>(null)
  const range = agendaRange(view, ref)
  const q = useQuery({ queryKey: ['ws-agenda', orgId, view, range.from.toISOString()], queryFn: () => listAppointments(orgId, range.from, range.to) })
  const refresh = () => qc.invalidateQueries({ queryKey: ['ws-agenda', orgId] })

  async function status(a: Appointment, s: ApptStatus) {
    setError(null)
    try { await setAppointmentStatus(orgId, a.id, s); await refresh() } catch (err) { setError(translateDbError(err as Err)) }
  }

  const title = view === 'mes'
    ? range.from.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    : view === 'semana'
      ? `${range.from.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} a ${new Date(range.to.getTime() - 1).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`
      : ref.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
  const items = q.data ?? []

  return (
    <div>
      <PageHeader title="Agenda" intro="Horários marcados pela equipe. Chegou a moto? Abra o orçamento ou a OS direto daqui."
        actions={canEdit && form === null && <Button onClick={() => setForm('new')}>Novo agendamento</Button>} />

      {form && (
        <Card className="mt-6" title={form === 'new' ? 'Novo agendamento' : 'Editar agendamento'}>
          <AppointmentForm orgId={orgId} appt={form === 'new' ? undefined : form} defaultDay={ref}
            onDone={async () => { await refresh(); setForm(null) }} onCancel={() => setForm(null)} />
        </Card>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="flex rounded-doc border border-rule bg-sheet p-0.5" role="group" aria-label="Visualização">
          {VIEWS.map((x) => (
            <button key={x.v} type="button" aria-pressed={view === x.v} onClick={() => setView(x.v)}
              className={`rounded-[0.35rem] px-3 py-1.5 text-sm font-semibold ${view === x.v ? 'bg-ink text-sheet' : 'text-ink'}`}>{x.label}</button>
          ))}
        </div>
        <Button size="sm" variant="secondary" onClick={() => setRef(shiftRef(view, ref, -1))} aria-label="Anterior">‹</Button>
        <Button size="sm" variant="secondary" onClick={() => setRef(new Date())}>Hoje</Button>
        <Button size="sm" variant="secondary" onClick={() => setRef(shiftRef(view, ref, 1))} aria-label="Próximo">›</Button>
        <p className="heading ml-1 text-lg text-ink first-letter:uppercase">{title}</p>
      </div>
      {error && <div className="mt-3 max-w-xl"><Notice tone="error">{error}</Notice></div>}
      {q.isLoading && <p className="mt-4 text-muted" role="status">Carregando…</p>}
      {q.isError && <div className="mt-4"><Notice tone="error">{translateDbError(q.error as Err)}</Notice></div>}

      {q.data && view === 'mes' && <MonthGrid from={range.from} items={items} onPick={(d) => { setRef(d); setView('dia') }} />}
      {q.data && view !== 'mes' && (
        <div className="mt-4 flex flex-col gap-4">
          {days(range.from, range.to).map((d) => {
            const list = items.filter((a) => localDayKey(a.starts_at) === localDayKey(d))
            if (view === 'semana' && list.length === 0) return null
            return (
              <section key={d.toISOString()}>
                {view === 'semana' && <h2 className="mb-2 text-sm font-semibold text-muted first-letter:uppercase">{d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })}</h2>}
                <ul className="flex flex-col gap-2">
                  {list.map((a) => (
                    <li key={a.id} className={`rounded-sheet border border-rule bg-sheet p-3 sm:p-4 ${['canceled', 'no_show'].includes(a.status) ? 'opacity-60' : ''}`}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-ink"><span className="tabular-nums">{time(a.starts_at)}</span> · {a.customer_name ?? a.contact_name}</p>
                          <p className="text-sm text-graphite">{a.service_description}</p>
                          <p className="text-xs text-muted">
                            {a.source === 'publico' && <span className="mr-1 rounded-full border border-amber-300 bg-amber-50 px-1.5 font-semibold text-amber-900">Pelo site</span>}
                            {[a.vehicle_label ?? a.vehicle_text, `${a.duration_minutes} min`, a.responsible_name, a.contact_phone && formatPhone(a.contact_phone)].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        <StatusChip className={APPT_TONE[a.status]}>{APPT_LABEL[a.status]}</StatusChip>
                      </div>
                      {a.notes && <p className="mt-1 text-sm text-muted">{a.notes}</p>}
                      {canEdit && !['done', 'canceled', 'no_show'].includes(a.status) && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {a.status === 'requested' && <Button size="sm" onClick={() => status(a, 'confirmed')}>Confirmar</Button>}
                          {a.status !== 'in_service' && a.status !== 'requested' && <Button size="sm" onClick={() => status(a, 'in_service')}>Chegou</Button>}
                          {a.customer_id && a.status === 'in_service' && (
                            <>
                              <Button size="sm" onClick={() => navigate(`/oficina/${orgId}/orcamentos/novo?cliente=${a.customer_id}`)}>Criar orçamento</Button>
                              <Button size="sm" variant="secondary" onClick={() => navigate(`/oficina/${orgId}/os/nova?cliente=${a.customer_id}`)}>Abrir OS</Button>
                            </>
                          )}
                          {!a.customer_id && a.contact_phone && a.status !== 'in_service' && (
                            <a href={whatsappUrl(a.contact_phone, `Olá, ${(a.contact_name ?? '').split(' ')[0]}! Aqui é da ${workshopName}. Recebemos seu pedido para ${new Date(a.starts_at).toLocaleDateString('pt-BR')} às ${time(a.starts_at)}. Podemos confirmar?`)}
                              target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-doc border border-rule bg-sheet px-3 py-1.5 text-sm font-semibold text-ink hover:border-ink">Confirmar pelo WhatsApp</a>
                          )}
                          {a.customer_id && a.status !== 'in_service' && (
                            <ContactButton orgId={orgId} customerId={a.customer_id} customerName={a.customer_name ?? ''} whatsapp={a.customer_whatsapp}
                              workshopName={workshopName} reason="other" reference={a.id} label="Confirmar pelo WhatsApp"
                              detail={`Confirmando seu horário em ${new Date(a.starts_at).toLocaleDateString('pt-BR')} às ${time(a.starts_at)}: ${a.service_description}. Podemos contar com você?`} />
                          )}
                          <details className="group w-full sm:w-auto">
                            <summary className="cursor-pointer list-none px-2 py-1.5 text-sm font-semibold text-ink underline-offset-4 hover:underline">Mais opções</summary>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {a.status !== 'awaiting_arrival' && a.status !== 'in_service' && <Button size="sm" variant="quiet" onClick={() => status(a, 'awaiting_arrival')}>Aguardando chegada</Button>}
                              {a.status === 'requested' && <Button size="sm" variant="quiet" onClick={() => status(a, 'in_service')}>Chegou</Button>}
                              <Button size="sm" variant="quiet" onClick={() => status(a, 'done')}>Concluído</Button>
                              <Button size="sm" variant="quiet" onClick={() => status(a, 'no_show')}>Não veio</Button>
                              <Button size="sm" variant="quiet" onClick={() => status(a, 'canceled')}>Cancelar</Button>
                              <Button size="sm" variant="quiet" onClick={() => setForm(a)}>Editar</Button>
                            </div>
                          </details>
                        </div>
                      )}
                      {a.quote_id && <Link to={`/oficina/${orgId}/orcamentos/${a.quote_id}`} className="mt-2 inline-block text-sm underline underline-offset-4">Ver orçamento</Link>}
                    </li>
                  ))}
                  {view === 'dia' && list.length === 0 && <li className="rounded-sheet border border-dashed border-rule px-4 py-8 text-center text-muted">Nenhum horário neste dia.</li>}
                </ul>
              </section>
            )
          })}
          {view === 'semana' && items.length === 0 && <p className="rounded-sheet border border-dashed border-rule px-4 py-8 text-center text-muted">Nenhum horário nesta semana.</p>}
        </div>
      )}
    </div>
  )
}

function days(from: Date, to: Date): Date[] {
  const out: Date[] = []
  for (let d = new Date(from); d < to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) out.push(d)
  return out
}

function MonthGrid({ from, items, onPick }: { from: Date; items: Appointment[]; onPick: (d: Date) => void }) {
  const lead = (from.getDay() + 6) % 7
  const total = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate()
  const cells: (Date | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: total }, (_, i) => new Date(from.getFullYear(), from.getMonth(), i + 1))]
  const today = localDayKey(new Date())
  return (
    <div className="mt-4">
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted">
        {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((d) => <span key={d}>{d}</span>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <span key={`x${i}`} />
          const n = items.filter((a) => localDayKey(a.starts_at) === localDayKey(d) && a.status !== 'canceled').length
          return (
            <button key={d.toISOString()} type="button" onClick={() => onPick(d)}
              className={`flex aspect-square flex-col items-center justify-center rounded-doc border text-sm sm:aspect-auto sm:h-20 ${localDayKey(d) === today ? 'border-ink' : 'border-rule'} bg-sheet hover:border-ink`}>
              <span className="font-semibold text-ink">{d.getDate()}</span>
              {n > 0 && <span className="mt-0.5 rounded-full bg-ink px-1.5 text-[0.7rem] font-semibold text-sheet">{n}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function toLocalInput(d: Date) {
  return `${localDayKey(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function AppointmentForm({ orgId, appt, defaultDay, onDone, onCancel }: { orgId: string; appt?: Appointment; defaultDay: Date; onDone: () => Promise<void>; onCancel: () => void }) {
  const start = appt ? new Date(appt.starts_at) : new Date(defaultDay.getFullYear(), defaultDay.getMonth(), defaultDay.getDate(), 9, 0)
  const [search, setSearch] = useState('')
  const [v, setV] = useState({
    customer_id: appt?.customer_id ?? '', customer_name: appt?.customer_name ?? '', vehicle_id: appt?.vehicle_id ?? '',
    contact_name: appt?.contact_name ?? '', contact_phone: appt?.contact_phone ?? '', starts_at: toLocalInput(start),
    duration: String(appt?.duration_minutes ?? 60), service: appt?.service_description ?? '', responsible: appt?.responsible_user_id ?? '',
    status: appt?.status ?? ('confirmed' as ApptStatus), notes: appt?.notes ?? '',
  })
  const customers = useQuery({ queryKey: ['ws-customers', orgId, search], queryFn: () => listCustomers(orgId, search), enabled: !v.customer_id && search.length >= 2 })
  const customer = useQuery({ queryKey: ['ws-customer', orgId, v.customer_id], queryFn: () => fetchCustomer(orgId, v.customer_id), enabled: Boolean(v.customer_id) })
  const members = useQuery({ queryKey: ['org-members', orgId], queryFn: () => fetchMembers(orgId) })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!v.customer_id && v.contact_name.trim().length < 2) return setError('Escolha um cliente ou informe o nome de quem vem.')
    if (v.service.trim().length < 2) return setError('Descreva o serviço.')
    if (!v.starts_at) return setError('Informe data e hora.')
    if (!/^\d+$/.test(v.duration) || Number(v.duration) < 10) return setError('Duração em minutos (mínimo 10).')
    setSaving(true)
    setError(null)
    try {
      await saveAppointment(orgId, appt?.id ?? null, {
        customer_id: v.customer_id || null, vehicle_id: v.vehicle_id || null, contact_name: v.customer_id ? undefined : v.contact_name.trim(),
        contact_phone: v.customer_id ? undefined : onlyDigits(v.contact_phone), starts_at: new Date(v.starts_at).toISOString(),
        duration_minutes: Number(v.duration), service_description: v.service.trim(), responsible_user_id: v.responsible || null,
        status: appt ? undefined : v.status, notes: v.notes,
      })
      await onDone()
    } catch (err) {
      setError(translateDbError(err as Err))
    } finally {
      setSaving(false)
    }
  }

  const vehicles = (customer.data?.vehicles ?? []).filter((x) => x.status === 'active')
  const team = members.data ?? []
  return (
    <form onSubmit={submit} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        {v.customer_id ? (
          <div className="sm:col-span-2 flex flex-wrap items-center gap-2 rounded-doc border border-rule bg-paper/60 px-3 py-2 text-sm">
            <span>Cliente: <span className="font-semibold text-ink">{v.customer_name}</span></span>
            {!appt && <Button type="button" size="sm" variant="quiet" onClick={() => setV({ ...v, customer_id: '', customer_name: '', vehicle_id: '' })}>trocar</Button>}
          </div>
        ) : (
          <div className="sm:col-span-2">
            <TextField label="Cliente cadastrado (buscar)" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome, telefone ou placa" />
            {(customers.data ?? []).length > 0 && (
              <ul className="mt-1 max-h-48 overflow-y-auto rounded-doc border border-rule bg-sheet text-sm">
                {(customers.data ?? []).slice(0, 8).map((c) => (
                  <li key={c.id}><button type="button" className="w-full px-3 py-2 text-left hover:bg-paper" onClick={() => setV({ ...v, customer_id: c.id, customer_name: c.full_name })}>
                    {c.full_name}<span className="text-muted">{c.vehicle_labels ? ` · ${c.vehicle_labels}` : ''}</span></button></li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted">Cliente novo? Informe só nome e WhatsApp; o cadastro completo pode ser feito quando ele chegar.</p>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              <TextField label="Nome de quem vem" value={v.contact_name} onChange={(e) => setV({ ...v, contact_name: e.target.value })} />
              <TextField label="WhatsApp" value={v.contact_phone} onChange={(e) => setV({ ...v, contact_phone: e.target.value })} inputMode="tel" />
            </div>
          </div>
        )}
        {vehicles.length > 0 && (
          <SelectField label="Moto" value={v.vehicle_id} options={['', ...vehicles.map((x) => x.id)]}
            optionLabel={(id) => id ? vehicleLabel(vehicles.find((x) => x.id === id)) : 'Não informar'} onChange={(e) => setV({ ...v, vehicle_id: e.target.value })} />
        )}
        <TextField label="Data e hora" type="datetime-local" value={v.starts_at} onChange={(e) => setV({ ...v, starts_at: e.target.value })} />
        <TextField label="Duração (min)" value={v.duration} onChange={(e) => setV({ ...v, duration: e.target.value })} inputMode="numeric" />
        <TextField label="Serviço" value={v.service} onChange={(e) => setV({ ...v, service: e.target.value })} className="sm:col-span-2" placeholder="Revisão, troca de óleo, barulho no motor…" />
        <SelectField label="Responsável" value={v.responsible} options={['', ...team.map((m) => m.user_id)]}
          optionLabel={(id) => id ? (team.find((m) => m.user_id === id)?.full_name || 'Equipe') : 'Sem responsável'} onChange={(e) => setV({ ...v, responsible: e.target.value })} />
        {!appt && (
          <SelectField label="Situação" value={v.status} options={APPT_STATUSES.slice(0, 2)} optionLabel={(o) => APPT_LABEL[o as ApptStatus]}
            onChange={(e) => setV({ ...v, status: e.target.value as ApptStatus })} />
        )}
        <TextAreaField label="Observação" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} rows={2} className="sm:col-span-2" />
      </div>
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      <div className="mt-4 flex gap-2">
        <Button type="submit" size="sm" loading={saving}>Salvar</Button>
        <Button type="button" size="sm" variant="secondary" onClick={onCancel}>Cancelar</Button>
      </div>
    </form>
  )
}
