import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { SelectField, TextAreaField, TextField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { useAuth } from '@/core/auth/AuthProvider'
import { formatDate, formatKm, todayISO } from '@/core/shared/format'
import { formatBRL, parseBRL } from '@/modules/maintenance/schemas'
import {
  EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABEL, categoryLabel, deleteExpense, isExpenseCategory, receiptUrl, saveExpense,
  type ExpenseCategory, type SpendingEntry,
} from './api'

const centsToInput = (c: number | null) => (c == null ? '' : (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

/** Lançar ou editar despesa avulsa (RF-07). Sem moto fixa, pede a moto. */
export function ExpenseForm({ motos, motoId, entry, left, onDone }: {
  motos: { id: string; label: string }[]
  motoId: string | null
  entry?: SpendingEntry
  /** Gratuito: quantas ainda cabem neste mês. */
  left?: number | null
  onDone: () => void
}) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [moto, setMoto] = useState(entry?.motorcycle_id ?? motoId ?? motos[0]?.id ?? '')
  const [category, setCategory] = useState<ExpenseCategory | ''>(entry && isExpenseCategory(entry.category) ? entry.category : '')
  const [date, setDate] = useState(entry?.date ?? todayISO())
  const [value, setValue] = useState(centsToInput(entry?.value_cents ?? null))
  const [description, setDescription] = useState(entry?.title ?? '')
  const [mileage, setMileage] = useState(entry?.mileage != null ? String(entry.mileage) : '')
  const [file, setFile] = useState<File | null>(null)
  const [removeReceipt, setRemoveReceipt] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const save = useMutation({
    mutationFn: (input: Parameters<typeof saveExpense>[1]) => saveExpense(user!.id, input),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['spending'] })
      await qc.invalidateQueries({ queryKey: ['spending-entries'] })
      await qc.invalidateQueries({ queryKey: ['spending-snapshot'] })
      onDone()
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    const cents = parseBRL(value)
    if (!moto) errs.moto = 'Escolha a moto.'
    if (!category) errs.category = 'Escolha a categoria.'
    if (cents === undefined || Number.isNaN(cents) || cents < 1) errs.value = 'Informe o valor, por exemplo 85,90.'
    if (!date) errs.date = 'Informe a data.'
    else if (date > todayISO()) errs.date = 'A data não pode ser no futuro.'
    const km = mileage.trim() === '' ? null : Number(mileage.replace(/\D/g, ''))
    if (km !== null && (!Number.isFinite(km) || km > 2_000_000)) errs.mileage = 'Quilometragem inválida.'
    if (description.length > 200) errs.description = 'No máximo 200 caracteres.'
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    save.mutate({
      id: entry?.id, motorcycleId: moto, category: category as ExpenseCategory, date, valueCents: cents!,
      description: description.trim(), mileage: km, receipt: file, removeReceipt: !file && removeReceipt,
    })
  }

  const blocked = !entry && left === 0
  return (
    <form onSubmit={submit} noValidate className="rounded-sheet border border-ink/30 bg-sheet p-4 sm:p-5" aria-label={entry ? 'Editar despesa' : 'Lançar despesa'}>
      <h3 className="heading text-lg text-ink">{entry ? 'Editar despesa' : 'Lançar despesa'}</h3>
      <p className="mt-1 text-sm text-muted">
        Gastos fora da manutenção (combustível, seguro, IPVA…). Só você vê; não entram no histórico da moto nem passam para o próximo dono.
      </p>
      {blocked ? (
        <div className="mt-3"><Notice tone="info" title="Limite do mês atingido">
          Você já lançou as despesas que o plano gratuito permite neste mês. <Link to="/painel/plano" className="underline underline-offset-4">Conheça o Premium</Link> para lançar sem limite.
        </Notice></div>
      ) : (
        <>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {!motoId && motos.length > 1 && (
              <SelectField label="Moto" value={moto} options={motos.map((m) => m.id)} optionLabel={(v) => motos.find((m) => m.id === v)?.label ?? v}
                onChange={(e) => setMoto(e.target.value)} error={errors.moto} />
            )}
            <SelectField label="Categoria" value={category} placeholder="Escolha" options={EXPENSE_CATEGORIES} optionLabel={(c) => EXPENSE_CATEGORY_LABEL[c as ExpenseCategory]}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory | '')} error={errors.category} />
            <TextField label="Valor (R$)" inputMode="decimal" placeholder="0,00" value={value} onChange={(e) => setValue(e.target.value)} error={errors.value} />
            <TextField label="Data" type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} error={errors.date} />
            <TextField label="Km (opcional)" inputMode="numeric" value={mileage} onChange={(e) => setMileage(e.target.value)} error={errors.mileage} />
            <TextAreaField label="Descrição (opcional)" className="sm:col-span-2" rows={2} maxLength={200} value={description}
              onChange={(e) => setDescription(e.target.value)} error={errors.description} />
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className="text-sm font-semibold text-graphite" htmlFor="expense-receipt">Comprovante (opcional)</label>
              <input id="expense-receipt" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
                className="text-sm text-graphite file:mr-3 file:rounded-doc file:border file:border-ink/30 file:bg-sheet file:px-3 file:py-2 file:font-semibold file:text-ink"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <p className="text-xs text-muted">Foto ou PDF. Conta no espaço de anexos do seu plano.</p>
              {entry?.receipt_name && !file && (
                <label className="mt-1 flex items-center gap-2 text-sm text-graphite">
                  <input type="checkbox" checked={removeReceipt} onChange={(e) => setRemoveReceipt(e.target.checked)} />
                  Remover o comprovante atual ({entry.receipt_name})
                </label>
              )}
            </div>
          </div>
          {save.isError && <div className="mt-3"><Notice tone="error">{(save.error as Error).message}</Notice></div>}
          {!entry && left != null && left <= 3 && <p className="mt-3 text-sm text-muted">Plano gratuito: você ainda pode lançar {left} despesa{left === 1 ? '' : 's'} este mês.</p>}
        </>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        {!blocked && <Button type="submit" loading={save.isPending}>{entry ? 'Salvar alterações' : 'Lançar despesa'}</Button>}
        <Button type="button" variant="secondary" onClick={onDone}>Cancelar</Button>
      </div>
    </form>
  )
}

/** Lista de lançamentos do recorte: serviços (link para a linha do tempo) e despesas (editar/apagar). */
export function EntryList({ entries, motos, motoId, showMoto }: {
  entries: SpendingEntry[]
  motos: { id: string; label: string }[]
  motoId: string | null
  showMoto: boolean
}) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<string | null>(null)
  const del = useMutation({
    mutationFn: deleteExpense,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['spending'] })
      await qc.invalidateQueries({ queryKey: ['spending-entries'] })
      await qc.invalidateQueries({ queryKey: ['spending-snapshot'] })
    },
  })
  const open = async (path: string) => {
    const w = window.open('', '_blank', 'noopener')
    try {
      const url = await receiptUrl(path)
      if (w) w.location.href = url
      else window.location.href = url
    } catch {
      w?.close()
    }
  }
  if (entries.length === 0) return <p className="mt-2 text-sm text-muted">Nenhum lançamento neste recorte.</p>
  return (
    <>
      {del.isError && <div className="mt-2"><Notice tone="error">{(del.error as Error).message}</Notice></div>}
      <ul className="mt-2 divide-y divide-rule/70">
        {entries.map((e) => (
          <li key={`${e.kind}-${e.id}`} className="py-3">
            {editing === e.id ? (
              <ExpenseForm motos={motos} motoId={motoId} entry={e} onDone={() => setEditing(null)} />
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <div className="min-w-0">
                  <p className="text-ink">
                    <span className="font-semibold">{e.kind === 'service' ? e.title : categoryLabel(e.category)}</span>
                    {e.kind === 'expense' && e.title && <span className="text-graphite"> · {e.title}</span>}
                  </p>
                  <p className="text-sm text-muted">
                    {formatDate(e.date, 'short')} · {e.kind === 'service' ? `Serviço · ${categoryLabel(e.category)}` : 'Despesa avulsa'}
                    {e.workshop_name ? ` · ${e.workshop_name}` : ''}
                    {e.mileage != null ? ` · ${formatKm(e.mileage)}` : ''}
                    {showMoto ? ` · ${motos.find((m) => m.id === e.motorcycle_id)?.label ?? ''}` : ''}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-x-4 text-sm">
                    {e.kind === 'service' ? (
                      <Link to={`/painel/motos/${e.motorcycle_id}/historico`} className="font-semibold text-ink underline underline-offset-4">Ver na linha do tempo</Link>
                    ) : (
                      <>
                        <button type="button" className="font-semibold text-ink underline underline-offset-4" onClick={() => setEditing(e.id)}>Editar</button>
                        <button type="button" className="font-semibold text-danger underline underline-offset-4" disabled={del.isPending}
                          onClick={() => { if (window.confirm('Apagar esta despesa? Ela sai dos totais e o comprovante é apagado.')) del.mutate(e.id) }}>Apagar</button>
                        {e.receipt_path && (
                          <button type="button" className="font-semibold text-ink underline underline-offset-4" onClick={() => open(e.receipt_path!)}>Ver comprovante</button>
                        )}
                      </>
                    )}
                  </p>
                </div>
                <span className="font-semibold tabular-nums text-ink">{e.value_cents != null ? formatBRL(e.value_cents) : <span className="font-normal text-muted">sem valor</span>}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
