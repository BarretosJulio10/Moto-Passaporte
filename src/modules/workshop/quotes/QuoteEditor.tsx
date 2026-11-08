import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { SelectField, TextAreaField, TextField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { translateDbError } from '@/core/shared/dbErrors'
import { formatPlate, todayISO } from '@/core/shared/format'
import { fetchCatalog, suggestPrice, CATEGORY_LABEL } from '../service-catalog/api'
import { fetchCustomer, vehicleLabel } from '../customers/api'
import { centsToInput, formatCents, onlyDigits, parseMoney } from '../shared/rpc'
import { Card } from '../shared/WorkshopShell'
import {
  computeTotals, ITEM_KIND_LABEL, ITEM_KINDS, saveDraft, sendQuote,
  type DiscountType, type DraftInput, type ItemKind, type LinkResult, type Quote, type QuoteVersion,
} from './api'

type Row = { key: string; kind: ItemKind; description: string; service_id: string | null; quantity: string; price: string; notes: string; hint?: string }
type Err = { code?: string; message?: string }

let seq = 0
const newKey = () => `r${++seq}`

function toRows(v: QuoteVersion): Row[] {
  return v.items.map((i) => ({
    key: newKey(), kind: i.kind, description: i.description, service_id: i.service_id,
    quantity: String(Number(i.quantity)).replace('.', ','), price: centsToInput(i.unit_price_cents), notes: i.notes ?? '',
  }))
}

const qty = (s: string) => Number(s.replace(',', '.'))

/** Editor do rascunho (PRD 2.1 §6.1–6.2). Os totais exibidos são conferidos pelo servidor ao salvar. */
export function QuoteEditor({ orgId, quote, version, onSaved, onSent }: {
  orgId: string
  quote: Quote
  version: QuoteVersion
  onSaved: () => Promise<unknown>
  onSent: (link: LinkResult) => Promise<unknown>
}) {
  const catalog = useQuery({ queryKey: ['ws-catalog', orgId], queryFn: () => fetchCatalog(orgId) })
  const customer = useQuery({ queryKey: ['ws-customer', orgId, quote.customer_id], queryFn: () => fetchCustomer(orgId, quote.customer_id) })
  const [vehicleId, setVehicleId] = useState(quote.vehicle_id ?? '')
  const [head, setHead] = useState({
    km: version.km?.toString() ?? '', problem: version.problem ?? '', diagnosis: version.diagnosis ?? '', notes: version.notes ?? '',
    payment_terms: version.payment_terms ?? '', estimated_days: version.estimated_days?.toString() ?? '', valid_until: version.valid_until,
    price_table_id: version.price_table_id ?? '',
  })
  const [discountType, setDiscountType] = useState<DiscountType>(version.discount_type)
  const [discount, setDiscount] = useState(version.discount_type === 'none' ? '' : String(version.discount_value).replace('.', ','))
  const [rows, setRows] = useState<Row[]>(() => toRows(version))
  const [pick, setPick] = useState('')
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<'' | 'save' | 'send'>('')
  const [confirmSend, setConfirmSend] = useState(false)

  const services = (catalog.data?.services ?? []).filter((s) => s.active)
  const vehicles = (customer.data?.vehicles ?? []).filter((v) => v.status === 'active' || v.id === quote.vehicle_id)
  const discountNumber = Number(discount.replace(',', '.')) || 0
  const totals = useMemo(() => computeTotals(
    rows.map((r) => ({ quantity: qty(r.quantity) || 0, unit_price_cents: parseMoney(r.price) ?? 0 })), discountType, discountNumber,
  ), [rows, discountType, discountNumber])

  const touch = () => { setDirty(true); setError(null) }
  const update = (key: string, patch: Partial<Row>) => { touch(); setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r))) }
  const move = (idx: number, dir: -1 | 1) => {
    touch()
    setRows((rs) => {
      const next = [...rs]
      const j = idx + dir
      if (j < 0 || j >= next.length) return rs
      const a = next[idx]
      const b = next[j]
      if (!a || !b) return rs
      next[idx] = b
      next[j] = a
      return next
    })
  }

  async function addService(serviceId: string) {
    const s = services.find((x) => x.id === serviceId)
    if (!s) return
    touch()
    const key = newKey()
    setRows((rs) => [...rs, { key, kind: 'labor', description: s.name, service_id: s.id, quantity: '1', price: centsToInput(s.default_price_cents), notes: '', hint: 'buscando preço…' }])
    setPick('')
    try {
      const sug = await suggestPrice(orgId, s.id, vehicleId || null, head.price_table_id || null)
      setRows((rs) => rs.map((r) => (r.key === key
        ? { ...r, price: sug.price_cents !== null ? centsToInput(sug.price_cents) : r.price, hint: sug.source === 'none' ? 'sem preço cadastrado: informe o valor' : `sugerido: ${sug.label}` }
        : r)))
    } catch {
      setRows((rs) => rs.map((r) => (r.key === key ? { ...r, hint: undefined } : r)))
    }
  }

  function build(): DraftInput | string {
    if (rows.length === 0) return 'Adicione pelo menos um item.'
    for (const [i, r] of rows.entries()) {
      if (r.description.trim().length < 2) return `Item ${i + 1}: descreva o serviço ou a peça.`
      if (!(qty(r.quantity) > 0)) return `Item ${i + 1}: quantidade inválida.`
      if (parseMoney(r.price) === null) return `Item ${i + 1}: valor inválido. Use, por exemplo, 85,00.`
    }
    if (discountType === 'percent' && (discountNumber < 0 || discountNumber > 100)) return 'Desconto em % vai de 0 a 100.'
    if (head.valid_until < todayISO()) return 'A validade não pode ser no passado.'
    if (head.km && !/^\d{1,7}$/.test(onlyDigits(head.km))) return 'Quilometragem: só números.'
    if (head.estimated_days && !/^\d{1,3}$/.test(head.estimated_days)) return 'Prazo estimado em dias: só números.'
    return {
      vehicle_id: vehicleId || null, km: onlyDigits(head.km), problem: head.problem, diagnosis: head.diagnosis, notes: head.notes,
      payment_terms: head.payment_terms, estimated_days: head.estimated_days, valid_until: head.valid_until,
      price_table_id: head.price_table_id || null, discount_type: discount && discountNumber > 0 ? discountType : 'none',
      discount_value: discount && discountNumber > 0 ? discountNumber : 0,
      items: rows.map((r) => ({ kind: r.kind, description: r.description.trim(), service_id: r.service_id, quantity: qty(r.quantity),
        unit_price_cents: parseMoney(r.price) ?? 0, notes: r.notes.trim() || null })),
    }
  }

  async function save(then: 'save' | 'send') {
    const input = build()
    if (typeof input === 'string') { setError(input); setConfirmSend(false); return }
    setSaving(then)
    setError(null)
    try {
      await saveDraft(orgId, quote.id, input)
      setDirty(false)
      if (then === 'send') {
        const link = await sendQuote(orgId, quote.id)
        await onSent(link)
      } else {
        await onSaved()
      }
    } catch (err) {
      setError(translateDbError(err as Err))
    } finally {
      setSaving('')
      setConfirmSend(false)
    }
  }

  const v = vehicles.find((x) => x.id === vehicleId)

  return (
    <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex flex-col gap-6">
        <Card title="Atendimento">
          <div className="grid gap-4 md:grid-cols-3">
            <SelectField label="Moto" value={vehicleId} options={vehicles.map((x) => x.id)} placeholder="Sem moto"
              optionLabel={(id) => { const x = vehicles.find((y) => y.id === id); return x ? `${vehicleLabel(x)}${x.plate ? ` · ${formatPlate(x.plate)}` : ''}` : id }}
              onChange={(e) => { touch(); setVehicleId(e.target.value); const x = vehicles.find((y) => y.id === e.target.value); if (x?.km && !head.km) setHead({ ...head, km: String(x.km) }) }} />
            <TextField label="Quilometragem" value={head.km} inputMode="numeric" onChange={(e) => { touch(); setHead({ ...head, km: e.target.value }) }} />
            {(catalog.data?.tables.length ?? 0) > 0 && (
              <SelectField label="Tabela de preço" value={head.price_table_id} options={catalog.data!.tables.filter((t) => t.active).map((t) => t.id)}
                placeholder="Padrão da oficina" optionLabel={(id) => catalog.data!.tables.find((t) => t.id === id)?.name ?? id}
                onChange={(e) => { touch(); setHead({ ...head, price_table_id: e.target.value }) }} />
            )}
            <TextAreaField label="Problema relatado" value={head.problem} rows={2} className="md:col-span-3 lg:col-span-1"
              onChange={(e) => { touch(); setHead({ ...head, problem: e.target.value }) }} />
            <TextAreaField label="Diagnóstico" value={head.diagnosis} rows={2} className="md:col-span-3 lg:col-span-2"
              onChange={(e) => { touch(); setHead({ ...head, diagnosis: e.target.value }) }} />
          </div>
        </Card>

        <Card title="Itens" actions={<span className="text-sm text-muted">{rows.length} ite{rows.length === 1 ? 'm' : 'ns'}</span>}>
          {rows.length === 0 && <p className="mb-3 text-muted">Adicione serviços do catálogo ou itens avulsos (peças, produtos, terceiros).</p>}
          <ol className="flex flex-col gap-3">
            {rows.map((r, idx) => {
              const sub = Math.round((qty(r.quantity) || 0) * (parseMoney(r.price) ?? 0))
              return (
                <li key={r.key} className="rounded-doc border border-rule p-3">
                  <div className="grid gap-3 sm:grid-cols-[2.5rem_9.5rem_minmax(0,1fr)] lg:grid-cols-[2.5rem_9.5rem_minmax(0,1fr)_6rem_8rem_8rem]">
                    <span className="pt-8 text-sm font-semibold text-muted tabular-nums" aria-hidden="true">{idx + 1}</span>
                    <SelectField label="Tipo" value={r.kind} options={ITEM_KINDS} optionLabel={(o) => ITEM_KIND_LABEL[o as ItemKind]}
                      onChange={(e) => update(r.key, { kind: e.target.value as ItemKind })} />
                    <TextField label="Descrição" value={r.description} onChange={(e) => update(r.key, { description: e.target.value })} hint={r.hint} />
                    <TextField label="Qtd." value={r.quantity} inputMode="decimal" onChange={(e) => update(r.key, { quantity: e.target.value })} />
                    <TextField label="Valor unit. (R$)" value={r.price} inputMode="decimal" onChange={(e) => update(r.key, { price: e.target.value, hint: undefined })} />
                    <div className="flex flex-col gap-1.5">
                      <span className="text-sm font-semibold text-graphite">Subtotal</span>
                      <span className="py-2.5 text-right font-semibold tabular-nums text-ink">{formatCents(sub)}</span>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-end gap-1">
                    <Button size="sm" variant="quiet" onClick={() => move(idx, -1)} disabled={idx === 0} aria-label={`Subir item ${idx + 1}`}>↑</Button>
                    <Button size="sm" variant="quiet" onClick={() => move(idx, 1)} disabled={idx === rows.length - 1} aria-label={`Descer item ${idx + 1}`}>↓</Button>
                    <Button size="sm" variant="quiet" onClick={() => { touch(); setRows((rs) => rs.filter((x) => x.key !== r.key)) }}>Remover</Button>
                  </div>
                </li>
              )
            })}
          </ol>
          <div className="mt-4 flex flex-wrap items-end gap-2">
            {services.length > 0 && (
              <label className="flex min-w-[16rem] flex-1 flex-col gap-1.5">
                <span className="text-sm font-semibold text-graphite">Adicionar do catálogo</span>
                <select value={pick} onChange={(e) => { setPick(e.target.value); if (e.target.value) void addService(e.target.value) }}
                  className="w-full rounded-doc border border-rule bg-sheet px-3 py-2.5 text-base focus:border-ink focus:outline-none">
                  <option value="">Escolha um serviço…</option>
                  {services.map((s) => <option key={s.id} value={s.id}>{s.name} ({CATEGORY_LABEL[s.category]})</option>)}
                </select>
              </label>
            )}
            <Button variant="secondary" onClick={() => { touch(); setRows((rs) => [...rs, { key: newKey(), kind: 'part', description: '', service_id: null, quantity: '1', price: '', notes: '' }]) }}>
              Item avulso
            </Button>
          </div>
          {services.length === 0 && catalog.data && (
            <p className="mt-2 text-sm text-muted">Dica: cadastre seus serviços em "Serviços e preços" para o preço aparecer sozinho.</p>
          )}
        </Card>

        <Card title="Condições">
          <div className="grid gap-4 md:grid-cols-3">
            <TextField label="Válido até" type="date" value={head.valid_until} min={todayISO()} onChange={(e) => { touch(); setHead({ ...head, valid_until: e.target.value }) }} />
            <TextField label="Prazo de execução (dias)" value={head.estimated_days} inputMode="numeric" onChange={(e) => { touch(); setHead({ ...head, estimated_days: e.target.value }) }} />
            <TextField label="Condições de pagamento" value={head.payment_terms} placeholder="Pix, cartão em até 3x" onChange={(e) => { touch(); setHead({ ...head, payment_terms: e.target.value }) }} />
            <TextAreaField label="Observações para o cliente" value={head.notes} rows={2} className="md:col-span-3" onChange={(e) => { touch(); setHead({ ...head, notes: e.target.value }) }} />
          </div>
        </Card>
      </div>

      <aside className="2xl:sticky 2xl:top-6 2xl:self-start">
        <Card title="Resumo">
          <p className="text-sm text-muted">{quote.customer.full_name}{v ? ` · ${vehicleLabel(v)}` : ''}</p>
          <div className="mt-4 grid grid-cols-[1fr_7rem] gap-2">
            <SelectField label="Desconto" value={discountType === 'none' ? 'percent' : discountType} options={['percent', 'amount']}
              optionLabel={(o) => (o === 'percent' ? 'Em %' : 'Em R$')} onChange={(e) => { touch(); setDiscountType(e.target.value as DiscountType) }} />
            <TextField label="Valor" value={discount} inputMode="decimal" placeholder="0"
              onChange={(e) => { touch(); setDiscount(e.target.value); if (discountType === 'none') setDiscountType('percent') }} />
          </div>
          {version.discount_set_by_name && version.discount_type !== 'none' && <p className="mt-1 text-xs text-muted">Desconto definido por {version.discount_set_by_name}.</p>}
          <dl className="mt-4 text-sm">
            <div className="flex justify-between py-1"><dt className="text-muted">Subtotal</dt><dd className="tabular-nums">{formatCents(totals.subtotal_cents)}</dd></div>
            <div className="flex justify-between py-1"><dt className="text-muted">Desconto</dt><dd className="tabular-nums">− {formatCents(totals.discount_cents)}</dd></div>
            <div className="mt-1 flex justify-between border-t border-ink pt-2 text-lg font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatCents(totals.total_cents)}</dd></div>
          </dl>
          {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
          {confirmSend ? (
            <div className="mt-5 rounded-doc border border-ink/30 bg-paper/70 p-3 text-sm">
              <p className="text-graphite">Depois de enviado, este orçamento não muda mais. Para alterar, você cria uma nova versão e o link antigo deixa de valer.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => save('send')} loading={saving === 'send'}>Confirmar e gerar link</Button>
                <Button size="sm" variant="secondary" onClick={() => setConfirmSend(false)}>Voltar</Button>
              </div>
            </div>
          ) : (
            <div className="mt-5 flex flex-col gap-2">
              <Button onClick={() => setConfirmSend(true)} disabled={Boolean(saving) || rows.length === 0}>Salvar e enviar ao cliente</Button>
              <Button variant="secondary" onClick={() => save('save')} loading={saving === 'save'} disabled={Boolean(saving)}>
                {dirty ? 'Salvar rascunho' : 'Rascunho salvo'}
              </Button>
            </div>
          )}
        </Card>
      </aside>
    </div>
  )
}
