import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { SelectField, TextAreaField, TextField } from '@/components/Field'
import { validate, type FieldErrors } from '@/core/auth/schemas'
import { translateDbError } from '@/core/shared/dbErrors'
import { formatDate, todayISO } from '@/core/shared/format'
import { MotoHeader } from '@/modules/motorcycles/MotoHeader'
import { CATEGORIES, CATEGORY_LABEL, CATEGORY_TITLE_SUGGESTION, type MaintenanceCategory } from './labels'
import { itemSchema, maintenanceSchema, type ItemInput } from './schemas'
import { createMaintenanceRecord, fetchTimeline } from './api'
import { getStorageUsage, uploadAll } from '@/modules/attachments/api'
import { AttachmentPicker, type PendingAttachment } from '@/modules/attachments/AttachmentPicker'

type ItemRow = { key: number; item_name: string; brand: string; part_number: string; quantity: string }
let rowKey = 0
const emptyRow = (): ItemRow => ({ key: ++rowKey, item_name: '', brand: '', part_number: '', quantity: '1' })

function centsToInput(cents: number | null): string {
  if (cents === null) return ''
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function RecordFormPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const correctingId = params.get('corrigir') ?? ''
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const timeline = useQuery({ queryKey: ['timeline', id], queryFn: () => fetchTimeline(id), enabled: Boolean(correctingId) })
  const original = correctingId ? timeline.data?.find((e) => e.id === correctingId) : undefined

  if (correctingId && timeline.isLoading) return <p className="text-muted" role="status">Carregando registro…</p>
  if (correctingId && !original) {
    return (
      <div>
        <MotoHeader motorcycleId={id} />
        <div className="mt-6"><Notice tone="error">Registro a corrigir não encontrado.</Notice></div>
      </div>
    )
  }

  return <RecordForm key={correctingId || 'novo'} motorcycleId={id} original={original} onDone={async (state) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['timeline', id] }),
      queryClient.invalidateQueries({ queryKey: ['mileage', id] }),
      queryClient.invalidateQueries({ queryKey: ['motorcycle', id] }),
      queryClient.invalidateQueries({ queryKey: ['my-motorcycles'] }),
      queryClient.invalidateQueries({ queryKey: ['storage-usage'] }),
    ])
    navigate(`/painel/motos/${id}/historico`, { replace: true, state })
  }} />
}

type FormProps = {
  motorcycleId: string
  original?: Awaited<ReturnType<typeof fetchTimeline>>[number]
  onDone: (state: { saved: 'created' | 'corrected'; below: boolean; attachFailures: string[] }) => Promise<void>
}

function RecordForm({ motorcycleId, original, onDone }: FormProps) {
  const [errors, setErrors] = useState<FieldErrors>({})
  const [itemErrors, setItemErrors] = useState<Record<number, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState<PendingAttachment[]>([])
  const usage = useQuery({ queryKey: ['storage-usage'], queryFn: getStorageUsage, retry: false })
  const [category, setCategory] = useState<string>(original?.category ?? '')
  const [title, setTitle] = useState(original?.title ?? '')
  const [titleTouched, setTitleTouched] = useState(Boolean(original))
  const [rows, setRows] = useState<ItemRow[]>(
    original?.items.map((i) => ({
      key: ++rowKey,
      item_name: i.item_name,
      brand: i.brand ?? '',
      part_number: i.part_number ?? '',
      quantity: String(i.quantity).replace('.', ','),
    })) ?? [],
  )

  const updateRow = (key: number, field: keyof Omit<ItemRow, 'key'>, value: string) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [field]: value } : r)))

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    const data = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>
    const parsed = validate(maintenanceSchema, { ...data, correctsRecordId: original?.id ?? '' })

    const items: ItemInput[] = []
    const rowErrs: Record<number, string> = {}
    for (const row of rows) {
      const blank = !row.item_name.trim() && !row.brand.trim() && !row.part_number.trim()
      if (blank) continue
      const r = itemSchema.safeParse(row)
      if (r.success) items.push(r.data)
      else rowErrs[row.key] = r.error.issues[0]?.message ?? 'Peça inválida.'
    }
    setItemErrors(rowErrs)

    if (!parsed.ok || Object.keys(rowErrs).length) {
      if (!parsed.ok) setErrors(parsed.errors)
      return
    }
    setErrors({})
    setLoading(true)
    try {
      const result = await createMaintenanceRecord(motorcycleId, parsed.data, items)
      const attachFailures = pending.length ? await uploadAll(motorcycleId, { maintenanceRecordId: result.id }, pending) : []
      await onDone({ saved: original ? 'corrected' : 'created', below: result.below_previous, attachFailures })
    } catch (error) {
      setFormError(translateDbError(error as { code?: string; message?: string }))
      setLoading(false)
    }
  }

  return (
    <div>
      <MotoHeader motorcycleId={motorcycleId} />
      <div className="mt-8 max-w-3xl">
        <h2 className="heading text-2xl text-ink">{original ? 'Corrigir registro' : 'Novo registro'}</h2>
        {original ? (
          <div className="mt-3">
            <Notice tone="info" title={`Corrigindo: ${original.title} (${formatDate(original.service_date, 'short')})`}>
              A versão atual continua no histórico, marcada como substituída. Ajuste o que estiver errado e explique o motivo.
            </Notice>
          </div>
        ) : (
          <p className="mt-2 text-muted">
            Sem anexo, o registro aparece como "informado pelo dono". Com nota fiscal, ordem de serviço ou recibo, aparece como "com comprovante".
          </p>
        )}

        <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-6">
          {formError && <Notice tone="error">{formError}</Notice>}

          {original && (
            <TextField
              label="Motivo da correção"
              name="correctionReason"
              maxLength={500}
              placeholder="Ex.: a quilometragem estava errada"
              error={errors.correctionReason}
            />
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField
              label="Categoria"
              name="category"
              value={category}
              onChange={(e) => {
                const c = e.target.value
                setCategory(c)
                const suggestion = CATEGORY_TITLE_SUGGESTION[c as MaintenanceCategory]
                if (!titleTouched && suggestion) setTitle(suggestion)
              }}
              options={CATEGORIES}
              placeholder="Escolha"
              optionLabel={(c) => CATEGORY_LABEL[c as MaintenanceCategory]}
              error={errors.category}
            />
            <TextField
              label="Título"
              name="title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setTitleTouched(true)
              }}
              maxLength={120}
              placeholder="Ex.: Revisão dos 12 mil km"
              error={errors.title}
            />
            <TextField
              label="Data do serviço"
              name="serviceDate"
              type="date"
              max={todayISO()}
              defaultValue={original?.service_date ?? todayISO()}
              error={errors.serviceDate}
            />
            <TextField
              label="Quilometragem (opcional)"
              name="mileage"
              inputMode="numeric"
              defaultValue={original?.mileage?.toString() ?? ''}
              placeholder="Ex.: 12400"
              hint="Também entra no histórico de quilometragem."
              error={errors.mileage}
            />
            <TextField
              label="Oficina (opcional)"
              name="workshopName"
              defaultValue={original?.workshop_name ?? ''}
              maxLength={120}
              placeholder="Ex.: Oficina do Zé"
              error={errors.workshopName}
            />
            <TextField
              label="Valor em R$ (opcional)"
              name="value"
              inputMode="decimal"
              defaultValue={centsToInput(original?.service_value_cents ?? null)}
              placeholder="Ex.: 250,00"
              error={errors.value}
            />
            <TextAreaField
              label="Descrição (opcional)"
              name="description"
              className="sm:col-span-2"
              maxLength={4000}
              defaultValue={original?.description ?? ''}
              placeholder="O que foi feito, o que foi verificado, recomendações."
              error={errors.description}
            />
          </div>

          <fieldset className="border-t border-rule pt-5">
            <legend className="pr-3 font-semibold text-ink">Peças usadas (opcional)</legend>
            {rows.length === 0 && <p className="mt-2 text-sm text-muted">Nenhuma peça adicionada.</p>}
            <ul className="mt-3 flex flex-col gap-4">
              {rows.map((row, index) => (
                <li key={row.key} className="rounded-doc border border-rule bg-sheet p-3">
                  <div className="grid gap-3 sm:grid-cols-[2fr_1.3fr_1.3fr_0.7fr]">
                    <TextField label={`Peça ${index + 1}`} value={row.item_name} onChange={(e) => updateRow(row.key, 'item_name', e.target.value)} placeholder="Ex.: Filtro de óleo" />
                    <TextField label="Fabricante" value={row.brand} onChange={(e) => updateRow(row.key, 'brand', e.target.value)} />
                    <TextField label="Código" value={row.part_number} onChange={(e) => updateRow(row.key, 'part_number', e.target.value)} />
                    <TextField label="Qtd." inputMode="decimal" value={row.quantity} onChange={(e) => updateRow(row.key, 'quantity', e.target.value)} />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    {itemErrors[row.key] ? <p className="text-sm text-danger">{itemErrors[row.key]}</p> : <span />}
                    <Button type="button" variant="quiet" onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}>
                      Remover peça
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            {rows.length < 50 && (
              <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={() => setRows((rs) => [...rs, emptyRow()])}>
                Adicionar peça
              </Button>
            )}
          </fieldset>

          <fieldset className="border-t border-rule pt-5">
            <legend className="pr-3 font-semibold text-ink">Comprovantes (opcional)</legend>
            {original && original.attachments.length > 0 && (
              <p className="mt-2 text-sm text-muted">
                Os {original.attachments.length} comprovantes da versão anterior continuam nela. Anexe aqui o que valer para a correção.
              </p>
            )}
            <div className="mt-3">
              <AttachmentPicker value={pending} onChange={setPending} usage={usage.data} disabled={loading} />
            </div>
          </fieldset>

          <TextAreaField
            label="Observações (opcional)"
            name="notes"
            maxLength={2000}
            rows={2}
            defaultValue={original?.notes ?? ''}
            error={errors.notes}
          />

          <div className="flex flex-wrap items-center gap-3 border-t border-rule pt-6">
            <Button type="submit" loading={loading}>
              {loading ? (pending.length ? 'Salvando e enviando…' : 'Salvando…') : original ? 'Registrar correção' : 'Salvar registro'}
            </Button>
            <Link to={`/painel/motos/${motorcycleId}/historico`} className="px-2 py-2 font-semibold text-ink underline-offset-4 hover:underline">
              Cancelar
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
