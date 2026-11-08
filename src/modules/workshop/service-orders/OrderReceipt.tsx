import { formatKm, formatPlate } from '@/core/shared/format'
import { formatCents, formatDateTime, formatPhone } from '../shared/rpc'
import { ITEM_KIND_LABEL, type ItemKind } from '../quotes/api'
import { STATE_LABEL, ENTRY_ITEMS, EXIT_ITEMS, type InspectionItems } from './api'
import { WorkshopLogo } from '../shared/WorkshopLogo'

export type ReceiptItem = {
  position: number
  kind: ItemKind
  description: string
  quantity: number
  net_cents: number
  status: 'pending' | 'done' | 'not_done'
  part_brand: string | null
  part_code: string | null
  notes: string | null
  origin: string
}

export type ReceiptDoc = {
  workshop: { business_name: string; cnpj?: string | null; phone?: string | null; whatsapp?: string | null; email?: string | null; address?: string | null; city?: string | null; state?: string | null; logo_url?: string | null }
  number: number
  openedAt: string
  completedAt: string | null
  deliveredAt: string | null
  deliveredTo: string | null
  receiptCode: string | null
  customerName: string
  vehicle: { brand: string; model: string; version?: string | null; year?: number | null; plate?: string | null; color?: string | null } | null
  kmIn: number | null
  kmOut: number | null
  items: ReceiptItem[]
  adjustmentCents: number
  adjustmentReason: string | null
  finalTotalCents: number | null
  notes: string | null
  entry: { items: InspectionItems; notes: string | null; ackName: string | null; ackAt: string | null } | null
  exit: { items: InspectionItems; notes: string | null } | null
  photosCount: number
}

const label = (k: string) => [...ENTRY_ITEMS, ...EXIT_ITEMS].find((x) => x.key === k)?.label ?? k

/** Comprovante de conclusão da OS (PRD 2.1 §8.4). Não é nota fiscal nem registro no histórico da moto. */
export function OrderReceipt({ doc }: { doc: ReceiptDoc }) {
  const w = doc.workshop
  const done = doc.items.filter((i) => i.status === 'done')
  const notDone = doc.items.filter((i) => i.status !== 'done')
  const issues = (items: InspectionItems) => Object.entries(items).filter(([, v]) => v.state === 'atencao' || v.state === 'avaria')
  return (
    <article aria-label={`Comprovante da OS nº ${doc.number}`}
      className="report-sheet mx-auto max-w-[52rem] rounded-sheet border border-rule bg-white p-4 text-[13px] leading-relaxed text-ink shadow-sm sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-ink pb-4">
        <div className="flex min-w-0 items-start gap-3">
          <WorkshopLogo src={w.logo_url} />
          <div>
            <p className="heading text-xl">{w.business_name}</p>
            {w.cnpj && <p className="text-muted">CNPJ {w.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')}</p>}
            <p className="text-muted">{[w.address, [w.city, w.state].filter(Boolean).join('/')].filter(Boolean).join(' · ')}</p>
            <p className="text-muted">{[w.whatsapp ? `WhatsApp ${formatPhone(w.whatsapp)}` : null, w.email].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
        <div className="sm:text-right">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Comprovante de serviço</p>
          <p className="heading text-2xl">OS nº {doc.number}</p>
          <p className="text-muted">Aberta em {formatDateTime(doc.openedAt)}</p>
          {doc.completedAt && <p className="text-muted">Concluída em {formatDateTime(doc.completedAt)}</p>}
          {doc.receiptCode && <p className="font-semibold">Código {doc.receiptCode}</p>}
        </div>
      </header>

      <section className="report-break-avoid mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Cliente</p>
          <p className="font-semibold">{doc.customerName}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Motocicleta</p>
          {doc.vehicle ? <p className="font-semibold">{[doc.vehicle.brand, doc.vehicle.model, doc.vehicle.version, doc.vehicle.year].filter(Boolean).join(' ')}</p> : <p>—</p>}
          <p className="text-muted">
            {[doc.vehicle?.plate ? `Placa ${formatPlate(doc.vehicle.plate)}` : null, doc.kmIn !== null ? `entrada ${formatKm(doc.kmIn)}` : null,
              doc.kmOut !== null ? `saída ${formatKm(doc.kmOut)}` : null].filter(Boolean).join(' · ')}
          </p>
        </div>
      </section>

      <h3 className="mt-5 text-xs font-semibold uppercase tracking-wider text-muted">Serviços executados</h3>
      <ul className="mt-1 divide-y divide-rule/70 border-y border-ink">
        {done.map((i) => (
          <li key={i.position} className="flex flex-wrap justify-between gap-3 py-2">
            <span className="min-w-0">
              <span className="font-semibold">{i.description}</span>{' '}
              <span className="text-muted">· {ITEM_KIND_LABEL[i.kind]} · {Number(i.quantity).toLocaleString('pt-BR')}</span>
              {(i.part_brand || i.part_code) && <span className="block text-muted">Peça: {[i.part_brand, i.part_code].filter(Boolean).join(' · ')}</span>}
              {i.notes && <span className="block text-muted">{i.notes}</span>}
              <span className="block text-xs text-muted">{i.origin}</span>
            </span>
            <span className="tabular-nums">{formatCents(i.net_cents)}</span>
          </li>
        ))}
      </ul>
      {notDone.length > 0 && (
        <>
          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted">Autorizados e não executados (não cobrados)</h3>
          <ul className="mt-1 text-muted">
            {notDone.map((i) => <li key={i.position}>· {i.description}{i.notes ? ` — ${i.notes}` : ''}</li>)}
          </ul>
        </>
      )}
      <div className="report-break-avoid mt-3 flex justify-end">
        <dl className="w-full max-w-xs text-sm">
          {doc.adjustmentCents !== 0 && (
            <div className="flex justify-between py-0.5"><dt className="text-muted">Ajuste ({doc.adjustmentReason})</dt><dd className="tabular-nums">{formatCents(doc.adjustmentCents)}</dd></div>
          )}
          <div className="flex justify-between border-t-2 border-ink pt-1.5 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatCents(doc.finalTotalCents)}</dd></div>
        </dl>
      </div>

      {(doc.entry || doc.exit) && (
        <section className="report-break-avoid mt-4 grid gap-4 border-t border-rule pt-3 sm:grid-cols-2">
          {doc.entry && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Estado na entrada</p>
              {issues(doc.entry.items).length === 0 ? <p>Sem avarias registradas.</p> : (
                <ul>{issues(doc.entry.items).map(([k, v]) => <li key={k}>{label(k)}: {STATE_LABEL[v.state]}{v.note ? ` — ${v.note}` : ''}</li>)}</ul>
              )}
              {doc.entry.notes && <p className="text-muted">{doc.entry.notes}</p>}
              {doc.entry.ackName && <p className="text-xs text-muted">Ciência do cliente: {doc.entry.ackName}, {formatDateTime(doc.entry.ackAt)}.</p>}
            </div>
          )}
          {doc.exit && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Conferência na saída</p>
              <ul>{Object.entries(doc.exit.items).map(([k, v]) => <li key={k}>{label(k)}: {STATE_LABEL[v.state]}{v.note ? ` — ${v.note}` : ''}</li>)}</ul>
              {doc.exit.notes && <p className="text-muted">{doc.exit.notes}</p>}
            </div>
          )}
        </section>
      )}

      {doc.notes && <p className="mt-3 whitespace-pre-line"><span className="font-semibold">Observações:</span> {doc.notes}</p>}
      {doc.deliveredAt && <p className="mt-2">Moto entregue a <span className="font-semibold">{doc.deliveredTo}</span> em {formatDateTime(doc.deliveredAt)}.</p>}
      <p className="mt-3 text-xs text-muted">
        {doc.photosCount > 0 ? `${doc.photosCount} foto${doc.photosCount === 1 ? '' : 's'} registrada${doc.photosCount === 1 ? '' : 's'} pela oficina. ` : ''}
        Comprovante de serviço da oficina; não é nota fiscal. Só entram aqui serviços autorizados pelo cliente.
      </p>
    </article>
  )
}
