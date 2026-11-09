import { useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ButtonLink } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { SelectField, TextField, CheckboxField } from '@/components/Field'
import { translateDbError } from '@/core/shared/dbErrors'
import { MotoHeader } from '@/modules/motorcycles/MotoHeader'
import { CATEGORIES, CATEGORY_LABEL, SOURCE_LABEL, type MaintenanceCategory, type RecordSource } from './labels'
import { applyFilters, EMPTY_FILTERS, fetchMyVault, fetchTimeline, voidMaintenanceRecord, type TimelineFilters } from './api'
import { TimelineEntryCard } from './TimelineEntryCard'
import { formatBRL } from './schemas'
import { timelineToSpendingQuery, timelineTotal } from '@/modules/spending/api'
import { getStorageUsage, uploadAll } from '@/modules/attachments/api'
import type { PendingAttachment } from '@/modules/attachments/AttachmentPicker'
import { PremiumLink } from '@/modules/plans/PremiumLink'

const SOURCES = Object.keys(SOURCE_LABEL) as RecordSource[]

export function TimelinePage() {
  const { id = '' } = useParams()
  const location = useLocation()
  const saved = (location.state as { saved?: 'created' | 'corrected'; below?: boolean; attachFailures?: string[] } | null) ?? null
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState<TimelineFilters>(EMPTY_FILTERS)

  const timeline = useQuery({ queryKey: ['timeline', id], queryFn: () => fetchTimeline(id), enabled: Boolean(id) })
  const usage = useQuery({ queryKey: ['storage-usage'], queryFn: getStorageUsage, retry: false })
  const vault = useQuery({ queryKey: ['my-vault'], queryFn: fetchMyVault, retry: false })

  const all = timeline.data ?? []
  const byId = useMemo(() => new Map(all.map((e) => [e.id, e])), [all])
  const successorOf = useMemo(() => {
    const m = new Map<string, (typeof all)[number]>()
    for (const e of all) if (e.corrects_record_id) m.set(e.corrects_record_id, e)
    return m
  }, [all])
  const workshops = useMemo(
    () => Array.from(new Set(all.map((e) => e.workshop_name).filter((w): w is string => Boolean(w)))).sort(),
    [all],
  )
  const visible = applyFilters(all, filters)
  const lockedCount = all.filter((e) => e.locked && e.status === 'current' && !e.is_void).length
  const filtered = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS)
  const total = timelineTotal(visible)
  const spendingLink = `/painel/motos/${id}/gastos${timelineToSpendingQuery(filters)}`

  // Agrupa por ano para leitura rápida da trajetória.
  const groups = useMemo(() => {
    const map = new Map<string, typeof visible>()
    for (const e of visible) {
      const year = e.service_date.slice(0, 4)
      map.set(year, [...(map.get(year) ?? []), e])
    }
    return Array.from(map.entries())
  }, [visible])

  async function handleVoid(recordId: string, reason: string) {
    try {
      await voidMaintenanceRecord(recordId, reason)
    } catch (error) {
      throw new Error(translateDbError(error as { code?: string; message?: string }))
    }
    await queryClient.invalidateQueries({ queryKey: ['timeline', id] })
  }

  async function handleAttach(recordId: string, pending: PendingAttachment[]) {
    const failures = await uploadAll(id, { maintenanceRecordId: recordId }, pending)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['timeline', id] }),
      queryClient.invalidateQueries({ queryKey: ['storage-usage'] }),
    ])
    return failures
  }

  const set = <K extends keyof TimelineFilters>(key: K, value: TimelineFilters[K]) => setFilters((f) => ({ ...f, [key]: value }))

  return (
    <div>
      <MotoHeader motorcycleId={id} />

      {saved && (
        <div className="mt-6">
          <Notice tone={saved.below ? 'info' : 'success'} title={saved.saved === 'corrected' ? 'Correção registrada' : 'Registro adicionado'}>
            {saved.below
              ? 'A quilometragem informada é menor que uma leitura anterior. Confira o valor; se estiver errado, corrija o registro.'
              : saved.saved === 'corrected'
                ? 'O registro anterior continua no histórico, marcado como substituído.'
                : 'O serviço já aparece na linha do tempo.'}
          </Notice>
          {saved.attachFailures && saved.attachFailures.length > 0 && (
            <div className="mt-3">
              <Notice tone="error" title="Alguns comprovantes não foram enviados">
                <ul>{saved.attachFailures.map((m) => <li key={m}>{m}</li>)}</ul>
                <p className="mt-1">Use "Anexar comprovante" no registro para tentar de novo.</p>
              </Notice>
            </div>
          )}
        </div>
      )}

      {timeline.isSuccess && lockedCount > 0 && (
        <div className="mt-6">
          <Notice tone="info" title={`${lockedCount} ${lockedCount === 1 ? 'registro está' : 'registros estão'} no cofre`}>
            No plano gratuito, só os {vault.data?.open_records ?? 2} registros mais recentes de cada moto mostram detalhes e comprovantes.
            Os demais estão guardados e seguros, e você pode exportar tudo em Minha conta.{' '}
            <PremiumLink>Abrir o histórico completo com o Premium</PremiumLink>
          </Notice>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted">
          {timeline.isSuccess && `${visible.length} ${visible.length === 1 ? 'registro' : 'registros'}${filtered ? ' com os filtros escolhidos' : ''}`}
          {timeline.isSuccess && total.withValue > 0 && <> · <span className="font-semibold text-ink">{formatBRL(total.cents)}</span></>}
          {timeline.isSuccess && total.missing > 0 && <span className="text-sm"> ({total.missing} sem valor)</span>}
          {timeline.isSuccess && total.withValue > 0 && <> · <Link to={spendingLink} className="text-sm font-semibold text-ink underline underline-offset-4">Ver gastos</Link></>}
        </p>
        <ButtonLink to={`/painel/motos/${id}/historico/novo`}>Adicionar registro</ButtonLink>
      </div>

      {all.length > 0 && (
        <details className="mt-5 rounded-doc border border-rule bg-sheet p-4" open={filtered}>
          <summary className="cursor-pointer font-semibold text-ink">Filtrar</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <SelectField
              label="Categoria"
              value={filters.category}
              onChange={(e) => set('category', e.target.value as MaintenanceCategory | '')}
              options={CATEGORIES}
              placeholder="Todas"
              optionLabel={(c) => CATEGORY_LABEL[c as MaintenanceCategory]}
            />
            <SelectField
              label="Origem"
              value={filters.source}
              onChange={(e) => set('source', e.target.value as RecordSource | '')}
              options={SOURCES}
              placeholder="Todas"
              optionLabel={(s) => SOURCE_LABEL[s as RecordSource]}
            />
            <SelectField
              label="Oficina"
              value={filters.workshop}
              onChange={(e) => set('workshop', e.target.value)}
              options={workshops}
              placeholder="Todas"
            />
            <TextField label="De" type="date" value={filters.from} onChange={(e) => set('from', e.target.value)} />
            <TextField label="Até" type="date" value={filters.to} onChange={(e) => set('to', e.target.value)} />
            <div className="flex items-end pb-2.5">
              <CheckboxField
                label="Mostrar versões corrigidas e anuladas"
                checked={filters.showSuperseded}
                onChange={(e) => set('showSuperseded', e.target.checked)}
              />
            </div>
          </div>
          {filtered && (
            <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className="mt-3 text-sm font-semibold text-ink underline underline-offset-4">
              Limpar filtros
            </button>
          )}
        </details>
      )}

      <div className="mt-8">
        {timeline.isLoading && <p className="text-muted" role="status">Carregando histórico…</p>}
        {timeline.isError && <Notice tone="error">Não foi possível carregar o histórico. Recarregue a página.</Notice>}
        {timeline.isSuccess && all.length === 0 && (
          <div className="rounded-sheet border border-dashed border-rule bg-sheet p-8">
            <p className="font-semibold text-ink">Nenhum registro ainda.</p>
            <p className="mt-1 text-muted">Adicione a última revisão, troca de óleo ou peça trocada. Quanto mais completo, mais valor o histórico tem na venda.</p>
          </div>
        )}
        {timeline.isSuccess && all.length > 0 && visible.length === 0 && (
          <p className="text-muted">Nenhum registro com esses filtros.</p>
        )}
        {groups.map(([year, entries]) => (
          <section key={year} aria-labelledby={`ano-${year}`} className="mb-10">
            <h2 id={`ano-${year}`} className="heading mb-4 text-2xl text-ink">{year}</h2>
            <ol className="relative flex flex-col gap-4 border-l-2 border-rule pl-5">
              {entries.map((e) => (
                <li key={e.id} className="relative">
                  <span aria-hidden="true" className="absolute -left-[1.6rem] top-5 h-3 w-3 rounded-full border-2 border-paper bg-ink" />
                  <TimelineEntryCard
                    entry={e}
                    successor={successorOf.get(e.id)}
                    original={e.corrects_record_id ? byId.get(e.corrects_record_id) : undefined}
                    onVoid={handleVoid}
                    onAttach={handleAttach}
                    usage={usage.data}
                  />
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  )
}
