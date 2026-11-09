import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { SelectField, TextField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { translateDbError } from '@/core/shared/dbErrors'
import { todayISO } from '@/core/shared/format'
import { CATEGORIES, CATEGORY_LABEL } from '@/modules/maintenance/labels'
import { hasEntitlement } from '@/modules/plans/api'
import { useMyPlan } from '@/modules/plans/useMyPlan'
import {
  completeReminder,
  createReminder,
  deleteReminder,
  describeDue,
  describeRule,
  fetchReminders,
  parseReminderForm,
  setReminderPaused,
  STATUS_LABEL,
  updateReminder,
  type Reminder,
  type ReminderInput,
} from './api'
import { PremiumLink } from '@/modules/plans/PremiumLink'

const STATUS_STYLE: Record<Reminder['status'], string> = {
  due: 'bg-danger text-sheet',
  soon: 'bg-ink text-sheet',
  ok: 'bg-paper text-graphite',
  paused: 'bg-paper text-muted',
  done: 'bg-paper text-muted',
}

const dbError = (e: unknown) => translateDbError(e as { code?: string; message?: string })

function ReminderForm({
  initial,
  onSubmit,
  onCancel,
  pending,
}: {
  initial?: Reminder
  onSubmit: (i: ReminderInput) => void
  onCancel: () => void
  pending: boolean
}) {
  const [f, setF] = useState({
    title: initial?.title ?? '',
    category: initial?.category ?? '',
    everyKm: initial?.every_km ? String(initial.every_km) : '',
    everyMonths: initial?.every_months ? String(initial.every_months) : '',
    dueDate: initial?.due_date ?? '',
    notes: initial?.notes ?? '',
    lastDate: '',
    lastKm: '',
  })
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }))

  function submit(e: FormEvent) {
    e.preventDefault()
    const parsed = parseReminderForm(f)
    if (typeof parsed === 'string') return setError(parsed)
    setError(null)
    onSubmit(parsed)
  }

  return (
    <form onSubmit={submit} noValidate className="mt-4 grid gap-4 rounded-doc border border-rule bg-sheet p-4" aria-label={initial ? 'Editar lembrete' : 'Novo lembrete'}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Nome" value={f.title} onChange={(e) => set('title', e.target.value)} maxLength={80} placeholder="Ex.: Troca de óleo" />
        <SelectField label="Categoria (opcional)" value={f.category} options={CATEGORIES} placeholder="Sem categoria"
          optionLabel={(v) => CATEGORY_LABEL[v as keyof typeof CATEGORY_LABEL]} onChange={(e) => set('category', e.target.value)} />
      </div>
      <p className="text-sm text-muted">
        Quando avisar? Use o intervalo do manual da sua moto ou o que a sua oficina recomendou. O que vencer primeiro dispara o aviso.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label="A cada (km)" value={f.everyKm} onChange={(e) => set('everyKm', e.target.value)} inputMode="numeric" placeholder="Ex.: 3000" />
        <TextField label="A cada (meses)" value={f.everyMonths} onChange={(e) => set('everyMonths', e.target.value)} inputMode="numeric" placeholder="Ex.: 6" />
        <TextField label="Ou numa data" type="date" value={f.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
      </div>
      {!initial && (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Última vez: data (opcional)" type="date" max={todayISO()} value={f.lastDate} onChange={(e) => set('lastDate', e.target.value)}
            hint="Se não informar, conta a partir de hoje." />
          <TextField label="Última vez: km (opcional)" value={f.lastKm} onChange={(e) => set('lastKm', e.target.value)} inputMode="numeric"
            hint="Se não informar, usa a última leitura registrada." />
        </div>
      )}
      <TextField label="Observação (opcional)" value={f.notes} onChange={(e) => set('notes', e.target.value)} maxLength={300} />
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={pending}>{initial ? 'Salvar' : 'Criar lembrete'}</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
      </div>
    </form>
  )
}

/** Lembretes de manutenção da moto (Premium). Não alteram o histórico (PRD 5.8). */
export function RemindersSection({ motorcycleId }: { motorcycleId: string }) {
  const qc = useQueryClient()
  const plan = useMyPlan()
  const premium = hasEntitlement(plan.data, 'maintenance_reminders')
  const list = useQuery({ queryKey: ['reminders', motorcycleId], queryFn: () => fetchReminders(motorcycleId) })
  const [mode, setMode] = useState<'idle' | 'new' | string>('idle')
  const [error, setError] = useState<string | null>(null)

  const refresh = () =>
    Promise.all([qc.invalidateQueries({ queryKey: ['reminders', motorcycleId] }), qc.invalidateQueries({ queryKey: ['due-reminders'] })])

  const done = { onSuccess: async () => { setError(null); setMode('idle'); await refresh() }, onError: (e: unknown) => setError(dbError(e)) }
  const create = useMutation({ mutationFn: (i: ReminderInput) => createReminder(motorcycleId, i), ...done })
  const update = useMutation({ mutationFn: ({ id, i }: { id: string; i: ReminderInput }) => updateReminder(id, i), ...done })
  const action = useMutation({
    mutationFn: async ({ kind, r }: { kind: 'complete' | 'pause' | 'resume' | 'delete'; r: Reminder }) => {
      if (kind === 'complete') return completeReminder(r.id, null)
      if (kind === 'pause') return setReminderPaused(r.id, true)
      if (kind === 'resume') return setReminderPaused(r.id, false)
      return deleteReminder(r.id)
    },
    onSuccess: async () => { setError(null); await refresh() },
    onError: (e) => setError(dbError(e)),
  })

  const items = list.data ?? []
  if (!premium && items.length === 0) {
    return (
      <section aria-labelledby="reminders-title">
        <h2 id="reminders-title" className="heading text-2xl text-ink">Lembretes</h2>
        <p className="mt-1 max-w-2xl text-muted">
          Avisos de troca de óleo, revisão, pneus e o que mais você quiser, por quilometragem ou por data. Recurso do Premium.
        </p>
        <PremiumLink className="mt-3 inline-block font-semibold text-ink underline underline-offset-4">Conhecer o Premium</PremiumLink>
      </section>
    )
  }

  return (
    <section aria-labelledby="reminders-title">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="reminders-title" className="heading text-2xl text-ink">Lembretes</h2>
        {premium && mode === 'idle' && <Button size="sm" variant="secondary" onClick={() => setMode('new')}>Novo lembrete</Button>}
      </div>
      <p className="mt-1 max-w-2xl text-muted">
        Só você vê. Concluir um lembrete reinicia a contagem; ele não cria nem altera registros do histórico.
      </p>
      {!premium && (
        <p className="mt-2 text-sm text-muted">
          Seu plano atual não cria nem edita lembretes. Você ainda pode concluir, pausar ou excluir os que já tem.{' '}
          <PremiumLink>Ver planos</PremiumLink>
        </p>
      )}
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      {mode === 'new' && <ReminderForm onSubmit={(i) => create.mutate(i)} onCancel={() => setMode('idle')} pending={create.isPending} />}
      {list.isLoading && <p className="mt-4 text-muted" role="status">Carregando lembretes…</p>}
      {list.isError && <div className="mt-4"><Notice tone="error">Não foi possível carregar os lembretes.</Notice></div>}
      {premium && items.length === 0 && mode !== 'new' && !list.isLoading && (
        <p className="mt-4 text-muted">Nenhum lembrete ainda. Comece pela troca de óleo.</p>
      )}
      {items.length > 0 && (
        <ul className="mt-4 divide-y divide-rule border-y border-rule">
          {items.map((r) => (
            <li key={r.id} className="py-3">
              {mode === r.id ? (
                <ReminderForm initial={r} onSubmit={(i) => update.mutate({ id: r.id, i })} onCancel={() => setMode('idle')} pending={update.isPending} />
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">
                      {r.title}{' '}
                      <span className={`ml-1 rounded-doc px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                    </p>
                    <p className="text-sm text-muted">
                      {describeRule(r)}
                      {r.status !== 'done' && r.status !== 'paused' && describeDue(r) ? ` · ${describeDue(r)}` : ''}
                    </p>
                    {r.notes && <p className="mt-1 text-sm text-graphite">{r.notes}</p>}
                  </div>
                  {r.status !== 'done' && (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" loading={action.isPending && action.variables?.r.id === r.id && action.variables.kind === 'complete'}
                        onClick={() => action.mutate({ kind: 'complete', r })} aria-label={`Marcar ${r.title} como feito`}>
                        Feito
                      </Button>
                      {premium && <Button size="sm" variant="quiet" onClick={() => setMode(r.id)}>Editar</Button>}
                      <Button size="sm" variant="quiet" onClick={() => action.mutate({ kind: r.paused ? 'resume' : 'pause', r })}>
                        {r.paused ? 'Retomar' : 'Pausar'}
                      </Button>
                      <Button size="sm" variant="quiet"
                        onClick={() => window.confirm(`Excluir o lembrete "${r.title}"?`) && action.mutate({ kind: 'delete', r })}>
                        Excluir
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
