import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button, ButtonLink } from '@/components/Button'
import { SelectField, TextField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { PageHeader } from '@/components/AppLayout'
import { translateDbError } from '@/core/shared/dbErrors'
import { formatDate, formatPlate, todayISO } from '@/core/shared/format'
import { fetchCustomer, listCustomers, vehicleLabel } from '../customers/api'
import { Card, EmptyState, StatusChip, WorkshopShell } from '../shared/WorkshopShell'
import { centsToInput, formatCents, onlyDigits, parseMoney } from '../shared/rpc'
import { ITEM_KIND_LABEL, ITEM_KINDS, type ItemKind } from '../quotes/api'
import {
  AUTH_LABEL, AUTH_METHODS, createOrderManual, listOrders, ORDER_STATUS_LABEL, ORDER_STATUS_TONE, type AuthMethod,
} from './api'

type Err = { code?: string; message?: string }

const FILTERS = [
  { value: 'active', label: 'Em andamento' },
  { value: 'ready', label: 'Prontas para retirada' },
  { value: 'delivered', label: 'Entregues' },
  { value: 'canceled', label: 'Canceladas' },
  { value: '', label: 'Todas' },
]

export function OrdersPage() {
  return <WorkshopShell>{({ orgId, perms }) => <Orders orgId={orgId} canManage={perms.manage_quotes} />}</WorkshopShell>
}

function Orders({ orgId, canManage }: { orgId: string; canManage: boolean }) {
  const [params, setParams] = useSearchParams()
  const status = params.get('situacao') ?? 'active'
  const [search, setSearch] = useState('')
  const [mine, setMine] = useState(!canManage)
  const list = useQuery({ queryKey: ['ws-orders', orgId, status, search, mine], queryFn: () => listOrders(orgId, status, search, mine) })
  const today = todayISO()

  return (
    <div>
      <PageHeader title="Ordens de serviço"
        intro={canManage ? 'Do orçamento aprovado à entrega da moto. Só entra na OS o que o cliente autorizou.' : 'As ordens de serviço designadas para você.'}
        actions={canManage && <ButtonLink to={`/oficina/${orgId}/os/nova`} variant="secondary">Abrir OS sem orçamento</ButtonLink>} />
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por situação">
          {FILTERS.map((f) => (
            <button key={f.value} type="button" aria-pressed={status === f.value} onClick={() => setParams({ situacao: f.value })}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${status === f.value ? 'border-ink bg-ink text-sheet' : 'border-rule text-ink hover:border-ink'}`}>
              {f.label}
            </button>
          ))}
        </div>
        {canManage && (
          <label className="flex items-center gap-2 text-sm text-graphite">
            <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="h-4 w-4 accent-ink" />
            Só as minhas
          </label>
        )}
        <label className="ml-auto flex min-w-[15rem] flex-1 sm:max-w-sm">
          <span className="sr-only">Buscar</span>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nº, cliente, moto ou placa"
            className="w-full rounded-doc border border-rule bg-sheet px-3.5 py-2.5 text-base focus:border-ink focus:outline-none" />
        </label>
      </div>
      <div className="mt-5">
        {list.isLoading && <p className="text-muted" role="status">Carregando…</p>}
        {list.isError && <Notice tone="error">{translateDbError(list.error as Err)}</Notice>}
        {list.data?.length === 0 && (
          <EmptyState title="Nenhuma ordem de serviço aqui">
            {canManage ? 'Abra a OS pelo orçamento aprovado (botão "Abrir ordem de serviço") ou sem orçamento, registrando a autorização do cliente.' : 'Quando uma OS for designada para você, ela aparece aqui.'}
          </EmptyState>
        )}
        {list.data && list.data.length > 0 && (
          <ul className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {list.data.map((o) => {
              const late = o.due_date && o.due_date < today && !['completed', 'awaiting_pickup', 'delivered', 'canceled'].includes(o.status)
              return (
                <li key={o.id}>
                  <Link to={`/oficina/${orgId}/os/${o.id}`} className="block h-full rounded-sheet border border-rule bg-sheet p-4 hover:border-ink/50">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="heading text-lg text-ink">OS nº {o.number}</p>
                      <StatusChip className={ORDER_STATUS_TONE[o.status]}>{ORDER_STATUS_LABEL[o.status]}</StatusChip>
                    </div>
                    <p className="mt-1 font-semibold text-graphite">{o.customer_name}</p>
                    <p className="text-sm text-muted">{[o.brand, o.model].filter(Boolean).join(' ') || 'Sem moto'}{o.plate ? ` · ${formatPlate(o.plate)}` : ''}</p>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-paper" aria-hidden="true">
                      <div className="h-full bg-ok" style={{ width: `${o.items ? Math.round((o.items_done / o.items) * 100) : 0}%` }} />
                    </div>
                    <p className="mt-1.5 flex flex-wrap justify-between gap-2 text-xs text-muted">
                      <span>{o.items_done} de {o.items} serviços feitos{o.mechanic_name ? ` · ${o.mechanic_name}` : ''}</span>
                      <span className={late ? 'font-semibold text-danger' : ''}>
                        {o.final_total_cents !== null ? formatCents(o.final_total_cents) : formatCents(o.authorized_cents)}
                        {o.due_date && !o.completed_at ? ` · prazo ${formatDate(o.due_date, 'short')}${late ? ' (atrasada)' : ''}` : ''}
                      </span>
                    </p>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

type Row = { key: number; kind: ItemKind; description: string; quantity: string; price: string }

/** OS sem orçamento (PRD 2.1 §8.1): exige registrar como e por quem o serviço foi autorizado. */
export function NewOrderPage() {
  return <WorkshopShell>{({ orgId, perms }) => perms.manage_quotes
    ? <NewOrder orgId={orgId} />
    : <Notice tone="info">Seu acesso não inclui abrir ordens de serviço.</Notice>}</WorkshopShell>
}

function NewOrder({ orgId }: { orgId: string }) {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [vehicleId, setVehicleId] = useState('')
  const [method, setMethod] = useState<AuthMethod>('presencial')
  const [by, setBy] = useState('')
  const [note, setNote] = useState('')
  const [km, setKm] = useState('')
  const [rows, setRows] = useState<Row[]>([{ key: 1, kind: 'labor', description: '', quantity: '1', price: '' }])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const customers = useQuery({ queryKey: ['ws-customers', orgId, search, false], queryFn: () => listCustomers(orgId, search), enabled: !customerId })
  const customer = useQuery({ queryKey: ['ws-customer', orgId, customerId], queryFn: () => fetchCustomer(orgId, customerId), enabled: Boolean(customerId) })
  const vehicles = (customer.data?.vehicles ?? []).filter((v) => v.status === 'active')

  async function submit() {
    if (!customerId) return setError('Escolha o cliente.')
    if (by.trim().length < 3) return setError('Informe quem autorizou o serviço.')
    for (const [i, r] of rows.entries()) {
      if (r.description.trim().length < 2) return setError(`Serviço ${i + 1}: descreva o serviço.`)
      if (parseMoney(r.price || '0') === null) return setError(`Serviço ${i + 1}: valor inválido.`)
    }
    setSaving(true)
    setError(null)
    try {
      const id = await createOrderManual(orgId, {
        customerId, vehicleId: vehicleId || null, method, by: by.trim(), note: note.trim(), km: km ? Number(onlyDigits(km)) : null,
        items: rows.map((r) => ({ kind: r.kind, description: r.description.trim(), quantity: Number(r.quantity.replace(',', '.')) || 1, unit_price_cents: parseMoney(r.price || '0') ?? 0 })),
      })
      navigate(`/oficina/${orgId}/os/${id}`, { replace: true })
    } catch (err) {
      setError(translateDbError(err as Err))
      setSaving(false)
    }
  }

  return (
    <div className="max-w-4xl">
      <PageHeader title="Abrir OS sem orçamento"
        intro="Para serviços que o cliente autorizou na hora. Fica registrado como e por quem foi autorizado. Para valores maiores, prefira o orçamento com aprovação pelo link." />
      <div className="mt-6 flex flex-col gap-6">
        <Card title="Cliente e moto">
          {!customerId ? (
            <>
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente por nome, telefone ou placa" aria-label="Buscar cliente"
                className="w-full rounded-doc border border-rule bg-sheet px-3.5 py-2.5 text-base focus:border-ink focus:outline-none" />
              <ul className="mt-3 flex flex-col gap-2">
                {customers.data?.slice(0, 20).map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => setCustomerId(c.id)} className="w-full rounded-doc border border-rule px-4 py-2.5 text-left hover:border-ink">
                      <span className="font-semibold text-ink">{c.full_name}</span>
                      <span className="block text-sm text-muted">{c.vehicle_labels || 'Sem moto cadastrada'}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <Link to={`/oficina/${orgId}/clientes/novo`} className="mt-3 inline-block text-sm underline underline-offset-4">Cadastrar cliente novo</Link>
            </>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              <p className="sm:col-span-3"><span className="font-semibold text-ink">{customer.data?.full_name}</span>{' '}
                <button type="button" className="text-sm text-muted underline" onClick={() => { setCustomerId(''); setVehicleId('') }}>trocar</button></p>
              <SelectField label="Moto" value={vehicleId} options={vehicles.map((v) => v.id)} placeholder="Sem moto"
                optionLabel={(id) => { const v = vehicles.find((x) => x.id === id); return v ? `${vehicleLabel(v)}${v.plate ? ` · ${formatPlate(v.plate)}` : ''}` : id }}
                onChange={(e) => setVehicleId(e.target.value)} className="sm:col-span-2" />
              <TextField label="Km na entrada" value={km} onChange={(e) => setKm(e.target.value)} inputMode="numeric" />
            </div>
          )}
        </Card>
        <Card title="Autorização do cliente">
          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField label="Como autorizou" value={method} options={AUTH_METHODS} optionLabel={(o) => AUTH_LABEL[o as AuthMethod]}
              onChange={(e) => setMethod(e.target.value as AuthMethod)} />
            <TextField label="Quem autorizou" value={by} onChange={(e) => setBy(e.target.value)} placeholder="Nome de quem autorizou" />
            <TextField label="Observação (opcional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: ligou às 10h" />
          </div>
        </Card>
        <Card title="Serviços autorizados">
          <ol className="flex flex-col gap-3">
            {rows.map((r, idx) => (
              <li key={r.key} className="grid gap-3 rounded-doc border border-rule p-3 sm:grid-cols-[9rem_minmax(0,1fr)_5rem_8rem_auto]">
                <SelectField label="Tipo" value={r.kind} options={ITEM_KINDS} optionLabel={(o) => ITEM_KIND_LABEL[o as ItemKind]}
                  onChange={(e) => setRows(rows.map((x) => (x.key === r.key ? { ...x, kind: e.target.value as ItemKind } : x)))} />
                <TextField label={`Serviço ${idx + 1}`} value={r.description} onChange={(e) => setRows(rows.map((x) => (x.key === r.key ? { ...x, description: e.target.value } : x)))} />
                <TextField label="Qtd." value={r.quantity} inputMode="decimal" onChange={(e) => setRows(rows.map((x) => (x.key === r.key ? { ...x, quantity: e.target.value } : x)))} />
                <TextField label="Valor (R$)" value={r.price} inputMode="decimal" placeholder={centsToInput(0)} onChange={(e) => setRows(rows.map((x) => (x.key === r.key ? { ...x, price: e.target.value } : x)))} />
                <div className="flex items-end">
                  <Button size="sm" variant="quiet" disabled={rows.length === 1} onClick={() => setRows(rows.filter((x) => x.key !== r.key))}>Remover</Button>
                </div>
              </li>
            ))}
          </ol>
          <Button className="mt-3" size="sm" variant="secondary" onClick={() => setRows([...rows, { key: Date.now(), kind: 'part', description: '', quantity: '1', price: '' }])}>Adicionar serviço</Button>
        </Card>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex gap-2"><Button onClick={submit} loading={saving}>Abrir ordem de serviço</Button>
          <ButtonLink to={`/oficina/${orgId}/os`} variant="quiet">Cancelar</ButtonLink></div>
      </div>
    </div>
  )
}
