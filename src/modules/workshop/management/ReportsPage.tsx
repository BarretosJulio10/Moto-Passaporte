import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { PageHeader } from '@/components/AppLayout'
import { translateDbError } from '@/core/shared/dbErrors'
import { Card, WorkshopShell } from '../shared/WorkshopShell'
import { formatCents } from '../shared/rpc'
import { PAY_LABEL, PAY_METHODS, approvalRate, centsCsv, downloadCsv, fetchReports, formatDay, monthStartIso, todayIso, type Reports } from './api'
import { PeriodPicker } from './FinancePage'

type Err = { code?: string; message?: string }

/** Relatórios da oficina (PRD 2.1 §17): comercial, operacional, por mecânico e (com permissão) financeiro. */
export function ReportsPage() {
  return (
    <WorkshopShell>
      {({ orgId, shop, perms }) => perms.manage_quotes || perms.manage_finance
        ? <ReportsView orgId={orgId} workshopName={shop.business_name} />
        : <Notice tone="info">Seu acesso não inclui relatórios.</Notice>}
    </WorkshopShell>
  )
}

function ReportsView({ orgId, workshopName }: { orgId: string; workshopName: string }) {
  const [range, setRange] = useState({ from: monthStartIso(), to: todayIso() })
  const q = useQuery({ queryKey: ['ws-reports', orgId, range.from, range.to], queryFn: () => fetchReports(orgId, range.from, range.to) })
  const r = q.data

  return (
    <div>
      <div className="print:hidden">
        <PageHeader title="Relatórios" intro="Resumo do período para acompanhar a oficina. Imprima ou salve em PDF pelo navegador."
          actions={r && <>
            <Button variant="secondary" onClick={() => window.print()}>Imprimir / PDF</Button>
            <Button variant="secondary" onClick={() => exportCsv(r, range)}>Exportar CSV</Button>
          </>} />
        <div className="mt-6"><PeriodPicker from={range.from} to={range.to} onChange={setRange} /></div>
      </div>
      <div className="hidden print:block">
        <p className="heading text-xl">{workshopName}</p>
        <p className="text-sm">Relatório de {formatDay(range.from)} a {formatDay(range.to)}</p>
      </div>
      {q.isLoading && <p className="mt-4 text-muted" role="status">Carregando…</p>}
      {q.isError && <div className="mt-4"><Notice tone="error">{translateDbError(q.error as Err)}</Notice></div>}
      {r && (
        <div className="mt-6 grid gap-6 xl:grid-cols-2 print:grid-cols-2 print:gap-4">
          <Card title="Comercial">
            <Rows rows={[
              ['Orçamentos criados', r.commercial.created],
              ['Aprovados (total ou parcial)', r.commercial.approved],
              ['Recusados', r.commercial.rejected],
              ['Vencidos', r.commercial.expired],
              ['Taxa de aprovação', `${approvalRate(r.commercial)}%`],
              ['Ticket médio orçado', formatCents(r.commercial.avg_quote_cents)],
              ['Valor aprovado', formatCents(r.commercial.approved_cents)],
            ]} />
          </Card>
          <Card title="Operacional">
            <Rows rows={[
              ['OS concluídas', r.operational.completed],
              ['OS em andamento agora', r.operational.active],
              ['Tempo médio até concluir', r.operational.avg_hours ? `${String(r.operational.avg_hours).replace('.', ',')} h` : '—'],
              ['Itens pendentes em OS abertas', r.operational.pending_items],
            ]} />
          </Card>
          <Card title="Serviços mais feitos">
            {r.top_services.length === 0 ? <p className="text-sm text-muted">Nenhum serviço concluído no período.</p> : (
              <ol className="flex flex-col gap-1.5 text-sm">
                {r.top_services.map((s, i) => (
                  <li key={s.description} className="flex justify-between gap-3">
                    <span className="min-w-0"><span className="text-muted">{i + 1}.</span> {s.description}</span>
                    <span className="shrink-0 tabular-nums text-graphite">{s.count}× · {formatCents(s.cents)}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
          <Card title="Por mecânico">
            {r.by_mechanic.length === 0 ? <p className="text-sm text-muted">Nenhum item executado no período.</p> : (
              <ul className="flex flex-col gap-1.5 text-sm">
                {r.by_mechanic.map((m) => (
                  <li key={m.name} className="flex justify-between gap-3"><span>{m.name}</span>
                    <span className="tabular-nums text-graphite">{m.items_done} ite{m.items_done === 1 ? 'm' : 'ns'} · {formatCents(m.cents)}</span></li>
                ))}
              </ul>
            )}
          </Card>
          {r.financial && (
            <Card title="Financeiro" className="xl:col-span-2 print:col-span-2">
              <div className="grid gap-6 sm:grid-cols-2">
                <Rows rows={[
                  ['Recebido', formatCents(r.financial.received_cents)],
                  ['Concluído (valor final das OS)', formatCents(r.financial.completed_cents)],
                  ['Descontos', formatCents(r.financial.discounts_cents)],
                  ['A receber (todas as OS)', formatCents(r.financial.pending_total_cents)],
                ]} />
                <Rows rows={PAY_METHODS.filter((m) => r.financial?.by_method[m]).map((m) => [PAY_LABEL[m], formatCents(r.financial?.by_method[m] ?? 0)])} empty="Nenhum recebimento." />
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

function Rows({ rows, empty }: { rows: [string, string | number][]; empty?: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted">{empty}</p>
  return (
    <dl className="divide-y divide-rule/70 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 py-1.5"><dt className="text-muted">{k}</dt><dd className="font-semibold tabular-nums text-ink">{v}</dd></div>
      ))}
    </dl>
  )
}

function exportCsv(r: Reports, range: { from: string; to: string }) {
  const rows: (string | number)[][] = [
    ['Relatório', `${formatDay(range.from)} a ${formatDay(range.to)}`],
    [],
    ['Comercial', ''],
    ['Orçamentos criados', r.commercial.created], ['Aprovados', r.commercial.approved], ['Recusados', r.commercial.rejected],
    ['Vencidos', r.commercial.expired], ['Taxa de aprovação (%)', approvalRate(r.commercial)],
    ['Ticket médio orçado (R$)', centsCsv(r.commercial.avg_quote_cents)], ['Valor aprovado (R$)', centsCsv(r.commercial.approved_cents)],
    [],
    ['Operacional', ''],
    ['OS concluídas', r.operational.completed], ['OS em andamento', r.operational.active], ['Tempo médio (h)', String(r.operational.avg_hours).replace('.', ',')],
    [],
    ['Serviço', 'Quantidade', 'Valor (R$)'],
    ...r.top_services.map((s) => [s.description, s.count, centsCsv(s.cents)]),
    [],
    ['Mecânico', 'Itens', 'Valor (R$)'],
    ...r.by_mechanic.map((m) => [m.name, m.items_done, centsCsv(m.cents)]),
  ]
  if (r.financial) {
    rows.push([], ['Financeiro', ''], ['Recebido (R$)', centsCsv(r.financial.received_cents)], ['Concluído (R$)', centsCsv(r.financial.completed_cents)],
      ['Descontos (R$)', centsCsv(r.financial.discounts_cents)], ['A receber (R$)', centsCsv(r.financial.pending_total_cents)],
      ...PAY_METHODS.filter((m) => r.financial?.by_method[m]).map((m) => [PAY_LABEL[m], centsCsv(r.financial?.by_method[m])]))
  }
  downloadCsv(`relatorio_${range.from}_${range.to}.csv`, rows)
}
