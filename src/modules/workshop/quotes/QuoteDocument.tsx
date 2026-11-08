import { useEffect, useState, type ReactNode } from 'react'
import { formatDate, formatKm, formatPlate } from '@/core/shared/format'
import { qrSvg } from '@/modules/sharing/qr'
import { formatCents, formatDateTime, formatPhone } from '../shared/rpc'
import { ITEM_KIND_LABEL, type DiscountType, type ItemKind } from './api'

export type DocItem = {
  position: number
  kind: ItemKind
  description: string
  quantity: number
  unit_price_cents: number
  subtotal_cents: number
  notes: string | null
}

export type QuoteDoc = {
  workshop: {
    business_name: string
    cnpj?: string | null
    phone?: string | null
    whatsapp?: string | null
    email?: string | null
    address?: string | null
    city?: string | null
    state?: string | null
    logo_url?: string | null
  }
  number: number
  versionNo: number
  issuedAt: string | null
  validUntil: string
  customerName: string
  customerPhone?: string | null
  vehicle: { brand: string; model: string; version?: string | null; year?: number | null; plate?: string | null; color?: string | null } | null
  km: number | null
  problem: string | null
  diagnosis: string | null
  notes: string | null
  paymentTerms: string | null
  estimatedDays: number | null
  items: DocItem[]
  subtotalCents: number
  discountType: DiscountType
  discountValue: number
  discountCents: number
  totalCents: number
  isComplement?: boolean
  parentNumber?: number | null
  complementReason?: string | null
  authorName?: string | null
}

const brl = formatCents

/** Orçamento profissional (PRD 2.1 §6.3): mesma apresentação na tela, na impressão/PDF e no link do cliente. */
export function QuoteDocument({ doc, approvalUrl, itemMarks, footer }: {
  doc: QuoteDoc
  approvalUrl?: string | null
  /** Situação de cada item depois da resposta do cliente (posição → aprovado?). */
  itemMarks?: Record<number, boolean>
  footer?: ReactNode
}) {
  const [qr, setQr] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    if (approvalUrl) qrSvg(approvalUrl).then((s) => alive && setQr(s)).catch(() => setQr(null))
    else setQr(null)
    return () => { alive = false }
  }, [approvalUrl])

  const w = doc.workshop
  const place = [w.address, [w.city, w.state].filter(Boolean).join('/')].filter(Boolean).join(' · ')
  const contact = [w.whatsapp ? `WhatsApp ${formatPhone(w.whatsapp)}` : null, w.phone && w.phone !== w.whatsapp ? formatPhone(w.phone) : null, w.email]
    .filter(Boolean).join(' · ')

  return (
    <article aria-label={`Orçamento nº ${doc.number}`}
      className="report-sheet mx-auto max-w-[52rem] rounded-sheet border border-rule bg-white p-4 text-[13px] leading-relaxed text-ink shadow-sm sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-ink pb-4">
        <div className="flex min-w-0 items-start gap-3">
          {w.logo_url && <img src={w.logo_url} alt="" className="h-14 w-14 rounded-doc object-contain" />}
          <div className="min-w-0">
            <p className="heading text-xl">{w.business_name}</p>
            {w.cnpj && <p className="text-muted">CNPJ {w.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')}</p>}
            {place && <p className="text-muted">{place}</p>}
            {contact && <p className="text-muted">{contact}</p>}
          </div>
        </div>
        <div className="sm:text-right">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">{doc.isComplement ? 'Orçamento complementar' : 'Orçamento'}</p>
          <p className="heading text-2xl">Nº {doc.number}</p>
          <p className="text-muted">Versão {doc.versionNo}</p>
          <p className="text-muted">Emitido em {doc.issuedAt ? formatDateTime(doc.issuedAt) : 'rascunho'}</p>
          <p className="font-semibold">Válido até {formatDate(doc.validUntil, 'short')}</p>
        </div>
      </header>

      {doc.isComplement && (
        <p className="report-break-avoid mt-4 rounded-doc border border-stamp/30 bg-stamp/5 px-3 py-2">
          Complementa o orçamento nº {doc.parentNumber}. Motivo: {doc.complementReason}. Os itens abaixo precisam de nova aprovação.
        </p>
      )}

      <section className="report-break-avoid mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Cliente</p>
          <p className="font-semibold">{doc.customerName}</p>
          {doc.customerPhone && <p className="text-muted">{formatPhone(doc.customerPhone)}</p>}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Motocicleta</p>
          {doc.vehicle ? (
            <>
              <p className="font-semibold">{[doc.vehicle.brand, doc.vehicle.model, doc.vehicle.version, doc.vehicle.year].filter(Boolean).join(' ')}</p>
              <p className="text-muted">
                {[doc.vehicle.plate ? `Placa ${formatPlate(doc.vehicle.plate)}` : null, doc.vehicle.color, doc.km !== null ? formatKm(doc.km) : null]
                  .filter(Boolean).join(' · ') || '—'}
              </p>
            </>
          ) : <p className="text-muted">Não informada</p>}
        </div>
      </section>

      {(doc.problem || doc.diagnosis) && (
        <section className="report-break-avoid mt-4 grid gap-4 sm:grid-cols-2">
          {doc.problem && <div><p className="text-xs font-semibold uppercase tracking-wider text-muted">Problema relatado</p><p className="whitespace-pre-line">{doc.problem}</p></div>}
          {doc.diagnosis && <div><p className="text-xs font-semibold uppercase tracking-wider text-muted">Diagnóstico</p><p className="whitespace-pre-line">{doc.diagnosis}</p></div>}
        </section>
      )}

      <ul className="mt-5 divide-y divide-rule/70 border-y border-ink sm:hidden print:hidden">
        {doc.items.map((i) => {
          const mark = itemMarks?.[i.position]
          return (
            <li key={i.position} className={`py-2 ${mark === false ? 'text-muted' : ''}`}>
              <div className="flex justify-between gap-3">
                <span className={mark === false ? 'line-through' : 'font-semibold'}>{i.position}. {i.description}</span>
                <span className="shrink-0 tabular-nums">{brl(i.subtotal_cents)}</span>
              </div>
              <p className="text-muted">
                {ITEM_KIND_LABEL[i.kind]} · {Number(i.quantity).toLocaleString('pt-BR')} × {brl(i.unit_price_cents)}{i.notes ? ` · ${i.notes}` : ''}
              </p>
              {mark !== undefined && (
                <p className={`text-xs font-semibold ${mark ? 'text-ok' : 'text-danger'}`}>{mark ? 'Aprovado pelo cliente' : 'Recusado pelo cliente'}</p>
              )}
            </li>
          )
        })}
      </ul>
      <div className="mt-5 hidden overflow-x-auto sm:block print:block">
        <table className="w-full min-w-[34rem] text-left">
          <thead className="border-b border-ink text-[11px] uppercase tracking-wider text-muted">
            <tr>
              <th scope="col" className="py-2 pr-2">#</th>
              <th scope="col" className="py-2 pr-2">Descrição</th>
              <th scope="col" className="py-2 pr-2">Tipo</th>
              <th scope="col" className="py-2 pr-2 text-right">Qtd.</th>
              <th scope="col" className="py-2 pr-2 text-right">Unitário</th>
              <th scope="col" className="py-2 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {doc.items.map((i) => {
              const mark = itemMarks?.[i.position]
              return (
                <tr key={i.position} className={`border-b border-rule/70 align-top ${mark === false ? 'text-muted' : ''}`}>
                  <td className="py-2 pr-2 tabular-nums">{i.position}</td>
                  <td className="py-2 pr-2">
                    <span className={mark === false ? 'line-through' : 'font-semibold'}>{i.description}</span>
                    {i.notes && <span className="block text-muted">{i.notes}</span>}
                    {mark !== undefined && (
                      <span className={`block text-xs font-semibold ${mark ? 'text-ok' : 'text-danger'}`}>{mark ? 'Aprovado pelo cliente' : 'Recusado pelo cliente'}</span>
                    )}
                  </td>
                  <td className="py-2 pr-2">{ITEM_KIND_LABEL[i.kind]}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{Number(i.quantity).toLocaleString('pt-BR')}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{brl(i.unit_price_cents)}</td>
                  <td className="py-2 text-right tabular-nums">{brl(i.subtotal_cents)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="report-break-avoid mt-3 flex justify-end">
        <dl className="w-full max-w-xs text-sm">
          <div className="flex justify-between py-0.5"><dt className="text-muted">Subtotal</dt><dd className="tabular-nums">{brl(doc.subtotalCents)}</dd></div>
          {doc.discountCents > 0 && (
            <div className="flex justify-between py-0.5">
              <dt className="text-muted">Desconto{doc.discountType === 'percent' ? ` (${Number(doc.discountValue).toLocaleString('pt-BR')}%)` : ''}</dt>
              <dd className="tabular-nums">− {brl(doc.discountCents)}</dd>
            </div>
          )}
          <div className="mt-1 flex justify-between border-t-2 border-ink pt-1.5 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{brl(doc.totalCents)}</dd></div>
        </dl>
      </div>

      <section className="report-break-avoid mt-5 grid gap-4 border-t border-rule pt-4 sm:grid-cols-[1fr_auto]">
        <div className="space-y-2">
          {doc.paymentTerms && <p><span className="font-semibold">Condições de pagamento:</span> {doc.paymentTerms}</p>}
          {doc.estimatedDays !== null && <p><span className="font-semibold">Prazo estimado de execução:</span> {doc.estimatedDays === 0 ? 'no mesmo dia' : doc.estimatedDays === 1 ? '1 dia' : `${doc.estimatedDays} dias`}</p>}
          {doc.notes && <p className="whitespace-pre-line"><span className="font-semibold">Observações:</span> {doc.notes}</p>}
          {doc.authorName && <p className="text-muted">Elaborado por {doc.authorName}.</p>}
          <p className="text-xs text-muted">
            Orçamento não é registro de serviço. Só os serviços executados entram no histórico da moto. Valores válidos até a data indicada.
          </p>
        </div>
        {approvalUrl && qr && (
          <div className="text-center">
            <div className="mx-auto h-28 w-28 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} />
            <p className="mt-1 max-w-[9rem] text-[11px] text-muted">Aponte a câmera para ver e aprovar</p>
          </div>
        )}
      </section>
      {footer}
    </article>
  )
}
