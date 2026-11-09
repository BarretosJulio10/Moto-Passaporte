import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button, ButtonLink } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { PageHeader } from '@/components/AppLayout'
import { translateDbError } from '@/core/shared/dbErrors'
import { formatDate, formatPlate } from '@/core/shared/format'
import { createQuote, listQuotes, STATUS_LABEL, STATUS_TONE } from './api'
import { fetchCustomer, listCustomers, vehicleLabel } from '../customers/api'
import { EmptyState, StatusChip, WorkshopShell } from '../shared/WorkshopShell'
import { formatCents, formatPhone } from '../shared/rpc'

type Err = { code?: string; message?: string }

const FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'draft', label: 'Rascunhos' },
  { value: 'open', label: 'Aguardando cliente' },
  { value: 'won', label: 'Aprovados' },
  { value: 'rejected', label: 'Recusados' },
  { value: 'expired', label: 'Vencidos' },
  { value: 'canceled', label: 'Cancelados' },
]

export function QuotesPage() {
  return <WorkshopShell>{({ orgId, perms }) => <Quotes orgId={orgId} canEdit={perms.manage_quotes} />}</WorkshopShell>
}

function Quotes({ orgId, canEdit }: { orgId: string; canEdit: boolean }) {
  const [params, setParams] = useSearchParams()
  const status = params.get('situacao') ?? ''
  const [search, setSearch] = useState('')
  const list = useQuery({ queryKey: ['ws-quotes', orgId, status, search], queryFn: () => listQuotes(orgId, status, search) })

  return (
    <div>
      <PageHeader title="Orçamentos" intro="Monte, envie pelo WhatsApp e acompanhe a resposta do cliente. Orçamento aprovado não vira histórico da moto: só o serviço executado."
        actions={canEdit && <ButtonLink to={`/oficina/${orgId}/orcamentos/novo`}>Novo orçamento</ButtonLink>} />
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por situação">
          {FILTERS.map((f) => (
            <button key={f.value} type="button" aria-pressed={status === f.value}
              onClick={() => setParams(f.value ? { situacao: f.value } : {})}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${status === f.value ? 'border-ink bg-ink text-sheet' : 'border-rule text-ink hover:border-ink'}`}>
              {f.label}
            </button>
          ))}
        </div>
        <label className="ml-auto flex min-w-[15rem] flex-1 flex-col gap-1.5 sm:max-w-sm">
          <span className="sr-only">Buscar</span>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nº, cliente, moto ou placa"
            className="w-full rounded-doc border border-rule bg-sheet px-3.5 py-2.5 text-base focus:border-ink focus:outline-none" />
        </label>
      </div>
      <div className="mt-5">
        {list.isLoading && <p className="text-muted" role="status">Carregando…</p>}
        {list.isError && <Notice tone="error">{translateDbError(list.error as Err)}</Notice>}
        {list.data?.length === 0 && (
          <EmptyState title="Nenhum orçamento aqui" action={canEdit && !search && !status && <ButtonLink to={`/oficina/${orgId}/orcamentos/novo`}>Criar o primeiro orçamento</ButtonLink>}>
            {search || status ? 'Mude o filtro ou a busca.' : 'Escolha o cliente, adicione os serviços e envie o link de aprovação.'}
          </EmptyState>
        )}
        {list.data && list.data.length > 0 && (
          <div className="overflow-x-auto rounded-sheet border border-rule bg-sheet">
            <table className="w-full min-w-[46rem] text-left text-sm">
              <thead className="border-b border-rule text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3">Nº</th>
                  <th scope="col" className="px-4 py-3">Cliente e moto</th>
                  <th scope="col" className="px-4 py-3">Situação</th>
                  <th scope="col" className="px-4 py-3">Validade</th>
                  <th scope="col" className="px-4 py-3 text-right">Total</th>
                  <th scope="col" className="px-4 py-3 text-right">Aprovado</th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((q) => (
                  <tr key={q.id} className="border-b border-rule/60 last:border-0 hover:bg-paper/50">
                    <td className="px-4 py-3">
                      <Link to={`/oficina/${orgId}/orcamentos/${q.id}`} className="font-semibold text-ink underline-offset-4 hover:underline">{q.number}</Link>
                      {q.current_version > 1 && <span className="ml-1 text-xs text-muted">v{q.current_version}</span>}
                      {q.parent_quote_id && <span className="ml-1 text-xs text-stamp">compl.</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/oficina/${orgId}/orcamentos/${q.id}`} className="block">
                        <span className="font-semibold text-ink">{q.customer_name}</span>
                        <span className="block text-muted">{[q.brand, q.model].filter(Boolean).join(' ') || 'Sem moto'}{q.plate ? ` · ${formatPlate(q.plate)}` : ''}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip className={STATUS_TONE[q.status]}>{STATUS_LABEL[q.status]}</StatusChip>
                      {q.status === 'sent' && !q.viewed_at && <span className="mt-1 block text-xs text-muted">ainda não aberto</span>}
                    </td>
                    <td className="px-4 py-3 text-graphite">{formatDate(q.valid_until, 'short')}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatCents(q.total_cents)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{q.approved_total_cents !== null ? formatCents(q.approved_total_cents) : '—'}</td>
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

/** Escolhe cliente e moto e já abre o editor (PRD 2.1 §22: orçamento rápido). */
export function NewQuotePage() {
  return <WorkshopShell>{({ orgId, perms }) => perms.manage_quotes
    ? <NewQuote orgId={orgId} />
    : <Notice tone="info" title="Sem permissão">Seu acesso não inclui fazer orçamentos. Fale com o responsável.</Notice>}</WorkshopShell>
}

function NewQuote({ orgId }: { orgId: string }) {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [customerId, setCustomerId] = useState(params.get('cliente') ?? '')
  const [vehicleId, setVehicleId] = useState(params.get('moto') ?? '')
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const customers = useQuery({ queryKey: ['ws-customers', orgId, search, false], queryFn: () => listCustomers(orgId, search), enabled: !customerId })
  const customer = useQuery({ queryKey: ['ws-customer', orgId, customerId], queryFn: () => fetchCustomer(orgId, customerId), enabled: Boolean(customerId) })
  const vehicles = (customer.data?.vehicles ?? []).filter((v) => v.status === 'active')

  useEffect(() => {
    const only = vehicles.length === 1 ? vehicles[0] : undefined
    if (customer.data && !vehicleId && only) setVehicleId(only.id)
  }, [customer.data, vehicleId, vehicles])

  async function create() {
    setCreating(true)
    setError(null)
    try {
      const id = await createQuote(orgId, customerId, vehicleId || null)
      navigate(`/oficina/${orgId}/orcamentos/${id}`, { replace: true })
    } catch (err) {
      setError(translateDbError(err as Err))
      setCreating(false)
    }
  }

  return (
    <div>
      <PageHeader title="Novo orçamento" intro="Escolha o cliente e a moto. Na próxima tela você adiciona os serviços e as peças." />
      <div className="mt-6 grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="min-w-0">
      {!customerId && (
        <div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-1 flex-col gap-1.5">
              <span className="text-sm font-semibold text-graphite">Cliente</span>
              <input type="search" autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome, telefone ou placa"
                className="w-full rounded-doc border border-rule bg-sheet px-3.5 py-2.5 text-base focus:border-ink focus:outline-none" />
            </label>
            <ButtonLink to={`/oficina/${orgId}/clientes/novo`} variant="secondary">Cliente novo</ButtonLink>
          </div>
          {customers.isLoading && <p className="mt-4 text-muted" role="status">Carregando…</p>}
          {customers.data?.length === 0 && <p className="mt-4 text-muted">Nenhum cliente encontrado. Cadastre um cliente novo.</p>}
          <ul className="mt-4 flex flex-col gap-2">
            {customers.data?.slice(0, 30).map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => { setCustomerId(c.id); setVehicleId('') }}
                  className="w-full rounded-doc border border-rule bg-sheet px-4 py-3 text-left hover:border-ink">
                  <span className="font-semibold text-ink">{c.full_name}</span>
                  <span className="block text-sm text-muted">{[formatPhone(c.whatsapp ?? c.phone), c.vehicle_labels].filter(Boolean).join(' · ') || 'Sem moto cadastrada'}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {customerId && (
        <div className="rounded-sheet border border-rule bg-sheet p-5">
          {customer.isLoading && <p className="text-muted" role="status">Carregando…</p>}
          {customer.data && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p><span className="text-sm text-muted">Cliente</span><br /><span className="heading text-lg text-ink">{customer.data.full_name}</span></p>
                <Button size="sm" variant="quiet" onClick={() => { setCustomerId(''); setVehicleId('') }}>Trocar cliente</Button>
              </div>
              <fieldset className="mt-4">
                <legend className="text-sm font-semibold text-graphite">Moto</legend>
                <div className="mt-2 flex flex-col gap-2">
                  {vehicles.map((v) => (
                    <label key={v.id} className={`flex cursor-pointer items-center gap-3 rounded-doc border px-4 py-3 ${vehicleId === v.id ? 'border-ink bg-ink/5' : 'border-rule'}`}>
                      <input type="radio" name="moto" checked={vehicleId === v.id} onChange={() => setVehicleId(v.id)} className="accent-ink" />
                      <span>{vehicleLabel(v)}{v.plate ? ` · ${formatPlate(v.plate)}` : ''}</span>
                    </label>
                  ))}
                  <label className={`flex cursor-pointer items-center gap-3 rounded-doc border px-4 py-3 ${vehicleId === '' ? 'border-ink bg-ink/5' : 'border-rule'}`}>
                    <input type="radio" name="moto" checked={vehicleId === ''} onChange={() => setVehicleId('')} className="accent-ink" />
                    <span className="text-muted">Sem moto por enquanto</span>
                  </label>
                </div>
                <Link to={`/oficina/${orgId}/clientes/${customerId}`} className="mt-2 inline-block text-sm text-muted underline underline-offset-4">Cadastrar outra moto deste cliente</Link>
              </fieldset>
              {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
              <div className="mt-5"><Button onClick={create} loading={creating}>Montar o orçamento</Button></div>
            </>
          )}
        </div>
      )}
      </div>
      <aside aria-labelledby="como-funciona" className="rounded-sheet border border-rule bg-sheet p-4 sm:p-5 xl:sticky xl:top-6">
        <h2 id="como-funciona" className="heading text-lg text-ink">Como funciona</h2>
        <ol className="mt-3 space-y-3 text-sm">
          {[
            ['Cliente e moto', 'Busque pelo nome, telefone ou placa. Cliente novo leva 30 segundos.'],
            ['Serviços e peças', 'Na próxima tela, puxe itens do catálogo de preços ou digite; o total se calcula sozinho.'],
            ['Envio e aprovação', 'O cliente recebe um link pelo seu WhatsApp e aprova ou recusa item por item, sem precisar de conta.'],
            ['Ordem de serviço', 'Aprovado, o orçamento vira OS com um clique, e o serviço entra no histórico da moto.'],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span aria-hidden="true" className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${i === 0 ? 'bg-ink text-sheet' : 'bg-paper text-graphite'}`}>{i + 1}</span>
              <span><span className="block font-semibold text-ink">{t}</span><span className="text-muted">{d}</span></span>
            </li>
          ))}
        </ol>
      </aside>
      </div>
    </div>
  )
}
