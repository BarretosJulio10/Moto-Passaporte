import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, ButtonLink } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { PageHeader } from '@/components/AppLayout'
import { translateDbError } from '@/core/shared/dbErrors'
import { formatDate, formatKm, formatPlate } from '@/core/shared/format'
import { fetchWorkshopAccess } from '@/modules/workshop_access/api'
import {
  fetchCustomer, linkVehiclePassport, maskCpf, saveCustomer, saveVehicle, setCustomerStatus, SOURCE_LABEL, vehicleLabel,
  type Customer, type CustomerInput, type Vehicle,
} from './api'
import { CustomerFields, VehicleForm, emptyVehicle, validateCustomer, vehicleToInput } from './forms'
import { Card, StatusChip, WorkshopShell } from '../shared/WorkshopShell'
import { formatCents, formatPhone } from '../shared/rpc'
import { STATUS_LABEL, STATUS_TONE, type QuoteStatus } from '../quotes/api'
import { RelationshipCard } from '../management/CustomerRelationship'
import { fetchCustomerOrders, ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from '../service-orders/api'

export function CustomerPage() {
  return <WorkshopShell>{({ orgId, perms }) => <CustomerView orgId={orgId} canEdit={perms.manage_quotes} />}</WorkshopShell>
}

function CustomerView({ orgId, canEdit }: { orgId: string; canEdit: boolean }) {
  const { customerId = '' } = useParams()
  const queryClient = useQueryClient()
  const key = ['ws-customer', orgId, customerId]
  const q = useQuery({ queryKey: key, queryFn: () => fetchCustomer(orgId, customerId), enabled: Boolean(customerId) })
  const orders = useQuery({ queryKey: ['ws-customer-orders', orgId, customerId], queryFn: () => fetchCustomerOrders(orgId, customerId), enabled: Boolean(customerId) })
  const [editing, setEditing] = useState(false)
  const [vehicleForm, setVehicleForm] = useState<'new' | string | null>(null)
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: key }),
    queryClient.invalidateQueries({ queryKey: ['ws-customers', orgId] }),
    queryClient.invalidateQueries({ queryKey: ['ws-vehicles', orgId] }),
  ])

  if (q.isLoading) return <p className="text-muted" role="status">Carregando…</p>
  if (q.isError || !q.data) return <Notice tone="error">{translateDbError(q.error as { code?: string; message?: string })}</Notice>
  const c = q.data

  return (
    <div>
      <Link to={`/oficina/${orgId}/clientes`} className="text-sm text-muted underline underline-offset-4">Clientes</Link>
      <div className="mt-2">
        <PageHeader title={c.full_name}
          intro={<>Cliente desde {formatDate(c.first_visit_at)} · {SOURCE_LABEL[c.source]}{c.status === 'archived' ? ' · arquivado' : ''}</>}
          actions={canEdit && c.status === 'active' && (
            <ButtonLink to={`/oficina/${orgId}/orcamentos/novo?cliente=${c.id}`}>Novo orçamento</ButtonLink>
          )} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="flex flex-col gap-6">
          <Card title="Dados do cliente" actions={canEdit && !editing && <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Editar</Button>}>
            {editing ? (
              <EditCustomer orgId={orgId} customer={c} onDone={async () => { await refresh(); setEditing(false) }} onCancel={() => setEditing(false)} />
            ) : (
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <Item label="WhatsApp" value={formatPhone(c.whatsapp) || '—'} />
                <Item label="Telefone" value={formatPhone(c.phone) || '—'} />
                <Item label="E-mail" value={c.email ?? '—'} />
                <Item label="CPF" value={maskCpf(c.cpf)} />
                <Item label="Endereço" value={c.address ?? '—'} />
                <Item label="Nascimento" value={c.birth_date ? formatDate(c.birth_date) : '—'} />
                {c.notes && <div className="sm:col-span-2"><dt className="text-muted">Observações internas</dt><dd className="whitespace-pre-line text-graphite">{c.notes}</dd></div>}
              </dl>
            )}
          </Card>
          {canEdit && !editing && (
            <div>
              <Button size="sm" variant="quiet" onClick={async () => { await setCustomerStatus(orgId, c.id, c.status === 'active' ? 'archived' : 'active'); await refresh() }}>
                {c.status === 'active' ? 'Arquivar cliente' : 'Reativar cliente'}
              </Button>
            </div>
          )}
          <RelationshipCard orgId={orgId} customerId={c.id} vehicles={c.vehicles} canEdit={canEdit} optOutAt={c.marketing_opt_out_at} />
        </div>

        <div className="flex flex-col gap-6">
          <Card title="Motos" actions={canEdit && vehicleForm === null && <Button size="sm" variant="secondary" onClick={() => setVehicleForm('new')}>Adicionar moto</Button>}>
            {vehicleForm === 'new' && (
              <div className="mb-4">
                <VehicleForm initial={emptyVehicle()} onCancel={() => setVehicleForm(null)}
                  onSave={async (v) => { await saveVehicle(orgId, null, c.id, v); await refresh(); setVehicleForm(null) }} />
              </div>
            )}
            {c.vehicles.length === 0 && vehicleForm !== 'new' && <p className="text-muted">Nenhuma moto cadastrada.</p>}
            <ul className="flex flex-col gap-3">
              {c.vehicles.map((v) => vehicleForm === v.id ? (
                <li key={v.id}>
                  <VehicleForm initial={vehicleToInput(v)} onCancel={() => setVehicleForm(null)}
                    onSave={async (input) => { await saveVehicle(orgId, v.id, c.id, input); await refresh(); setVehicleForm(null) }} />
                </li>
              ) : (
                <VehicleRow key={v.id} orgId={orgId} customer={c} vehicle={v} canEdit={canEdit}
                  onEdit={() => setVehicleForm(v.id)} onChanged={refresh} />
              ))}
            </ul>
          </Card>

          {(orders.data?.length ?? 0) > 0 && (
            <Card title="Ordens de serviço">
              <ul className="divide-y divide-rule/70">
                {orders.data!.map((os) => (
                  <li key={os.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <Link to={`/oficina/${orgId}/os/${os.id}`} className="font-semibold text-ink underline-offset-4 hover:underline">
                      OS nº {os.number} · {vehicleLabel(c.vehicles.find((v) => v.id === os.vehicle_id))}
                    </Link>
                    <span className="flex items-center gap-3 text-sm">
                      {os.final_total_cents !== null && <span className="tabular-nums text-graphite">{formatCents(os.final_total_cents)}</span>}
                      <StatusChip className={ORDER_STATUS_TONE[os.status]}>{ORDER_STATUS_LABEL[os.status]}</StatusChip>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Orçamentos">
            {c.quotes.length === 0 ? <p className="text-muted">Nenhum orçamento ainda.</p> : (
              <ul className="divide-y divide-rule/70">
                {c.quotes.map((qt) => (
                  <li key={qt.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <Link to={`/oficina/${orgId}/orcamentos/${qt.id}`} className="font-semibold text-ink underline-offset-4 hover:underline">
                      Nº {qt.number} · {vehicleLabel(c.vehicles.find((v) => v.id === qt.vehicle_id))}
                    </Link>
                    <span className="flex items-center gap-3 text-sm">
                      <span className="tabular-nums text-graphite">{formatCents(qt.approved_total_cents ?? qt.total_cents)}</span>
                      <StatusChip className={STATUS_TONE[qt.status as QuoteStatus]}>{STATUS_LABEL[qt.status as QuoteStatus]}</StatusChip>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

function Item({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-muted">{label}</dt><dd className="text-graphite">{value}</dd></div>
}

function EditCustomer({ orgId, customer, onDone, onCancel }: { orgId: string; customer: Customer; onDone: () => Promise<void>; onCancel: () => void }) {
  const [value, setValue] = useState<CustomerInput>({
    full_name: customer.full_name, whatsapp: formatPhone(customer.whatsapp), phone: formatPhone(customer.phone), email: customer.email ?? '',
    cpf: customer.cpf ?? '', address: customer.address ?? '', birth_date: customer.birth_date ?? '', notes: customer.notes ?? '',
    first_visit_at: customer.first_visit_at, source: customer.source,
  })
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    const errs = validateCustomer(value)
    setErrors(errs)
    if (Object.keys(errs).length) return
    setSaving(true)
    try {
      await saveCustomer(orgId, customer.id, value)
      await onDone()
    } catch (err) {
      setError(translateDbError(err as { code?: string; message?: string }))
    } finally {
      setSaving(false)
    }
  }
  return (
    <form onSubmit={submit} noValidate>
      <CustomerFields value={value} onChange={setValue} errors={errors} />
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      <div className="mt-4 flex gap-2">
        <Button type="submit" size="sm" loading={saving}>Salvar</Button>
        <Button type="button" size="sm" variant="secondary" onClick={onCancel}>Cancelar</Button>
      </div>
    </form>
  )
}

/** Uma moto do cliente, com vínculo opcional ao passaporte autorizado (PRD 2.1 §4.3 e §5). */
function VehicleRow({ orgId, customer, vehicle: v, canEdit, onEdit, onChanged }: {
  orgId: string; customer: Customer; vehicle: Vehicle; canEdit: boolean; onEdit: () => void; onChanged: () => Promise<unknown>
}) {
  const [linking, setLinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const access = useQuery({ queryKey: ['workshop-access', orgId], queryFn: () => fetchWorkshopAccess(orgId), enabled: linking })
  const approved = (access.data ?? []).filter((a) => a.status === 'approved' && a.motorcycle_id)

  async function link(motorcycleId: string | null) {
    setError(null)
    try {
      await linkVehiclePassport(orgId, v.id, motorcycleId)
      await onChanged()
      setLinking(false)
    } catch (err) {
      setError(translateDbError(err as { code?: string; message?: string }))
    }
  }

  return (
    <li className="rounded-doc border border-rule p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-ink">{[v.brand, v.model, v.version, v.year].filter(Boolean).join(' ')}</p>
          <p className="text-sm text-graphite">
            {v.plate ? formatPlate(v.plate) : 'Sem placa'}{v.displacement_cc ? ` · ${v.displacement_cc} cc` : ''}{v.km !== null ? ` · ${formatKm(v.km)}` : ''}{v.color ? ` · ${v.color}` : ''}
          </p>
          <p className="mt-1 text-xs text-muted">
            {v.motorcycle_id ? 'Vinculada ao passaporte autorizado pelo titular' : 'Só no cadastro da oficina'}
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-1">
            {customer.status === 'active' && <ButtonLink size="sm" to={`/oficina/${orgId}/orcamentos/novo?cliente=${customer.id}&moto=${v.id}`}>Orçamento</ButtonLink>}
            <Button size="sm" variant="secondary" onClick={onEdit}>Editar</Button>
            {v.motorcycle_id
              ? <Button size="sm" variant="quiet" onClick={() => link(null)}>Desvincular</Button>
              : <Button size="sm" variant="quiet" onClick={() => setLinking((x) => !x)}>Vincular passaporte</Button>}
          </div>
        )}
      </div>
      {linking && (
        <div className="mt-3 rounded-doc bg-paper/60 p-3 text-sm">
          {access.isLoading && <p className="text-muted" role="status">Carregando autorizações…</p>}
          {access.data && approved.length === 0 && (
            <p className="text-graphite">
              Nenhuma moto autorizada para a oficina. Peça a autorização pela placa na <Link to={`/oficina/${orgId}`} className="underline">visão geral</Link>;
              o titular precisa aprovar antes do vínculo. O sistema nunca vincula só porque a placa é igual.
            </p>
          )}
          {approved.length > 0 && (
            <>
              <p className="mb-2 text-graphite">Escolha o passaporte que o titular autorizou:</p>
              <ul className="flex flex-col gap-1">
                {approved.map((a) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => link(a.motorcycle_id)} className="w-full rounded-doc border border-rule bg-sheet px-3 py-2 text-left hover:border-ink">
                      {a.brand} {a.model} {a.manufacturing_year} · {a.plate ? formatPlate(a.plate) : 'sem placa'}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {error && <div className="mt-2"><Notice tone="error">{error}</Notice></div>}
        </div>
      )}
    </li>
  )
}
