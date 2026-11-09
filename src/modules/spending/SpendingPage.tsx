import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button, ButtonLink } from '@/components/Button'
import { CheckboxField, SelectField, TextField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { PageHeader } from '@/components/AppLayout'
import { translateDbError } from '@/core/shared/dbErrors'
import { formatDate, formatKm } from '@/core/shared/format'
import { formatBRL } from '@/modules/maintenance/schemas'
import { fetchMyMotorcycles } from '@/modules/motorcycles/api'
import {
  DEFAULT_FILTERS, PERIODS, categoryLabel, fetchSpendingEntries, fetchSpendingSnapshot, fetchSpendingSummary, filtersFromParams,
  filtersToParams, formatPerKm, monthLabel, type PeriodKey, type SpendingFilters, type SpendingSummary,
} from './api'
import { EntryList, ExpenseForm } from './Expenses'

type Err = { code?: string; message?: string }
const SOURCES = [['', 'Todas as origens'], ['owner', 'Informado por mim'], ['document', 'Com comprovante'], ['workshop', 'Confirmado por oficina']] as const
const KINDS = [['', 'Tudo'], ['service', 'Serviços'], ['expense', 'Despesas avulsas']] as const

/** /painel/motos/:id/gastos — Controle de Gastos da moto (PRD 2.2). */
export function SpendingPage() {
  const { id = '' } = useParams()
  return <SpendingView motoId={id} />
}

/** /painel/gastos — todas as motos juntas (RF-08). */
export function AllSpendingPage() {
  return <SpendingView motoId={null} />
}

function SpendingView({ motoId }: { motoId: string | null }) {
  const [params, setParams] = useSearchParams()
  const [adding, setAdding] = useState(false)
  const f = useMemo(() => filtersFromParams(params), [params])
  const set = (patch: Partial<SpendingFilters>) => setParams(filtersToParams({ ...f, ...patch }), { replace: true })
  const key = motoId ?? 'all'
  const motosQ = useQuery({ queryKey: ['my-motorcycles'], queryFn: fetchMyMotorcycles })
  const q = useQuery({ queryKey: ['spending', key, params.toString()], queryFn: () => fetchSpendingSummary(motoId, f) })
  const entriesQ = useQuery({ queryKey: ['spending-entries', key, params.toString()], queryFn: () => fetchSpendingEntries(motoId, f) })
  const snap = useQuery({ queryKey: ['spending-snapshot', key], queryFn: () => fetchSpendingSnapshot(motoId) })
  const motos = (motosQ.data ?? []).map((m) => ({ id: m.id as string, label: `${m.brand} ${m.model}` }))
  const s = q.data
  const label = motoId ? motos.find((m) => m.id === motoId)?.label ?? 'Moto' : 'Todas as motos'
  const back = motoId ? `/painel/motos/${motoId}` : '/painel'

  return (
    <div>
      <Link to={back} className="text-sm text-muted underline underline-offset-4">{motoId ? 'Voltar à moto' : 'Voltar ao painel'}</Link>
      <PageHeader title={motoId ? `Gastos · ${label}` : 'Gastos de todas as motos'}
        intro="Quanto você gastou, somando os valores do histórico e as despesas avulsas que você lançou. Controle pessoal: não é comprovação fiscal." />

      <Filters f={f} s={s} set={set} />

      {q.isLoading && <p className="mt-6 text-muted" role="status">Calculando…</p>}
      {q.isError && <div className="mt-6"><Notice tone="error">{translateDbError(q.error as Err)}</Notice></div>}
      {s && (
        <>
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <Stat label="Total no período" value={formatBRL(s.total_cents)} strong
              sub={(s.service_cents ?? 0) > 0 && (s.expense_cents ?? 0) > 0
                ? `serviços ${formatBRL(s.service_cents)} · despesas ${formatBRL(s.expense_cents)}`
                : `${formatDate(s.from, 'short')} a ${formatDate(s.to, 'short')}`} />
            <Stat label="Média por mês" value={s.monthly_average_cents != null ? formatBRL(s.monthly_average_cents) : '—'} sub="total ÷ meses do período" />
            <Stat label="Lançamentos com valor" value={String(s.entries)} sub={s.missing_values > 0 ? `${s.missing_values} serviço${s.missing_values === 1 ? '' : 's'} sem valor` : 'todos com valor'} />
            {s.entitled && <>
              <Stat label="Custo por km" value={s.cost_per_km_cents != null ? formatPerKm(s.cost_per_km_cents) : 'Dados insuficientes'}
                sub={s.km != null ? `total ÷ ${formatKm(s.km)} rodados no período` : 'precisa de 2 leituras de km e 100 km rodados no período'} small={s.cost_per_km_cents == null} />
              <Stat label="Projeção do ano" value={s.year_projection_cents != null ? formatBRL(s.year_projection_cents) : '—'}
                sub={s.year_projection_cents != null ? `estimativa pelo ritmo de ${new Date().getFullYear()} (${formatBRL(s.year_to_date_cents)} até hoje)` : 'disponível a partir de abril'} />
            </>}
          </ul>
          {s.missing_values > 0 && <MissingNotice s={s} />}
          {s.entitled ? <Insights s={s} f={f} set={set} /> : <Locked />}
        </>
      )}

      <section className="mt-6 rounded-sheet border border-rule bg-sheet p-4 sm:p-5" aria-labelledby="lancamentos">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="lancamentos" className="heading text-lg text-ink">Lançamentos</h2>
          {!adding && motos.length > 0 && <Button size="sm" onClick={() => setAdding(true)}>Lançar despesa</Button>}
        </div>
        {adding && (
          <div className="mt-3">
            <ExpenseForm motos={motos} motoId={motoId} left={snap.data?.expenses_left_this_month} onDone={() => setAdding(false)} />
          </div>
        )}
        {entriesQ.isError && <div className="mt-3"><Notice tone="error">{translateDbError(entriesQ.error as Err)}</Notice></div>}
        {entriesQ.data && <EntryList entries={entriesQ.data} motos={motos} motoId={motoId} showMoto={!motoId} />}
      </section>
    </div>
  )
}

function Filters({ f, s, set }: { f: SpendingFilters; s?: SpendingSummary; set: (p: Partial<SpendingFilters>) => void }) {
  const cats = s?.filters.categories ?? []
  const shops = s?.filters.workshops ?? []
  return (
    <section aria-label="Filtros" className="mt-6 rounded-sheet border border-rule bg-sheet p-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <SelectField label="Período" value={f.period} options={PERIODS.map(([k]) => k)} optionLabel={(k) => PERIODS.find(([x]) => x === k)?.[1] ?? k}
          onChange={(e) => set({ period: e.target.value as PeriodKey })} />
        <SelectField label="Tipo" value={f.kind} options={KINDS.map(([k]) => k)} optionLabel={(k) => KINDS.find(([x]) => x === k)?.[1] ?? k}
          onChange={(e) => set({ kind: e.target.value as SpendingFilters['kind'] })} />
        <SelectField label="Categoria" value={f.category} options={['', ...new Set([...(f.category ? [f.category] : []), ...cats])]}
          optionLabel={(c) => (c ? categoryLabel(c) : 'Todas')} onChange={(e) => set({ category: e.target.value as SpendingFilters['category'] })} />
        <SelectField label="Oficina" value={f.workshop} options={['', '__none__', ...new Set([...(f.workshop && f.workshop !== '__none__' ? [f.workshop] : []), ...shops])]}
          optionLabel={(w) => (w === '' ? 'Todas' : w === '__none__' ? 'Feito por mim / sem oficina' : w)} onChange={(e) => set({ workshop: e.target.value })} />
        <SelectField label="Origem" value={f.source} options={SOURCES.map(([k]) => k)} optionLabel={(k) => SOURCES.find(([x]) => x === k)?.[1] ?? k}
          onChange={(e) => set({ source: e.target.value as SpendingFilters['source'] })} />
        {f.period === 'custom' && <>
          <TextField label="De" type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} />
          <TextField label="Até" type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} />
        </>}
      </div>
      {(f.workshop || f.source) && f.kind !== 'service' && (
        <p className="mt-2 text-xs text-muted">Com filtro de oficina ou origem, só entram serviços do histórico (despesas avulsas não têm oficina nem origem).</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        {s?.ownership_start && (
          <CheckboxField label={`Incluir o histórico de antes da compra (${formatDate(s.ownership_start, 'short')})`} checked={f.scope === 'all'}
            onChange={(e) => set({ scope: e.target.checked ? 'all' : 'ownership' })} />
        )}
        {s?.entitled && <CheckboxField label="Comparar com o ano anterior" checked={f.compare} onChange={(e) => set({ compare: e.target.checked })} />}
        {JSON.stringify(f) !== JSON.stringify(DEFAULT_FILTERS) && (
          <button type="button" className="text-sm font-semibold text-ink underline underline-offset-4" onClick={() => set(DEFAULT_FILTERS)}>Limpar filtros</button>
        )}
      </div>
    </section>
  )
}

function Stat({ label, value, sub, strong, small }: { label: string; value: string; sub?: string; strong?: boolean; small?: boolean }) {
  return (
    <li className={`rounded-sheet border bg-sheet px-4 py-3 ${strong ? 'col-span-2 border-ink sm:col-span-1' : 'border-rule'}`}>
      <p className="text-sm text-muted">{label}</p>
      <p className={`heading tabular-nums text-ink ${small ? 'text-base' : 'text-xl sm:text-2xl'}`}>{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </li>
  )
}

function MissingNotice({ s }: { s: SpendingSummary }) {
  return (
    <div className="mt-4">
      <Notice tone="info" title={`${s.missing_values} ${s.missing_values === 1 ? 'serviço está' : 'serviços estão'} sem valor`}>
        Eles ficam fora da soma. Para incluir, abra o serviço e use "Corrigir" informando o valor (a correção fica registrada no histórico).
        {s.missing && s.missing.length > 0 && (
          <ul className="mt-2 list-disc pl-5">
            {s.missing.slice(0, 5).map((m) => (
              <li key={m.id}><Link to={`/painel/motos/${m.motorcycle_id}/historico/novo?corrigir=${m.id}`} className="underline underline-offset-4">{m.title}</Link> · {formatDate(m.service_date, 'short')}</li>
            ))}
          </ul>
        )}
      </Notice>
    </div>
  )
}

function Locked() {
  return (
    <section className="mt-6 rounded-sheet border border-dashed border-rule bg-sheet p-6">
      <h2 className="heading text-xl text-ink">Veja para onde vai o dinheiro</h2>
      <p className="mt-2 max-w-2xl text-graphite">
        No Premium você vê o gasto mês a mês, compara com o ano anterior, separa por categoria e por oficina, calcula o custo por km, a projeção do ano e soma todas as motos.
      </p>
      <ButtonLink className="mt-4" to="/painel/plano">Conhecer o Premium</ButtonLink>
    </section>
  )
}

function Insights({ s, f, set }: { s: SpendingSummary; f: SpendingFilters; set: (p: Partial<SpendingFilters>) => void }) {
  const months = s.months ?? []
  const cats = s.by_category ?? []
  const shops = s.by_workshop ?? []
  const bikes = s.by_motorcycle ?? []
  const catTotal = cats.reduce((a, c) => a + c.cents, 0)
  return (
    <div className="mt-6 grid gap-6 xl:grid-cols-2">
      <section className="rounded-sheet border border-rule bg-sheet p-4 sm:p-5 xl:col-span-2" aria-labelledby="mes-a-mes">
        <h2 id="mes-a-mes" className="heading text-lg text-ink">Mês a mês</h2>
        {months.length === 0 || s.total_cents === 0 ? <p className="mt-2 text-sm text-muted">Nenhum gasto com valor no período.</p>
          : <MonthChart months={months} compare={f.compare} />}
      </section>

      <section className="rounded-sheet border border-rule bg-sheet p-4 sm:p-5" aria-labelledby="por-categoria">
        <h2 id="por-categoria" className="heading text-lg text-ink">Por categoria</h2>
        {cats.length === 0 ? <p className="mt-2 text-sm text-muted">Nada no período.</p> : (
          <ul className="mt-3 flex flex-col gap-3 text-sm">
            {cats.map((c) => (
              <li key={`${c.kind}-${c.category}`}>
                <button type="button" onClick={() => set({ category: c.category })} className="w-full text-left" title="Filtrar por esta categoria">
                  <span className="flex justify-between gap-3">
                    <span className="text-ink">{categoryLabel(c.category)}{c.kind === 'expense' && <span className="text-muted"> (despesa)</span>} <span className="text-muted">· {c.count}</span></span>
                    <span className="tabular-nums"><span className="font-semibold text-ink">{formatBRL(c.cents)}</span>
                      <span className="text-muted"> · {Math.round((c.cents / Math.max(1, catTotal)) * 100)}%</span></span>
                  </span>
                  <span className="mt-1 block h-2 rounded-full bg-paper"><span className="block h-2 rounded-full bg-ink" style={{ width: `${Math.max(2, (c.cents / Math.max(1, cats[0]?.cents ?? 1)) * 100)}%` }} /></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-sheet border border-rule bg-sheet p-4 sm:p-5" aria-labelledby="por-oficina">
        <h2 id="por-oficina" className="heading text-lg text-ink">Por oficina <span className="text-sm font-normal text-muted">(serviços)</span></h2>
        {shops.length === 0 ? <p className="mt-2 text-sm text-muted">Nada no período.</p> : (
          <ul className="mt-2 divide-y divide-rule/70 text-sm">
            {shops.map((w) => (
              <li key={w.workshop ?? '__none__'} className="flex items-center justify-between gap-3 py-2">
                <button type="button" className="min-w-0 text-left text-ink underline-offset-4 hover:underline" onClick={() => set({ workshop: w.workshop ?? '__none__' })}>
                  {w.workshop ?? 'Feito por mim / sem oficina'} <span className="text-muted">· {w.count} serviço{w.count === 1 ? '' : 's'}</span>
                </button>
                <span className="font-semibold tabular-nums text-ink">{formatBRL(w.cents)}</span>
              </li>
            ))}
          </ul>
        )}

      </section>

      {bikes.length > 1 && (
        <section className="rounded-sheet border border-rule bg-sheet p-4 sm:p-5 xl:col-span-2" aria-labelledby="por-moto">
          <h2 id="por-moto" className="heading text-lg text-ink">Por moto</h2>
          <ul className="mt-2 divide-y divide-rule/70 text-sm">
            {bikes.map((b) => (
              <li key={b.motorcycle_id} className="flex items-center justify-between gap-3 py-2">
                <Link to={`/painel/motos/${b.motorcycle_id}/gastos`} className="min-w-0 text-ink underline-offset-4 hover:underline">
                  {b.label} <span className="text-muted">· {b.count} lançamento{b.count === 1 ? '' : 's'}</span>
                </Link>
                <span className="font-semibold tabular-nums text-ink">{formatBRL(b.cents)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/** Barras por mês em HTML (texto em tamanho normal em qualquer tela); ano anterior em cinza ao lado. */
export function MonthChart({ months, compare }: { months: NonNullable<SpendingSummary['months']>; compare: boolean }) {
  const max = Math.max(1, ...months.map((m) => Math.max(m.cents, compare ? m.previous_cents ?? 0 : 0)))
  const peak = months.reduce((a, m) => (m.cents > a.cents ? m : a), months[0]!)
  const every = Math.ceil(months.length / 12)
  const pct = (v: number) => `${Math.max(v > 0 ? 2 : 0, (v / max) * 100)}%`
  const title = peak.cents > 0 ? `Maior gasto: ${monthLabel(peak.month, true)}, ${formatBRL(peak.cents)}` : 'Gastos por mês'
  return (
    <figure className="mt-2">
      <p className="text-sm text-graphite">{title}</p>
      <ul className="mt-3 flex h-48 items-end gap-0.5 border-b border-rule sm:h-56 sm:gap-2" aria-label="Gasto por mês">
        {months.map((m) => {
          const desc = `${monthLabel(m.month, true)}: ${formatBRL(m.cents)}${compare ? `; ano anterior ${formatBRL(m.previous_cents ?? 0)}` : ''}`
          return (
            <li key={m.month} className="flex h-full min-w-0 flex-1 items-end justify-center gap-0.5" title={desc} aria-label={desc}>
              {compare && <span className="block w-full max-w-6 rounded-t-sm bg-rule" style={{ height: pct(m.previous_cents ?? 0) }} />}
              <span className="flex h-full w-full max-w-10 flex-col justify-end">
                {m.cents > 0 && months.length <= 12 && (
                  <span className="mb-0.5 hidden text-center text-xs tabular-nums text-ink sm:block">{Math.round(m.cents / 100).toLocaleString('pt-BR')}</span>
                )}
                <span className={`block rounded-t-sm ${m === peak && m.cents > 0 ? 'bg-ink' : 'bg-ink/50'}`} style={{ height: pct(m.cents) }} />
              </span>
            </li>
          )
        })}
      </ul>
      <ol className="mt-1 flex gap-0.5 sm:gap-2" aria-hidden="true">
        {months.map((m, i) => (
          <li key={m.month} className="min-w-0 flex-1 text-center text-[10px] leading-tight text-muted sm:text-xs">
            {i % every === 0 ? <><span className="block">{monthLabel(m.month).split('/')[0]}</span><span className="block sm:inline">{every > 1 || i === 0 || m.month.endsWith('-01') ? `/${m.month.slice(2, 4)}` : ''}</span></> : ''}
          </li>
        ))}
      </ol>
      <figcaption className="mt-2 text-xs text-muted">
        Valores em reais, pela data do serviço.{compare ? ' Barra cinza: mesmo mês do ano anterior.' : ''}
      </figcaption>
    </figure>
  )
}
