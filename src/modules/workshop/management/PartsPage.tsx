import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { CheckboxField, SelectField, TextAreaField, TextField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { PageHeader } from '@/components/AppLayout'
import { translateDbError } from '@/core/shared/dbErrors'
import { Card, EmptyState, WorkshopShell } from '../shared/WorkshopShell'
import { centsToInput, formatCents, parseMoney } from '../shared/rpc'
import { PART_UNITS, listParts, partMargin, savePart, type Part, type PartUnit } from './api'

type Err = { code?: string; message?: string }
const pct = (n: number | null) => n == null ? '' : `${n.toLocaleString('pt-BR')}%`

/** Catálogo de peças e produtos (PRD 2.1 §11). Estoque fica para depois; aqui é cadastro e preço. */
export function PartsPage() {
  return <WorkshopShell>{({ orgId, perms }) => <PartsView orgId={orgId} canEdit={perms.manage_prices} />}</WorkshopShell>
}

function PartsView({ orgId, canEdit }: { orgId: string; canEdit: boolean }) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [inactive, setInactive] = useState(false)
  const [editing, setEditing] = useState<'new' | string | null>(null)
  const q = useQuery({ queryKey: ['ws-parts', orgId, search, inactive], queryFn: () => listParts(orgId, search, inactive) })
  const refresh = () => qc.invalidateQueries({ queryKey: ['ws-parts', orgId] })
  const done = async () => { await refresh(); setEditing(null) }

  return (
    <div>
      <PageHeader title="Peças e produtos"
        intro="Cadastre as peças que você usa com frequência. No orçamento, é só escolher e o preço de venda entra sozinho. O custo nunca aparece para o cliente."
        actions={canEdit && editing === null && <Button onClick={() => setEditing('new')}>Nova peça</Button>} />
      {!canEdit && <div className="mt-4 max-w-2xl"><Notice tone="info">Você pode consultar. Para cadastrar e mudar preços, o responsável precisa liberar "Serviços, peças e preços".</Notice></div>}

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <TextField label="Buscar" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome, código, fabricante ou modelo" className="min-w-[16rem] flex-1 sm:max-w-md" />
        <CheckboxField label="Mostrar inativas" checked={inactive} onChange={(e) => setInactive(e.target.checked)} />
      </div>

      <Card className="mt-4">
        {editing === 'new' && <PartForm orgId={orgId} canSeeCost={canEdit} onDone={done} onCancel={() => setEditing(null)} />}
        {q.isLoading && <p className="text-muted" role="status">Carregando…</p>}
        {q.isError && <Notice tone="error">{translateDbError(q.error as Err)}</Notice>}
        {q.data && q.data.length === 0 && editing !== 'new' && (
          <EmptyState title={search ? 'Nenhuma peça encontrada' : 'Nenhuma peça cadastrada'}
            action={canEdit && !search && <Button onClick={() => setEditing('new')}>Cadastrar peça</Button>}>
            Ex.: óleo 10W30, vela de ignição, kit relação, pastilha de freio.
          </EmptyState>
        )}
        <ul className="divide-y divide-rule/70">
          {(q.data ?? []).map((p) => editing === p.id ? (
            <li key={p.id} className="py-3"><PartForm orgId={orgId} part={p} canSeeCost={canEdit} onDone={done} onCancel={() => setEditing(null)} /></li>
          ) : (
            <li key={p.id} className={`flex flex-wrap items-center justify-between gap-3 py-3 ${p.active ? '' : 'opacity-60'}`}>
              <div className="min-w-0">
                <p className="font-semibold text-ink">{p.name}{p.internal_code && <span className="ml-2 text-xs font-normal text-muted">cód. {p.internal_code}</span>}
                  {!p.active && <span className="ml-2 text-xs font-normal text-muted">(inativa)</span>}</p>
                <p className="text-sm text-muted">{[p.category, p.manufacturer, p.compatible_brand, p.compatible_models].filter(Boolean).join(' · ') || 'sem detalhes'}</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right text-sm tabular-nums">
                  <p className="font-semibold text-ink">{p.sale_cents != null ? `${formatCents(p.sale_cents)} / ${p.unit}` : 'sem preço'}</p>
                  {canEdit && p.cost_cents != null && (
                    <p className="text-xs text-muted">custo {formatCents(p.cost_cents)}{partMargin(p.cost_cents, p.sale_cents) != null ? ` · margem ${pct(partMargin(p.cost_cents, p.sale_cents))}` : ''}</p>
                  )}
                </div>
                {canEdit && <Button size="sm" variant="secondary" onClick={() => setEditing(p.id)}>Editar</Button>}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

function PartForm({ orgId, part, canSeeCost, onDone, onCancel }: { orgId: string; part?: Part; canSeeCost: boolean; onDone: () => Promise<void>; onCancel: () => void }) {
  const [v, setV] = useState({
    name: part?.name ?? '', internal_code: part?.internal_code ?? '', category: part?.category ?? '', manufacturer: part?.manufacturer ?? '',
    compatible_brand: part?.compatible_brand ?? '', compatible_models: part?.compatible_models ?? '', cost: centsToInput(part?.cost_cents),
    sale: centsToInput(part?.sale_cents), unit: part?.unit ?? ('un' as PartUnit), notes: part?.notes ?? '', active: part?.active ?? true,
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const cost = parseMoney(v.cost)
  const sale = parseMoney(v.sale)
  const margin = partMargin(cost, sale)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (v.name.trim().length < 2) return setError('Informe o nome da peça.')
    if (v.cost && cost === null) return setError('Custo inválido. Use, por exemplo, 25,90.')
    if (v.sale && sale === null) return setError('Preço de venda inválido. Use, por exemplo, 45,00.')
    setSaving(true)
    setError(null)
    try {
      await savePart(orgId, part?.id ?? null, {
        name: v.name.trim(), internal_code: v.internal_code, category: v.category, manufacturer: v.manufacturer, compatible_brand: v.compatible_brand,
        compatible_models: v.compatible_models, cost_cents: cost, sale_cents: sale, unit: v.unit, notes: v.notes, active: v.active,
      })
      await onDone()
    } catch (err) {
      setError(translateDbError(err as Err))
    } finally {
      setSaving(false)
    }
  }
  return (
    <form onSubmit={submit} className="mb-4 rounded-doc border border-rule bg-paper/60 p-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <TextField label="Nome da peça" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required className="sm:col-span-2" />
        <TextField label="Código interno" value={v.internal_code} onChange={(e) => setV({ ...v, internal_code: e.target.value })} />
        <TextField label="Categoria" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })} placeholder="Óleo, freio, elétrica…" />
        <TextField label="Fabricante" value={v.manufacturer} onChange={(e) => setV({ ...v, manufacturer: e.target.value })} />
        <TextField label="Marca de moto compatível" value={v.compatible_brand} onChange={(e) => setV({ ...v, compatible_brand: e.target.value })} />
        <TextField label="Modelos compatíveis" value={v.compatible_models} onChange={(e) => setV({ ...v, compatible_models: e.target.value })} className="sm:col-span-2 lg:col-span-3" placeholder="CG 160, Fan 160, Bros 160" />
        {canSeeCost && <TextField label="Custo (R$)" value={v.cost} onChange={(e) => setV({ ...v, cost: e.target.value })} inputMode="decimal" hint="Só a equipe de preços vê." />}
        <TextField label="Preço de venda (R$)" value={v.sale} onChange={(e) => setV({ ...v, sale: e.target.value })} inputMode="decimal"
          hint={margin != null ? `Margem sobre a venda: ${pct(margin)}` : undefined} />
        <SelectField label="Unidade" value={v.unit} options={PART_UNITS} onChange={(e) => setV({ ...v, unit: e.target.value as PartUnit })} />
        <TextAreaField label="Observação" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} rows={2} className="sm:col-span-2 lg:col-span-3" />
        <CheckboxField label="Ativa (aparece no orçamento)" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} />
      </div>
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      <div className="mt-4 flex gap-2">
        <Button type="submit" size="sm" loading={saving}>Salvar peça</Button>
        <Button type="button" size="sm" variant="secondary" onClick={onCancel}>Cancelar</Button>
      </div>
    </form>
  )
}
