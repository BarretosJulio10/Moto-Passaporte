import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { CheckboxField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { translateDbError } from '@/core/shared/dbErrors'
import { formatDate, formatKm, formatPlate } from '@/core/shared/format'
import { fetchTimeline } from '@/modules/maintenance/api'
import { CATEGORY_LABEL, SOURCE_LABEL } from '@/modules/maintenance/labels'
import { formatBRL } from '@/modules/maintenance/schemas'
import { fetchMileage, fetchMotorcycle } from '@/modules/motorcycles/api'
import { hasEntitlement } from '@/modules/plans/api'
import { useMyPlan } from '@/modules/plans/useMyPlan'
import { fetchMotorcycleAccess } from '@/modules/workshop_access/api'
import { registerReport } from './api'
import { PremiumLink } from '@/modules/plans/PremiumLink'

const KIND_LABEL: Record<string, string> = {
  invoice: 'nota fiscal',
  service_order: 'ordem de serviço',
  receipt: 'recibo',
  photo: 'foto',
  other: 'documento',
}

/** Relatório do histórico para imprimir ou salvar em PDF (PRD 5.9). Não é laudo nem certificado. */
export function ReportPage() {
  const { id = '' } = useParams()
  const plan = useMyPlan()
  const allowed = hasEntitlement(plan.data, 'pdf_reports')
  const moto = useQuery({ queryKey: ['motorcycle', id], queryFn: () => fetchMotorcycle(id), enabled: Boolean(id) })
  const timeline = useQuery({ queryKey: ['timeline', id], queryFn: () => fetchTimeline(id), enabled: Boolean(id) })
  const mileage = useQuery({ queryKey: ['mileage', id], queryFn: () => fetchMileage(id), enabled: Boolean(id) })
  const access = useQuery({ queryKey: ['motorcycle-access', id], queryFn: () => fetchMotorcycleAccess(id), enabled: Boolean(id) })

  const [opts, setOpts] = useState({ plate: true, values: false, attachments: true, notes: false })
  const [stamp, setStamp] = useState<{ reference: string; generated_at: string } | null>(null)
  const [printRequested, setPrintRequested] = useState(false)

  const register = useMutation({
    mutationFn: () => registerReport(id),
    onSuccess: (s) => {
      setStamp(s)
      setPrintRequested(true)
    },
  })

  useEffect(() => {
    if (!printRequested) return
    const t = window.setTimeout(() => {
      window.print()
      setPrintRequested(false)
    }, 150)
    return () => window.clearTimeout(t)
  }, [printRequested])

  const records = useMemo(
    () => (timeline.data ?? []).filter((r) => r.status === 'current' && !r.is_void).sort((a, b) => a.service_date.localeCompare(b.service_date)),
    [timeline.data],
  )
  const readings = useMemo(
    () => {
      const corrected = new Set((mileage.data ?? []).map((m) => m.corrects_record_id).filter(Boolean))
      return (mileage.data ?? []).filter((m) => !corrected.has(m.id)).sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
    },
    [mileage.data],
  )
  const origin = (access.data ?? []).find((a) => a.access_type === 'origin' && a.status === 'approved')
  const workshops = new Set(records.filter((r) => r.workshop_name).map((r) => r.workshop_name))
  const valued = records.filter((r) => r.service_value_cents !== null)
  const valuesTotal = valued.reduce((a, r) => a + (r.service_value_cents ?? 0), 0)
  const valuesByCategory = Object.entries(
    valued.reduce<Record<string, { cents: number; n: number }>>((acc, r) => {
      const c = acc[r.category] ?? { cents: 0, n: 0 }
      acc[r.category] = { cents: c.cents + (r.service_value_cents ?? 0), n: c.n + 1 }
      return acc
    }, {}),
  ).sort((a, b) => b[1].cents - a[1].cents)
  const bySource = records.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.evidence_level]: (acc[r.evidence_level] ?? 0) + 1 }), {})

  if (moto.isLoading || plan.isLoading) return <p className="text-muted" role="status">Carregando…</p>
  if (!moto.data?.id) return <Notice tone="error">Moto não encontrada na sua conta.</Notice>
  const m = moto.data

  if (!allowed) {
    return (
      <div className="max-w-xl">
        <Link to={`/painel/motos/${id}`} className="text-sm text-muted underline underline-offset-4">Voltar à moto</Link>
        <h1 className="heading mt-2 text-3xl text-ink">Relatório em PDF</h1>
        <p className="mt-2 text-muted">
          Um documento organizado com a identificação da moto, a quilometragem documentada e todo o histórico de serviços, pronto para imprimir ou
          enviar a um comprador. Recurso do Premium.
        </p>
        <PremiumLink className="mt-4 inline-block font-semibold text-ink underline underline-offset-4">Conhecer o Premium</PremiumLink>
      </div>
    )
  }

  const year = m.model_year ? `${m.manufacturing_year}/${m.model_year}` : String(m.manufacturing_year)
  const loadingData = timeline.isLoading || mileage.isLoading

  return (
    <div>
      <div className="print:hidden">
        <Link to={`/painel/motos/${id}`} className="text-sm text-muted underline underline-offset-4">Voltar à moto</Link>
        <h1 className="heading mt-2 text-3xl text-ink">Relatório do histórico</h1>
        <p className="mt-1 max-w-2xl text-muted">
          Confira a prévia e clique em “Gerar PDF”. Na janela de impressão, escolha “Salvar como PDF”. Dados pessoais e o chassi nunca entram no
          relatório.
        </p>
        <fieldset className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          <legend className="sr-only">O que incluir</legend>
          <CheckboxField label="Placa" checked={opts.plate} onChange={(e) => setOpts({ ...opts, plate: e.target.checked })} />
          <CheckboxField label="Comprovantes (nomes)" checked={opts.attachments} onChange={(e) => setOpts({ ...opts, attachments: e.target.checked })} />
          <CheckboxField label="Valores dos serviços" checked={opts.values} onChange={(e) => setOpts({ ...opts, values: e.target.checked })} />
          <CheckboxField label="Observações" checked={opts.notes} onChange={(e) => setOpts({ ...opts, notes: e.target.checked })} />
        </fieldset>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={() => register.mutate()} loading={register.isPending} disabled={loadingData}>Gerar PDF</Button>
          {stamp && <span className="text-sm text-muted">Referência {stamp.reference}</span>}
        </div>
        {register.isError && <div className="mt-3 max-w-xl"><Notice tone="error">{translateDbError(register.error as { code?: string; message?: string })}</Notice></div>}
      </div>

      <article className="report-sheet mx-auto mt-8 max-w-[52rem] rounded-sheet border border-rule bg-white p-4 text-[13px] sm:p-8 leading-relaxed text-ink shadow-sm print:mt-0"
        aria-label="Prévia do relatório">
        <header className="flex items-start justify-between gap-4 border-b-2 border-ink pb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Moto Passaporte · Relatório do histórico</p>
            <h2 className="heading mt-1 text-2xl text-ink">{m.brand} {m.model}{m.version ? ` ${m.version}` : ''}</h2>
          </div>
          <div className="text-right text-xs text-muted">
            <p>Gerado em {stamp ? new Date(stamp.generated_at).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR')}</p>
            <p>Referência {stamp?.reference ?? '— (definida ao gerar)'}</p>
          </div>
        </header>

        <section className="report-break-avoid mt-4" aria-label="Identificação">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
            <div><dt className="text-xs text-muted">Ano</dt><dd className="font-semibold">{year}</dd></div>
            <div><dt className="text-xs text-muted">Cilindrada</dt><dd className="font-semibold">{m.displacement_cc ? `${m.displacement_cc} cm³` : '—'}</dd></div>
            <div><dt className="text-xs text-muted">Cor</dt><dd className="font-semibold">{m.color ?? '—'}</dd></div>
            {opts.plate && <div><dt className="text-xs text-muted">Placa</dt><dd className="font-semibold">{formatPlate(m.current_plate)}</dd></div>}
            <div><dt className="text-xs text-muted">Passaporte criado em</dt><dd className="font-semibold">{formatDate(m.passport_created_at, 'short')}</dd></div>
            <div><dt className="text-xs text-muted">Última leitura</dt><dd className="font-semibold">{formatKm(m.latest_mileage)}</dd></div>
            <div className="col-span-2">
              <dt className="text-xs text-muted">Oficina de Origem</dt>
              <dd className="font-semibold">
                {origin ? `${origin.workshop_name}${origin.workshop_city ? ` — ${origin.workshop_city}/${origin.workshop_state ?? ''}` : ''}` : 'Não definida'}
              </dd>
            </div>
          </dl>
        </section>

        <section className="report-break-avoid mt-5 rounded-doc bg-paper p-3" aria-label="Resumo">
          <p className="font-semibold">Resumo</p>
          <p className="mt-1">
            {records.length} {records.length === 1 ? 'registro' : 'registros'} no histórico · {bySource.workshop ?? 0} confirmado(s) por oficina ·{' '}
            {bySource.document ?? 0} com comprovante · {bySource.owner ?? 0} informado(s) pelo dono · {workshops.size}{' '}
            {workshops.size === 1 ? 'oficina' : 'oficinas'} · {readings.length} {readings.length === 1 ? 'leitura' : 'leituras'} de quilometragem
          </p>
        </section>

        {opts.values && valued.length > 0 && (
          <section className="report-break-avoid mt-6" aria-label="Valores dos serviços">
            <h3 className="heading text-lg">Valores dos serviços</h3>
            <p className="mt-1">
              Total informado: <strong>{formatBRL(valuesTotal)}</strong> em {valued.length} {valued.length === 1 ? 'serviço' : 'serviços'}
              {records.length > valued.length ? ` (${records.length - valued.length} sem valor informado)` : ''}.
            </p>
            <table className="mt-2 w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-rule text-xs text-muted">
                  <th className="py-1 pr-3 font-semibold">Categoria</th>
                  <th className="py-1 pr-3 font-semibold">Serviços</th>
                  <th className="py-1 pr-3 text-right font-semibold">Valor</th>
                </tr>
              </thead>
              <tbody>
                {valuesByCategory.map(([cat, v]) => (
                  <tr key={cat} className="border-b border-rule/60">
                    <td className="py-1 pr-3">{CATEGORY_LABEL[cat as keyof typeof CATEGORY_LABEL] ?? cat}</td>
                    <td className="py-1 pr-3">{v.n}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{formatBRL(v.cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-xs text-muted">Valores informados no histórico (vigentes, sem anulados). Despesas pessoais do dono não entram no relatório.</p>
          </section>
        )}

        {readings.length > 0 && (
          <section className="mt-6" aria-label="Quilometragem documentada">
            <h3 className="heading text-lg">Quilometragem documentada</h3>
            <table className="mt-2 w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-rule text-xs text-muted">
                  <th className="py-1 pr-3 font-semibold">Data</th>
                  <th className="py-1 pr-3 font-semibold">Quilometragem</th>
                  <th className="py-1 pr-3 font-semibold">Origem</th>
                </tr>
              </thead>
              <tbody>
                {readings.map((r) => (
                  <tr key={r.id} className="border-b border-rule/60">
                    <td className="py-1 pr-3">{formatDate(r.recorded_at, 'short')}</td>
                    <td className="py-1 pr-3">{formatKm(r.mileage)}{r.below_previous ? ' (abaixo da anterior)' : ''}</td>
                    <td className="py-1 pr-3">{SOURCE_LABEL[r.source_type]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className="mt-6" aria-label="Linha do tempo">
          <h3 className="heading text-lg">Linha do tempo</h3>
          {loadingData && <p className="mt-2 text-muted">Carregando…</p>}
          {!loadingData && records.length === 0 && <p className="mt-2 text-muted">Nenhum serviço registrado.</p>}
          <ol className="mt-2 space-y-3">
            {records.map((r) => (
              <li key={r.id} className="report-break-avoid border-l-2 border-rule pl-3">
                <p className="font-semibold">
                  {formatDate(r.service_date, 'short')} · {r.title}
                  <span className="font-normal text-muted"> · {CATEGORY_LABEL[r.category]}{r.mileage !== null ? ` · ${formatKm(r.mileage)}` : ''}</span>
                </p>
                <p className="text-xs text-muted">
                  {SOURCE_LABEL[r.evidence_level]}
                  {r.workshop_name ? ` · ${r.workshop_name}` : ''}
                  {opts.values && r.service_value_cents !== null ? ` · ${formatBRL(r.service_value_cents)}` : ''}
                  {r.corrects_record_id ? ' · corrige um registro anterior' : ''}
                </p>
                {r.description && <p className="mt-0.5">{r.description}</p>}
                {r.items.length > 0 && (
                  <p className="mt-0.5 text-xs">
                    Itens: {r.items.map((i) => `${i.item_name}${i.brand ? ` (${i.brand})` : ''}${i.quantity !== 1 ? ` ×${i.quantity}` : ''}`).join('; ')}
                  </p>
                )}
                {opts.notes && r.notes && <p className="mt-0.5 text-xs">Obs.: {r.notes}</p>}
                {opts.attachments && r.attachments.length > 0 && (
                  <p className="mt-0.5 text-xs text-muted">
                    Comprovantes: {r.attachments.map((a) => `${a.file_name} (${KIND_LABEL[a.kind] ?? 'documento'})`).join('; ')}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </section>

        <footer className="report-break-avoid mt-8 border-t border-rule pt-3 text-xs text-muted">
          <p>
            Este relatório reúne o que foi registrado no Moto Passaporte e indica a origem de cada informação. Registros “informados pelo dono” não
            foram verificados por terceiros. Não é laudo, perícia, vistoria nem certificado oficial e não substitui a consulta aos órgãos de trânsito.
          </p>
          <p className="mt-1 break-all">Passaporte público: {window.location.origin}/p/{m.public_id}</p>
        </footer>
      </article>
    </div>
  )
}
