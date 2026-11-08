import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { CheckboxField, SelectField, TextAreaField, TextField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { PageHeader } from '@/components/AppLayout'
import { translateDbError } from '@/core/shared/dbErrors'
import {
  CATEGORY_LABEL, CHARGE_LABEL, CHARGE_TYPES, COMPLEXITIES, COMPLEXITY_LABEL, SERVICE_CATEGORIES,
  deletePriceRule, fetchCatalog, ruleLabel, savePriceRule, savePriceTable, saveService,
  type Catalog, type ChargeType, type Complexity, type PriceRuleInput, type Service, type ServiceCategory, type ServiceInput,
} from './api'
import { Card, EmptyState, WorkshopShell } from '../shared/WorkshopShell'
import { centsToInput, formatCents, parseMoney } from '../shared/rpc'

type Err = { code?: string; message?: string }

export function CatalogPage() {
  return <WorkshopShell>{({ orgId, perms }) => <CatalogView orgId={orgId} canEdit={perms.manage_prices} />}</WorkshopShell>
}

function CatalogView({ orgId, canEdit }: { orgId: string; canEdit: boolean }) {
  const queryClient = useQueryClient()
  const q = useQuery({ queryKey: ['ws-catalog', orgId], queryFn: () => fetchCatalog(orgId) })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['ws-catalog', orgId] })
  const [editing, setEditing] = useState<'new' | string | null>(null)

  if (q.isLoading) return <p className="text-muted" role="status">Carregando…</p>
  if (q.isError || !q.data) return <Notice tone="error">{translateDbError(q.error as Err)}</Notice>
  const cat = q.data

  return (
    <div>
      <PageHeader title="Serviços e preços"
        intro="Os preços são da sua oficina. No orçamento, o sistema sugere o preço mais específico para a moto e você sempre pode mudar."
        actions={canEdit && editing === null && <Button onClick={() => setEditing('new')}>Novo serviço</Button>} />
      {!canEdit && <div className="mt-4 max-w-2xl"><Notice tone="info">Você pode consultar. Para mudar preços, o responsável precisa liberar a permissão "Serviços e preços".</Notice></div>}

      <div className="mt-6 grid gap-6 2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Card title="Catálogo de serviços">
          {editing === 'new' && <ServiceForm orgId={orgId} onDone={async () => { await refresh(); setEditing(null) }} onCancel={() => setEditing(null)} />}
          {cat.services.length === 0 && editing !== 'new' && (
            <EmptyState title="Nenhum serviço cadastrado"
              action={canEdit && <Button onClick={() => setEditing('new')}>Cadastrar serviço</Button>}>
              Ex.: troca de óleo, troca de relação, revisão de freios. Você também pode lançar itens avulsos direto no orçamento.
            </EmptyState>
          )}
          <ul className="divide-y divide-rule/70">
            {cat.services.map((s) => editing === s.id ? (
              <li key={s.id} className="py-3"><ServiceForm orgId={orgId} service={s} onDone={async () => { await refresh(); setEditing(null) }} onCancel={() => setEditing(null)} /></li>
            ) : (
              <li key={s.id} className={`flex flex-wrap items-center justify-between gap-2 py-3 ${s.active ? '' : 'opacity-60'}`}>
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{s.name}{!s.active && <span className="ml-2 text-xs font-normal text-muted">(inativo)</span>}</p>
                  <p className="text-sm text-muted">
                    {CATEGORY_LABEL[s.category]}{s.estimated_minutes ? ` · ~${s.estimated_minutes} min` : ''} · {CHARGE_LABEL[s.charge_type]}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular-nums text-graphite">{s.default_price_cents !== null ? formatCents(s.default_price_cents) : 'sem valor padrão'}</span>
                  {canEdit && <Button size="sm" variant="secondary" onClick={() => setEditing(s.id)}>Editar</Button>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <PriceTables orgId={orgId} catalog={cat} canEdit={canEdit} onChanged={refresh} />
      </div>
    </div>
  )
}

function ServiceForm({ orgId, service, onDone, onCancel }: { orgId: string; service?: Service; onDone: () => Promise<void>; onCancel: () => void }) {
  const [v, setV] = useState({
    name: service?.name ?? '', category: service?.category ?? ('outros' as ServiceCategory), description: service?.description ?? '',
    estimated_minutes: service?.estimated_minutes?.toString() ?? '', price: centsToInput(service?.default_price_cents),
    charge_type: service?.charge_type ?? ('fixed' as ChargeType), active: service?.active ?? true, notes: service?.notes ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (v.name.trim().length < 2) return setError('Informe o nome do serviço.')
    const cents = parseMoney(v.price)
    if (v.price && cents === null) return setError('Valor padrão inválido. Use, por exemplo, 120,00.')
    if (v.estimated_minutes && !/^\d+$/.test(v.estimated_minutes)) return setError('Tempo estimado em minutos (só números).')
    setSaving(true)
    setError(null)
    try {
      const input: ServiceInput = { name: v.name, category: v.category, description: v.description, estimated_minutes: v.estimated_minutes,
        default_price_cents: cents, charge_type: v.charge_type, active: v.active, notes: v.notes }
      await saveService(orgId, service?.id ?? null, input)
      await onDone()
    } catch (err) {
      setError(translateDbError(err as Err))
    } finally {
      setSaving(false)
    }
  }
  return (
    <form onSubmit={submit} className="mb-4 rounded-doc border border-rule bg-paper/60 p-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Nome do serviço" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required className="sm:col-span-2" />
        <SelectField label="Categoria" value={v.category} options={SERVICE_CATEGORIES} optionLabel={(o) => CATEGORY_LABEL[o as ServiceCategory]}
          onChange={(e) => setV({ ...v, category: e.target.value as ServiceCategory })} />
        <SelectField label="Tipo de cobrança" value={v.charge_type} options={CHARGE_TYPES} optionLabel={(o) => CHARGE_LABEL[o as ChargeType]}
          onChange={(e) => setV({ ...v, charge_type: e.target.value as ChargeType })} />
        <TextField label="Valor padrão (R$)" value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} inputMode="decimal" placeholder="120,00"
          hint="Usado quando não houver preço específico na tabela." />
        <TextField label="Tempo estimado (min)" value={v.estimated_minutes} onChange={(e) => setV({ ...v, estimated_minutes: e.target.value })} inputMode="numeric" />
        <TextAreaField label="Descrição" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} rows={2} className="sm:col-span-2" />
        <CheckboxField label="Ativo (aparece na hora de montar o orçamento)" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} />
      </div>
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      <div className="mt-4 flex gap-2">
        <Button type="submit" size="sm" loading={saving}>Salvar serviço</Button>
        <Button type="button" size="sm" variant="secondary" onClick={onCancel}>Cancelar</Button>
      </div>
    </form>
  )
}

function PriceTables({ orgId, catalog, canEdit, onChanged }: { orgId: string; catalog: Catalog; canEdit: boolean; onChanged: () => Promise<unknown> }) {
  const [tableId, setTableId] = useState<string>(catalog.tables[0]?.id ?? '')
  const [newTable, setNewTable] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const table = catalog.tables.find((t) => t.id === tableId) ?? catalog.tables[0]
  const rules = catalog.rules.filter((r) => r.table_id === table?.id)
  const serviceName = (id: string) => catalog.services.find((s) => s.id === id)?.name ?? 'Serviço removido'

  async function createTable(e: FormEvent) {
    e.preventDefault()
    if (newTable.trim().length < 2) return setError('Dê um nome à tabela.')
    try {
      const id = await savePriceTable(orgId, null, newTable.trim(), '', catalog.tables.length === 0)
      setNewTable('')
      setError(null)
      await onChanged()
      setTableId(id)
    } catch (err) {
      setError(translateDbError(err as Err))
    }
  }

  return (
    <Card title="Tabelas de preço">
      <p className="text-sm text-muted">
        Preço por marca, modelo, ano, cilindrada ou complexidade. Campo vazio vale para todas as motos.
        Ordem da sugestão: marca + modelo + ano, marca + modelo, faixa de cilindrada, valor padrão do serviço.
      </p>
      {catalog.tables.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Tabelas">
          {catalog.tables.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={t.id === table?.id} onClick={() => setTableId(t.id)}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${t.id === table?.id ? 'border-ink bg-ink text-sheet' : 'border-rule text-ink hover:border-ink'}`}>
              {t.name}{t.is_default ? ' · padrão' : ''}
            </button>
          ))}
        </div>
      )}
      {canEdit && (
        <form onSubmit={createTable} className="mt-4 flex flex-wrap items-end gap-2">
          <TextField label="Nova tabela" value={newTable} onChange={(e) => setNewTable(e.target.value)}
            placeholder={catalog.tables.length ? 'Ex.: Promocional, Alta cilindrada' : 'Tabela padrão'} className="min-w-[14rem] flex-1" />
          <Button type="submit" variant="secondary">Criar tabela</Button>
        </form>
      )}
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}

      {table && (
        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-ink">{table.name}</p>
            {canEdit && (
              <div className="flex gap-2">
                {!table.is_default && <Button size="sm" variant="quiet" onClick={async () => { await savePriceTable(orgId, table.id, table.name, table.description ?? '', true); await onChanged() }}>Tornar padrão</Button>}
                {!adding && catalog.services.length > 0 && <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>Adicionar preço</Button>}
              </div>
            )}
          </div>
          {adding && <RuleForm orgId={orgId} tableId={table.id} catalog={catalog} onCancel={() => setAdding(false)} onDone={async () => { await onChanged(); setAdding(false) }} />}
          {rules.length === 0 && !adding && (
            <p className="mt-3 text-sm text-muted">
              {catalog.services.length ? 'Nenhum preço específico nesta tabela. Os orçamentos usam o valor padrão de cada serviço.' : 'Cadastre serviços antes de definir preços.'}
            </p>
          )}
          {rules.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[30rem] text-left text-sm">
                <thead className="border-b border-rule text-xs uppercase tracking-wider text-muted">
                  <tr><th className="py-2 pr-3">Serviço</th><th className="py-2 pr-3">Vale para</th><th className="py-2 pr-3 text-right">Preço</th><th className="py-2" /></tr>
                </thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.id} className="border-b border-rule/60 last:border-0">
                      <td className="py-2 pr-3 font-semibold text-ink">{serviceName(r.service_id)}</td>
                      <td className="py-2 pr-3 text-graphite">{ruleLabel(r)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{formatCents(r.price_cents)}</td>
                      <td className="py-2 text-right">
                        {canEdit && <Button size="sm" variant="quiet" onClick={async () => { await deletePriceRule(orgId, r.id); await onChanged() }}>Remover</Button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

function RuleForm({ orgId, tableId, catalog, onDone, onCancel }: { orgId: string; tableId: string; catalog: Catalog; onDone: () => Promise<void>; onCancel: () => void }) {
  const active = catalog.services.filter((s) => s.active)
  const [v, setV] = useState({ service_id: active[0]?.id ?? '', brand: '', model: '', year_from: '', year_to: '', cc_min: '', cc_max: '', complexity: '' as Complexity | '', price: '' })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value })
  async function submit(e: FormEvent) {
    e.preventDefault()
    const cents = parseMoney(v.price)
    if (!v.service_id) return setError('Escolha o serviço.')
    if (cents === null) return setError('Informe o preço. Ex.: 85,00.')
    if (v.model && !v.brand) return setError('Para preço por modelo, informe também a marca.')
    for (const k of ['year_from', 'year_to', 'cc_min', 'cc_max'] as const) if (v[k] && !/^\d+$/.test(v[k])) return setError('Ano e cilindrada: só números.')
    setSaving(true)
    setError(null)
    try {
      const input: PriceRuleInput = { table_id: tableId, service_id: v.service_id, brand: v.brand, model: v.model, year_from: v.year_from,
        year_to: v.year_to, cc_min: v.cc_min, cc_max: v.cc_max, complexity: v.complexity, price_cents: cents }
      await savePriceRule(orgId, null, input)
      await onDone()
    } catch (err) {
      setError(translateDbError(err as Err))
    } finally {
      setSaving(false)
    }
  }
  return (
    <form onSubmit={submit} className="mt-3 rounded-doc border border-rule bg-paper/60 p-4" noValidate>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SelectField label="Serviço" value={v.service_id} options={active.map((s) => s.id)} optionLabel={(id) => active.find((s) => s.id === id)?.name ?? id}
          onChange={set('service_id')} className="sm:col-span-2" />
        <TextField label="Preço (R$)" value={v.price} onChange={set('price')} inputMode="decimal" placeholder="85,00" required />
        <SelectField label="Complexidade" value={v.complexity} options={COMPLEXITIES} placeholder="Qualquer" optionLabel={(o) => COMPLEXITY_LABEL[o as Complexity]}
          onChange={(e) => setV({ ...v, complexity: e.target.value as Complexity | '' })} />
        <TextField label="Marca" value={v.brand} onChange={set('brand')} placeholder="Todas" />
        <TextField label="Modelo" value={v.model} onChange={set('model')} placeholder="Todos" />
        <TextField label="Ano de" value={v.year_from} onChange={set('year_from')} inputMode="numeric" />
        <TextField label="Ano até" value={v.year_to} onChange={set('year_to')} inputMode="numeric" />
        <TextField label="Cilindrada de (cc)" value={v.cc_min} onChange={set('cc_min')} inputMode="numeric" />
        <TextField label="Cilindrada até (cc)" value={v.cc_max} onChange={set('cc_max')} inputMode="numeric" />
      </div>
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      <div className="mt-4 flex gap-2">
        <Button type="submit" size="sm" loading={saving}>Salvar preço</Button>
        <Button type="button" size="sm" variant="secondary" onClick={onCancel}>Cancelar</Button>
      </div>
    </form>
  )
}
