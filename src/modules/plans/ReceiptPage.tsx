import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { translateDbError } from '@/core/shared/dbErrors'
import { formatPlanPrice, PERIOD_LABEL } from './api'
import { fetchInvoiceReceipt, INVOICE_STATUS_LABEL } from './billingApi'

const d = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—')

/** Recibo de uma fatura paga (PRD 8.6). Comprovante interno, sem valor fiscal. */
export function ReceiptPage() {
  const { id = '' } = useParams()
  const receipt = useQuery({ queryKey: ['receipt', id], queryFn: () => fetchInvoiceReceipt(id), enabled: Boolean(id), retry: false })

  return (
    <div>
      <div className="print:hidden">
        <Link to="/painel/plano" className="text-sm text-muted underline underline-offset-4">Meu plano</Link>
        <h1 className="heading mt-2 text-3xl text-ink">Recibo</h1>
        {receipt.data && (
          <div className="mt-4">
            <Button variant="secondary" onClick={() => window.print()}>Imprimir ou salvar em PDF</Button>
          </div>
        )}
      </div>
      {receipt.isLoading && <p className="mt-6 text-muted" role="status">Carregando…</p>}
      {receipt.isError && (
        <div className="mt-6 max-w-xl"><Notice tone="error">{translateDbError(receipt.error as { code?: string; message?: string })}</Notice></div>
      )}
      {receipt.data && (() => {
        const r = receipt.data
        return (
          <article className="report-sheet mx-auto mt-8 max-w-[40rem] rounded-sheet border border-rule bg-white p-5 text-sm text-ink sm:p-8 print:mt-0"
            aria-label="Recibo">
            <header className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-ink pb-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">Moto Passaporte · Recibo</p>
                <p className="heading mt-1 text-xl">Nº {r.number}</p>
              </div>
              <p className="rounded-doc bg-paper px-2 py-1 text-xs font-semibold">{INVOICE_STATUS_LABEL[r.status] ?? r.status}</p>
            </header>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div><dt className="text-xs text-muted">Cliente</dt><dd className="font-semibold">{r.customer_name ?? '—'}</dd><dd className="break-all">{r.customer_email}</dd></div>
              <div><dt className="text-xs text-muted">Pago em</dt><dd className="font-semibold">{d(r.paid_at)}</dd></div>
              <div><dt className="text-xs text-muted">Plano</dt><dd className="font-semibold">{r.plan_name} · {PERIOD_LABEL[r.billing_period]}</dd></div>
              <div><dt className="text-xs text-muted">Período</dt><dd className="font-semibold">{d(r.period_start)} a {d(r.period_end)}</dd></div>
              <div><dt className="text-xs text-muted">Valor</dt><dd className="heading text-lg">{formatPlanPrice(r.amount_cents)}</dd></div>
              <div><dt className="text-xs text-muted">Referência do pagamento (Mercado Pago)</dt><dd className="break-all">{r.payment_reference ?? '—'}</dd></div>
            </dl>
            {r.environment === 'test' && <p className="mt-4 font-semibold text-danger">Ambiente de teste — nenhuma cobrança real.</p>}
            <footer className="mt-6 border-t border-rule pt-3 text-xs text-muted">
              Comprovante de pagamento da assinatura do Moto Passaporte. Não é nota fiscal. O comprovante da transação também fica disponível na sua conta
              do Mercado Pago.
            </footer>
          </article>
        )
      })()}
    </div>
  )
}
