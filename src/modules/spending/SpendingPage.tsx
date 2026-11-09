import { useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ButtonLink } from '@/components/Button'
import { CheckboxField, SelectField, TextField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { PageHeader } from '@/components/AppLayout'
import { translateDbError } from '@/core/shared/dbErrors'
import { formatDate } from '@/core/shared/format'
import { CATEGORY_LABEL } from '@/modules/maintenance/labels'
import { formatBRL } from '@/modules/maintenance/schemas'
import type { MaintenanceCategory } from '@/modules/maintenance/labels'
import { fetchMotorcycle } from '@/modules/motorcycles/api'
import {
  DEFAULT_FILTERS, PERIODS, fetchSpendingSummary, filtersFromParams, filtersToParams, monthLabel,
  type PeriodKey, type SpendingFilters, type SpendingSummary,
} from './api'

type Err = { code?: string; message?: string }
const SOURCES = [['', 'Todas as origens'], ['owner', 'Informado por mim'], ['document', 'Com comprovante'], ['workshop', 'Confirmado por oficina']] as const

/** /painel/motos/:id/gastos — Controle de Gastos da moto (PRD 2.2, Fase A). */
export function SpendingPage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const f = useMemo(() => filtersFromParams(params), [params])
  const set = (patch: Partial<SpendingFilters>) => setParams(filtersToParams({ ...f, ...patch }), { replace: true })
  const moto = useQuery({ queryKey: ['motorcycle', id], queryFn: () => fetchMotorcycle(id), enabled: Boolean(id) })
  const q = useQuery({ queryKey: ['spending', id, params.toString()], queryFn: () => fetchSpendingSummary(id, f), enabled: Boolean(id) })
  const s = q.data
  const label = moto.data ? `${moto.data.brand} ${moto.data.model}` : 'Moto'

  return (
    <div>
      <Link to={`/painel/motos/${id}`} className="text-sm text-muted underline underline-offset-4">Voltar à moto</Link>
      <PageHeader title={`Gastos · ${label}`}
        intro="Quanto você gastou com a moto, pelos valores informados no histórico. Controle pessoal: não é comprovação fiscal." />

      <Filters f={f} s={s} set={set} />

      {q.isLoading && <p className="mt-6 text-muted" role="status">Calculando…</p>}
      {q.isError && <div className="mt-6"><Notice tone="error">{translateDbError(q.error as Err)}</Notice></div>}
      {s && (
        <>
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Total no período" value={formatBRL(s.total_cents)} sub={`${formatDate(s.from, 'short')} a ${formatDate(s.to, 'short')}`} strong />
            <Stat label="Média por mês" value={s.monthly_average_cents != null ? formatBRL(s.monthly_average_cents) : '—'} sub="total ÷ meses do período" />
            <Stat label="Serviços com valor" value={String(s.entries)} sub={s.missing_values > 0 ? `${s.missing_values} sem valor (fora da soma)` : 'todos com valor'} />
          </ul>
          {s.missing_values > 0 && <MissingNotice s={s} motoId={id} />}
          {s.entitled ? <Insights s={s} f={f} motoId={id} set={set} /> : <Locked />}
        </>
      )}
    </div>
  )
}

function Filters({ f, s, set }: { f: SpendingFilters; s?: SpendingSummary; set: (p: Partial<SpendingFilters>) => void }) {
  const cats = s?.filters.categories ?? []
  const shops = s?.filters.workshops ?? []
  return (
    <section aria-label="Filtros" className="mt-6 rounded-sheet border border-rule bg-sheet p-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <SelectField label="Período" value={f.period} options={PERIODS.map(([k]) => k)} optionLabel={(k) => PERIODS.find(([x]) => x === k)?.[1] ?? k}
          onChange={(e) => set({ period: e.target.value as PeriodKey })} />
        <SelectField label="Categoria" value={f.category} options={['', ...new Set([...(f.category ? [f.category] : []), ...cats])]}
          optionLabel={(c) => (c ? CATEGORY_LABEL[c as MaintenanceCategory] ?? c : 'Todas')} onChange={(e) => set({ category: e.target.value as MaintenanceCategory | '' })} />
        <SelectField label="Oficina" value={f.workshop} options={['', '__none__', ...new Set([...(f.workshop && f.workshop !== '__none__' ? [f.workshop] : []), ...shops])]}
          optionLabel={(w) => (w === '' ? 'Todas' : w === '__none__' ? 'Feito por mim / sem oficina' : w)} onChange={(e) => set({ workshop: e.target.value })} />
        <SelectField label="Origem" value={f.source} options={SOURCES.map(([k]) => k)} optionLabel={(k) => SOURCES.find(([x]) => x === k)?.[1] ?? k}
          onChange={(e) => set({ source: e.target.value as SpendingFilters['source'] })} />
        {f.period === 'custom' && <>
          <TextField label="De" type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} />
          <TextField label="Até" type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} />
        </>}
      </div>
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

function Stat({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <li className={`rounded-sheet border bg-sheet px-4 py-3 ${strong ? 'col-span-2 border-ink sm:col-span-1' : 'border-rule'}`}>
      <p className="text-sm text-muted">{label}</p>
      <p className="heading text-xl sm:text-2xl tabular-nums text-ink">{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </li>
  )
}

function MissingNotice({ s, motoId }: { s: SpendingSummary; motoId: string }) {
  return (
    <div className="mt-4">
      <Notice tone="info" title={`${s.missing_values} ${s.missing_values === 1 ? 'serviço está' : 'serviços estão'} sem valor`}>
        Eles ficam fora da soma. Para incluir, abra o serviço e use "Corrigir" informando o valor (a correção fica registrada no histórico).
        {s.missing && s.missing.length > 0 && (
          <ul className="mt-2 list-disc pl-5">
            {s.missing.slice(0, 5).map((m) => (
              <li key={m.id}><Link to={`/painel/motos/${motoId}/historico/novo?corrigir=${m.id}`} className="underline underline-offset-4">{m.title}</Link> · {formatDate(m.service_date, 'short')}</li>
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
        No Premium você vê o gasto mês a mês, compara com o ano anterior e separa por categoria (pneus, freios, revisão…) e por oficina.
      </p>
      <ButtonLink className="mt-4" to="/painel/plano">Conhecer o Premium</ButtonLink>
    </section>
  )
}

function Insights({ s, f, motoId, set }: { s: SpendingSummary; f: SpendingFilters; motoId: string; set: (p: Partial<SpendingFilters>) => void }) {
  const months = s.months ?? []
  const cats = s.by_category ?? []
  const shops = s.by_workshop ?? []
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
              <li key={c.category}>
                <button type="button" onClick={() => set({ category: c.category })} className="w-full text-left" title="Filtrar por esta categoria">
                  <span className="flex justify-between gap-3">
                    <span className="text-ink">{CATEGORY_LABEL[c.category] ?? c.category} <span className="text-muted">· {c.count}</span></span>
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
        <h2 id="por-oficina" className="heading text-lg text-ink">Por oficina</h2>
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
        <p className="mt-3 text-xs text-muted">
          <Link to={`/painel/motos/${motoId}/historico`} className="underline underline-offset-4">Ver os serviços na linha do tempo</Link>
        </p>
      </section>
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
