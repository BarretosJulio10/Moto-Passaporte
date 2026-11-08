import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { PageHeader } from '@/components/AppLayout'
import { translateDbError } from '@/core/shared/dbErrors'
import { Card, EmptyState, WorkshopShell } from '../shared/WorkshopShell'
import { formatCents } from '../shared/rpc'
import {
  PAY_LABEL, PAY_METHODS, centsCsv, downloadCsv, fetchFinance, formatDay, monthStartIso, todayIso, type Finance,
} from './api'
import { ContactButton } from './widgets'

type Err = { code?: string; message?: string }

/** Financeiro operacional da oficina (PRD 2.1 §15). Não é nota fiscal nem conciliação bancária. */
export function FinancePage() {
  return (
    <WorkshopShell>
      {({ orgId, shop, perms }) => perms.manage_finance
        ? <FinanceView orgId={orgId} workshopName={shop.business_name} />
        : <Notice tone="info" title="Sem acesso ao financeiro">O responsável pela oficina libera essa área por funcionário, em Equipe.</Notice>}
    </WorkshopShell>
  )
}

export function PeriodPicker({ from, to, onChange }: { from: string; to: string; onChange: (v: { from: string; to: string }) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Período">
      <input type="date" aria-label="De" value={from} max={to} onChange={(e) => onChange({ from: e.target.value, to })}
        className="rounded-doc border border-rule bg-sheet px-2 py-1.5" />
      até
      <input type="date" aria-label="Até" value={to} min={from} max={todayIso()} onChange={(e) => onChange({ from, to: e.target.value })}
        className="rounded-doc border border-rule bg-sheet px-2 py-1.5" />
    </div>
  )
}

function FinanceView({ orgId, workshopName }: { orgId: string; workshopName: string }) {
  const [range, setRange] = useState({ from: monthStartIso(), to: todayIso() })
  const q = useQuery({ queryKey: ['ws-finance', orgId, range.from, range.to], queryFn: () => fetchFinance(orgId, range.from, range.to) })
  const f = q.data

  return (
    <div>
      <PageHeader title="Financeiro"
        intro="Recebimentos registrados pela equipe em cada OS. Controle interno: não emite nota fiscal nem movimenta dinheiro."
        actions={f && <Button variant="secondary" onClick={() => exportCsv(f, range)}>Exportar CSV</Button>} />
      <div className="mt-6"><PeriodPicker from={range.from} to={range.to} onChange={setRange} /></div>
      {q.isLoading && <p className="mt-4 text-muted" role="status">Carregando…</p>}
      {q.isError && <div className="mt-4"><Notice tone="error">{translateDbError(q.error as Err)}</Notice></div>}
      {f && (
        <>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Recebido no período" value={formatCents(f.received_cents)} strong />
            <Stat label="A receber (todas as OS)" value={formatCents(f.pending_total_cents)} sub={`${f.receivables.length} OS com saldo`} />
            <Stat label="Concluído no período" value={formatCents(f.completed_cents)} sub="valor final das OS concluídas" />
            <Stat label="Descontos concedidos" value={formatCents(f.discounts_cents)} />
          </ul>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <Card title="Por forma de pagamento">
              <ByMethod f={f} />
            </Card>
            <Card title="Por dia">
              {f.by_day.length === 0 ? <p className="text-sm text-muted">Nenhum recebimento no período.</p> : <ByDay f={f} />}
            </Card>
          </div>

          <Card className="mt-6" title={`A receber (${f.receivables.length})`}>
            {f.receivables.length === 0 ? <p className="text-sm text-muted">Nenhuma OS concluída com saldo em aberto.</p> : (
              <ul className="divide-y divide-rule/70 text-sm">
                {f.receivables.map((r) => (
                  <li key={r.order_id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span className="min-w-0">
                      <Link to={`/oficina/${orgId}/os/${r.order_id}`} className="font-semibold text-ink underline underline-offset-4">OS nº {r.order_number}</Link>
                      {' · '}{r.customer_name} · concluída {formatDay(r.completed_at)}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="tabular-nums"><span className="font-semibold text-amber-800">{formatCents(r.pending_cents)}</span>
                        <span className="text-muted"> de {formatCents(r.due_cents)}</span></span>
                      <ContactButton orgId={orgId} customerId={r.customer_id} customerName={r.customer_name} whatsapp={r.whatsapp}
                        workshopName={workshopName} reason="other" reference={r.order_id}
                        detail={`Sobre a OS nº ${r.order_number}: ficou um saldo de ${formatCents(r.pending_cents)}. Como prefere acertar?`} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="mt-6" title="Recebimentos do período">
            {f.payments.length === 0 ? (
              <EmptyState title="Nada registrado no período">Registre os recebimentos na página de cada OS.</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead><tr className="border-b border-rule text-left text-muted">
                    <th className="py-2 font-semibold">Data</th><th className="py-2 font-semibold">OS</th><th className="py-2 font-semibold">Cliente</th>
                    <th className="py-2 font-semibold">Forma</th><th className="py-2 text-right font-semibold">Valor</th>
                  </tr></thead>
                  <tbody className="divide-y divide-rule/70">
                    {f.payments.map((p) => (
                      <tr key={p.id} className={p.voided_at ? 'text-muted' : ''}>
                        <td className="py-2">{formatDay(p.paid_at)}</td>
                        <td className="py-2"><Link to={`/oficina/${orgId}/os/${p.order_id}`} className="underline underline-offset-4">nº {p.order_number}</Link></td>
                        <td className="py-2">{p.customer_name}</td>
                        <td className="py-2">{PAY_LABEL[p.method]}{p.voided_at ? ' · estornado' : ''}</td>
                        <td className={`py-2 text-right tabular-nums ${p.voided_at ? 'line-through' : 'font-semibold text-ink'}`}>{formatCents(p.amount_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <li className={`rounded-sheet border px-4 py-3 ${strong ? 'border-ink bg-sheet' : 'border-rule bg-sheet'}`}>
      <p className="text-sm text-muted">{label}</p>
      <p className="heading text-2xl tabular-nums text-ink">{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </li>
  )
}

function ByMethod({ f }: { f: Finance }) {
  const rows = PAY_METHODS.map((m) => ({ m, cents: f.by_method[m] ?? 0 })).filter((r) => r.cents > 0)
  if (rows.length === 0) return <p className="text-sm text-muted">Nenhum recebimento no período.</p>
  const max = Math.max(...rows.map((r) => r.cents))
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {rows.sort((a, b) => b.cents - a.cents).map((r) => (
        <li key={r.m}>
          <div className="flex justify-between"><span>{PAY_LABEL[r.m]}</span><span className="tabular-nums font-semibold text-ink">{formatCents(r.cents)}</span></div>
          <div className="mt-1 h-2 rounded-full bg-paper"><div className="h-2 rounded-full bg-ink" style={{ width: `${Math.max(4, (r.cents / max) * 100)}%` }} /></div>
        </li>
      ))}
    </ul>
  )
}

function ByDay({ f }: { f: Finance }) {
  const max = Math.max(...f.by_day.map((d) => d.cents))
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {f.by_day.map((d) => (
        <li key={d.day} className="grid grid-cols-[5.5rem_minmax(0,1fr)_6.5rem] items-center gap-2">
          <span className="text-muted">{formatDay(d.day)}</span>
          <div className="h-2 rounded-full bg-paper"><div className="h-2 rounded-full bg-ink/80" style={{ width: `${Math.max(3, (d.cents / max) * 100)}%` }} /></div>
          <span className="text-right tabular-nums">{formatCents(d.cents)}</span>
        </li>
      ))}
    </ul>
  )
}

function exportCsv(f: Finance, range: { from: string; to: string }) {
  downloadCsv(`recebimentos_${range.from}_${range.to}.csv`, [
    ['Data', 'OS', 'Cliente', 'Forma', 'Valor (R$)', 'Observação', 'Estornado', 'Motivo do estorno'],
    ...f.payments.map((p) => [formatDay(p.paid_at), p.order_number, p.customer_name, PAY_LABEL[p.method], centsCsv(p.amount_cents),
      p.notes, p.voided_at ? 'sim' : 'não', p.void_reason]),
  ])
}
