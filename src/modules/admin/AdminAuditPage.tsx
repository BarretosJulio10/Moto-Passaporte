import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { SelectField, TextField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { translateDbError } from '@/core/shared/dbErrors'
import { auditFacets, getAuditEntry, searchAudit, type AuditFilters, type AuditRow } from './adminApi'
import { ACTION_LABEL, ENTITY_LABEL } from './auditLabels'
import { ReasonForm } from './ReasonForm'

const EMPTY: AuditFilters = { entityType: '', action: '', from: '', to: '', actor: '' }

function Changes({ prev, next }: { prev: Record<string, unknown> | null; next: Record<string, unknown> | null }) {
  const keys = Array.from(new Set([...Object.keys(prev ?? {}), ...Object.keys(next ?? {})])).filter(
    (k) => JSON.stringify(prev?.[k]) !== JSON.stringify(next?.[k]),
  )
  if (keys.length === 0) return <p className="text-sm text-muted">Sem diferenças de conteúdo.</p>
  const fmt = (v: unknown) => (v === undefined ? '—' : typeof v === 'string' ? v : JSON.stringify(v))
  return (
    <table className="mt-2 w-full text-left text-xs">
      <thead><tr className="text-muted"><th className="py-1 pr-3">Campo</th><th className="py-1 pr-3">Antes</th><th className="py-1">Depois</th></tr></thead>
      <tbody>
        {keys.map((k) => (
          <tr key={k} className="border-t border-rule align-top">
            <td className="py-1 pr-3 font-semibold">{k}</td>
            <td className="break-all py-1 pr-3">{fmt(prev?.[k])}</td>
            <td className="break-all py-1">{fmt(next?.[k])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Row({ e }: { e: AuditRow }) {
  const [asking, setAsking] = useState(false)
  const open = useMutation({ mutationFn: (reason: string) => getAuditEntry(e.id, reason), onSuccess: () => setAsking(false) })
  return (
    <li className="py-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-graphite">
            <span className="font-semibold text-ink">{e.actor_name}</span> {ACTION_LABEL[e.action] ?? e.action} {ENTITY_LABEL[e.entity_type] ?? e.entity_type}
            {e.motorcycle_label ? ` · ${e.motorcycle_label}` : ''}
            {e.organization_name ? ` · ${e.organization_name}` : ''}
          </p>
          <p className="text-xs text-muted">
            {new Date(e.created_at).toLocaleString('pt-BR')} · evento {e.id}
            {e.entity_id ? ` · ${e.entity_type} ${e.entity_id.slice(0, 8)}` : ''}
          </p>
          {e.reason && <p className="mt-0.5 text-xs text-graphite">Motivo: {e.reason}</p>}
        </div>
        {e.has_data && !asking && !open.data && <Button size="sm" variant="quiet" onClick={() => setAsking(true)}>Ver conteúdo</Button>}
      </div>
      {asking && (
        <ReasonForm title="Por que você precisa ver o conteúdo deste evento?" confirmLabel="Ver conteúdo" pending={open.isPending}
          error={open.isError ? translateDbError(open.error as { code?: string; message?: string }) : null}
          onCancel={() => setAsking(false)} onConfirm={(r) => open.mutate(r)} />
      )}
      {open.data && <Changes prev={open.data.previous_data} next={open.data.new_data} />}
    </li>
  )
}

/** Consulta da auditoria (PRD 7.7). Conteúdo dos eventos só com motivo, e a consulta também é auditada. */
export function AdminAuditPage() {
  const [draft, setDraft] = useState<AuditFilters>(EMPTY)
  const [filters, setFilters] = useState<AuditFilters>(EMPTY)
  const facets = useQuery({ queryKey: ['audit-facets'], queryFn: auditFacets })
  const list = useInfiniteQuery({
    queryKey: ['admin-audit-search', filters],
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) => searchAudit(filters, pageParam),
    getNextPageParam: (last) => (last.length === 50 ? last[last.length - 1]!.id : undefined),
  })
  const rows = list.data?.pages.flat() ?? []

  function submit(ev: FormEvent) {
    ev.preventDefault()
    setFilters(draft)
  }

  return (
    <div>
      <Link to="/admin" className="text-sm text-muted underline underline-offset-4">Administração</Link>
      <h1 className="heading mt-2 text-3xl text-ink">Auditoria</h1>
      <p className="mt-1 max-w-2xl text-muted">
        Quem fez o quê e quando: registros, transferências, autorizações, ações administrativas e eventos financeiros. A lista não mostra dados
        privados; o conteúdo de um evento pede motivo.
      </p>
      <form onSubmit={submit} className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6" role="search" aria-label="Filtros da auditoria">
        <SelectField label="Tipo" value={draft.entityType} options={facets.data?.entity_types ?? []} placeholder="Todos"
          optionLabel={(v) => ENTITY_LABEL[v] ?? v} onChange={(e) => setDraft({ ...draft, entityType: e.target.value })} />
        <SelectField label="Ação" value={draft.action} options={facets.data?.actions ?? []} placeholder="Todas"
          optionLabel={(v) => ACTION_LABEL[v] ?? v} onChange={(e) => setDraft({ ...draft, action: e.target.value })} />
        <TextField label="De" type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
        <TextField label="Até" type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
        <TextField label="Autor (id da conta)" value={draft.actor} onChange={(e) => setDraft({ ...draft, actor: e.target.value })} spellCheck={false} />
        <div className="flex items-end gap-2">
          <Button type="submit" variant="secondary">Filtrar</Button>
          <Button type="button" variant="quiet" onClick={() => { setDraft(EMPTY); setFilters(EMPTY) }}>Limpar</Button>
        </div>
      </form>
      {list.isError && <div className="mt-4"><Notice tone="error">Não foi possível carregar a auditoria.</Notice></div>}
      {list.isSuccess && rows.length === 0 && <p className="mt-4 text-muted">Nenhum evento com esses filtros.</p>}
      <ul className="mt-5 divide-y divide-rule border-y border-rule">
        {rows.map((e) => <Row key={e.id} e={e} />)}
      </ul>
      {list.hasNextPage && (
        <div className="mt-4">
          <Button variant="secondary" onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage}>Carregar mais</Button>
        </div>
      )}
    </div>
  )
}
