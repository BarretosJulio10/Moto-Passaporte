import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, ButtonLink } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { PageHeader } from '@/components/AppLayout'
import { translateDbError } from '@/core/shared/dbErrors'
import { formatDate, formatPlate } from '@/core/shared/format'
import { listCustomers, listVehicles, saveCustomer, saveVehicle, type CustomerInput, type VehicleInput } from './api'
import { CustomerFields, VehicleFields, emptyVehicle, validateCustomer, validateVehicle } from './forms'
import { Card, EmptyState, WorkshopShell } from '../shared/WorkshopShell'
import { formatPhone, onlyDigits } from '../shared/rpc'

export function CustomersPage() {
  return <WorkshopShell>{({ orgId, perms }) => <Customers orgId={orgId} canEdit={perms.manage_quotes} />}</WorkshopShell>
}

function Customers({ orgId, canEdit }: { orgId: string; canEdit: boolean }) {
  const [search, setSearch] = useState('')
  const [archived, setArchived] = useState(false)
  const list = useQuery({ queryKey: ['ws-customers', orgId, search, archived], queryFn: () => listCustomers(orgId, search, archived) })

  return (
    <div>
      <PageHeader title="Clientes" intro="Os clientes são da sua oficina. Não precisam ter conta no Moto Passaporte."
        actions={canEdit && <ButtonLink to={`/oficina/${orgId}/clientes/novo`}>Novo cliente</ButtonLink>} />
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className="flex min-w-[16rem] flex-1 flex-col gap-1.5">
          <span className="text-sm font-semibold text-graphite">Buscar</span>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome, telefone ou placa"
            className="w-full rounded-doc border border-rule bg-sheet px-3.5 py-2.5 text-base focus:border-ink focus:outline-none" />
        </label>
        <label className="flex items-center gap-2 pb-3 text-sm text-graphite">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} className="h-4 w-4 accent-ink" />
          Mostrar arquivados
        </label>
      </div>

      <div className="mt-5">
        {list.isLoading && <p className="text-muted" role="status">Carregando…</p>}
        {list.isError && <Notice tone="error">{translateDbError(list.error as { code?: string; message?: string })}</Notice>}
        {list.data && list.data.length === 0 && (
          <EmptyState title={search ? 'Nenhum cliente encontrado' : 'Nenhum cliente ainda'}
            action={canEdit && !search && <ButtonLink to={`/oficina/${orgId}/clientes/novo`}>Cadastrar o primeiro cliente</ButtonLink>}>
            {search ? 'Tente outro nome, telefone ou placa.' : 'Cadastre o cliente e a moto para montar o primeiro orçamento.'}
          </EmptyState>
        )}
        {list.data && list.data.length > 0 && (
          <div className="overflow-x-auto rounded-sheet border border-rule bg-sheet">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-rule text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3">Cliente</th>
                  <th scope="col" className="px-4 py-3">Contato</th>
                  <th scope="col" className="px-4 py-3">Motos</th>
                  <th scope="col" className="px-4 py-3 text-right">Orçamentos</th>
                  <th scope="col" className="px-4 py-3">Último orçamento</th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((c) => (
                  <tr key={c.id} className="border-b border-rule/60 last:border-0 hover:bg-paper/50">
                    <td className="px-4 py-3">
                      <Link to={`/oficina/${orgId}/clientes/${c.id}`} className="font-semibold text-ink underline-offset-4 hover:underline">{c.full_name}</Link>
                      {c.status === 'archived' && <span className="ml-2 text-xs text-muted">(arquivado)</span>}
                    </td>
                    <td className="px-4 py-3 text-graphite">{formatPhone(c.whatsapp ?? c.phone) || '—'}</td>
                    <td className="px-4 py-3 text-graphite">{c.vehicle_labels || '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.quotes}</td>
                    <td className="px-4 py-3 text-muted">{c.last_quote_at ? formatDate(c.last_quote_at, 'short') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

const emptyCustomer = (): CustomerInput => ({ full_name: '', whatsapp: '', phone: '', email: '', cpf: '', address: '', birth_date: '', notes: '', first_visit_at: '', source: 'balcao' })

/** Cadastro de cliente com a primeira moto, e atalho para já abrir o orçamento (PRD 2.1 §22). */
export function NewCustomerPage() {
  return <WorkshopShell>{({ orgId, perms }) => perms.manage_quotes
    ? <NewCustomer orgId={orgId} />
    : <Notice tone="info" title="Sem permissão">Seu acesso não inclui cadastrar clientes. Fale com o responsável.</Notice>}</WorkshopShell>
}

function NewCustomer({ orgId }: { orgId: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [customer, setCustomer] = useState<CustomerInput>(emptyCustomer)
  const [withVehicle, setWithVehicle] = useState(true)
  const [vehicle, setVehicle] = useState<VehicleInput>(emptyVehicle)
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const [vErrors, setVErrors] = useState<Record<string, string | undefined>>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<'' | 'save' | 'quote'>('')

  async function submit(e: { preventDefault(): void }, then: 'save' | 'quote') {
    e.preventDefault()
    const ce = validateCustomer(customer)
    const ve = withVehicle ? validateVehicle(vehicle) : {}
    setErrors(ce)
    setVErrors(ve)
    if (Object.keys(ce).length || Object.keys(ve).length) return
    setSaving(then)
    setError(null)
    try {
      const id = await saveCustomer(orgId, null, customer)
      let vehicleId: string | null = null
      if (withVehicle) vehicleId = await saveVehicle(orgId, null, id, { ...vehicle, km: onlyDigits(vehicle.km) })
      await queryClient.invalidateQueries({ queryKey: ['ws-customers', orgId] })
      if (then === 'quote') navigate(`/oficina/${orgId}/orcamentos/novo?cliente=${id}${vehicleId ? `&moto=${vehicleId}` : ''}`)
      else navigate(`/oficina/${orgId}/clientes/${id}`)
    } catch (err) {
      setError(translateDbError(err as { code?: string; message?: string }))
    } finally {
      setSaving('')
    }
  }

  return (
    <form onSubmit={(e) => submit(e, 'save')} noValidate>
      <PageHeader title="Novo cliente" intro="Só o nome é obrigatório. O resto você completa quando quiser." />
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card title="Cliente"><CustomerFields value={customer} onChange={setCustomer} errors={errors} /></Card>
        <Card title="Moto" actions={
          <label className="flex items-center gap-2 text-sm text-graphite">
            <input type="checkbox" checked={withVehicle} onChange={(e) => setWithVehicle(e.target.checked)} className="h-4 w-4 accent-ink" />
            Cadastrar agora
          </label>}>
          {withVehicle ? (
            <>
              <VehicleFields value={vehicle} onChange={setVehicle} errors={vErrors} />
              <p className="mt-3 text-sm text-muted">
                Este cadastro é da oficina e não cria passaporte. Se o cliente já tiver Moto Passaporte, peça a autorização pela placa
                na visão geral e depois vincule na página do cliente.
              </p>
            </>
          ) : <p className="text-muted">Você pode cadastrar a moto depois, na página do cliente.</p>}
        </Card>
      </div>
      {error && <div className="mt-4 max-w-2xl"><Notice tone="error">{error}</Notice></div>}
      <div className="mt-6 flex flex-wrap gap-2">
        <Button type="button" loading={saving === 'quote'} disabled={Boolean(saving)} onClick={(e) => submit(e, 'quote')}>Salvar e criar orçamento</Button>
        <Button type="submit" variant="secondary" loading={saving === 'save'} disabled={Boolean(saving)}>Só salvar</Button>
        <ButtonLink to={`/oficina/${orgId}/clientes`} variant="quiet">Cancelar</ButtonLink>
      </div>
    </form>
  )
}

export function VehiclesPage() {
  return <WorkshopShell>{({ orgId }) => <Vehicles orgId={orgId} />}</WorkshopShell>
}

function Vehicles({ orgId }: { orgId: string }) {
  const [search, setSearch] = useState('')
  const list = useQuery({ queryKey: ['ws-vehicles', orgId, search], queryFn: () => listVehicles(orgId, search) })
  return (
    <div>
      <PageHeader title="Motos atendidas" intro="Cadastro comercial da oficina. Não é o passaporte da moto nem prova de titularidade." />
      <label className="mt-5 flex max-w-xl flex-col gap-1.5">
        <span className="text-sm font-semibold text-graphite">Buscar</span>
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Placa, modelo ou cliente"
          className="w-full rounded-doc border border-rule bg-sheet px-3.5 py-2.5 text-base focus:border-ink focus:outline-none" />
      </label>
      <div className="mt-5">
        {list.isLoading && <p className="text-muted" role="status">Carregando…</p>}
        {list.isError && <Notice tone="error">{translateDbError(list.error as { code?: string; message?: string })}</Notice>}
        {list.data?.length === 0 && (
          <EmptyState title="Nenhuma moto encontrada">As motos entram aqui quando você cadastra um cliente.</EmptyState>
        )}
        {list.data && list.data.length > 0 && (
          <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {list.data.map((v) => (
              <li key={v.id}>
                <Link to={`/oficina/${orgId}/clientes/${v.customer_id}`} className="block rounded-sheet border border-rule bg-sheet p-4 hover:border-ink/40">
                  <p className="font-semibold text-ink">{[v.brand, v.model, v.version, v.year].filter(Boolean).join(' ')}</p>
                  <p className="mt-1 text-sm text-graphite">{v.plate ? formatPlate(v.plate) : 'Sem placa'} · {v.customer_name}</p>
                  <p className="mt-1 text-xs text-muted">
                    {v.quotes} orçamento{v.quotes === 1 ? '' : 's'}{v.linked ? ' · vinculada ao passaporte' : ''}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
