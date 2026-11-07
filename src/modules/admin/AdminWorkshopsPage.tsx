import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { TextField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { translateDbError } from '@/core/shared/dbErrors'
import {
  listWorkshops,
  setWorkshopStatus,
  setWorkshopVerification,
  VERIFICATION_LABEL,
  WORKSHOP_STATUS_LABEL,
  type AccountStatus,
  type AdminWorkshopRow,
} from './adminApi'
import { ReasonForm } from './ReasonForm'

type Pending = { id: string; kind: 'status'; value: AccountStatus } | { id: string; kind: 'verification'; value: 'verified' | 'rejected' | 'unverified' }

const ACTION_TITLE = (p: Pending) =>
  p.kind === 'status'
    ? { active: 'Reativar oficina', suspended: 'Suspender oficina', blocked: 'Bloquear oficina' }[p.value]
    : { verified: 'Marcar como verificada', rejected: 'Recusar verificação', unverified: 'Voltar para não verificada' }[p.value]

function Actions({ w, onPick }: { w: AdminWorkshopRow; onPick: (p: Pending) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {w.verification_status !== 'verified' && <Button size="sm" variant="secondary" onClick={() => onPick({ id: w.id, kind: 'verification', value: 'verified' })}>Verificar</Button>}
      {w.verification_status === 'unverified' && <Button size="sm" variant="quiet" onClick={() => onPick({ id: w.id, kind: 'verification', value: 'rejected' })}>Recusar verificação</Button>}
      {w.verification_status !== 'unverified' && <Button size="sm" variant="quiet" onClick={() => onPick({ id: w.id, kind: 'verification', value: 'unverified' })}>Remover verificação</Button>}
      {w.status !== 'active' && <Button size="sm" variant="secondary" onClick={() => onPick({ id: w.id, kind: 'status', value: 'active' })}>Reativar</Button>}
      {w.status === 'active' && <Button size="sm" variant="quiet" onClick={() => onPick({ id: w.id, kind: 'status', value: 'suspended' })}>Suspender</Button>}
      {w.status !== 'blocked' && <Button size="sm" variant="quiet" onClick={() => onPick({ id: w.id, kind: 'status', value: 'blocked' })}>Bloquear</Button>}
    </div>
  )
}

/** Gestão de oficinas (PRD 7.3). Nenhuma ação apaga registros históricos. */
export function AdminWorkshopsPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')
  const [pending, setPending] = useState<Pending | null>(null)
  const list = useQuery({ queryKey: ['admin-workshops', term], queryFn: () => listWorkshops(term) })
  const act = useMutation({
    mutationFn: ({ p, reason }: { p: Pending; reason: string }) =>
      p.kind === 'status' ? setWorkshopStatus(p.id, p.value, reason) : setWorkshopVerification(p.id, p.value, reason),
    onSuccess: () => {
      setPending(null)
      qc.invalidateQueries({ queryKey: ['admin-workshops'] })
    },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    setTerm(search.trim())
  }

  return (
    <div>
      <Link to="/admin" className="text-sm text-muted underline underline-offset-4">Administração</Link>
      <h1 className="heading mt-2 text-3xl text-ink">Oficinas</h1>
      <p className="mt-1 max-w-2xl text-muted">
        Oficina suspensa ou bloqueada não pesquisa placas nem registra serviços; os registros que ela já fez continuam no histórico das motos.
        Toda ação pede motivo e fica na auditoria.
      </p>
      <form onSubmit={submit} className="mt-5 flex max-w-xl items-end gap-3" role="search">
        <TextField label="Buscar por nome, cidade, endereço público ou CNPJ" value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1" />
        <Button type="submit" variant="secondary">Buscar</Button>
      </form>
      {list.isError && <div className="mt-4"><Notice tone="error">Não foi possível carregar as oficinas.</Notice></div>}
      {list.data?.length === 0 && <p className="mt-4 text-muted">Nenhuma oficina encontrada.</p>}
      <ul className="mt-5 divide-y divide-rule border-y border-rule">
        {list.data?.map((w) => (
          <li key={w.id} className="py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-ink">
                  {w.business_name}
                  <span className={`ml-2 rounded-doc px-2 py-0.5 text-xs ${w.status === 'active' ? 'bg-paper text-graphite' : 'bg-danger text-sheet'}`}>
                    {WORKSHOP_STATUS_LABEL[w.status] ?? w.status}
                  </span>
                  <span className="ml-2 rounded-doc bg-paper px-2 py-0.5 text-xs text-graphite">{VERIFICATION_LABEL[w.verification_status] ?? w.verification_status}</span>
                </p>
                <p className="text-sm text-muted">
                  {[w.city, w.state].filter(Boolean).join('/') || 'Sem cidade'} · responsável {w.responsible_name ?? '—'} · {w.members} pessoa(s) ·{' '}
                  {w.active_accesses} moto(s) autorizada(s) · {w.records} registro(s) · desde {new Date(w.created_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
              {pending?.id !== w.id && <Actions w={w} onPick={setPending} />}
            </div>
            {pending?.id === w.id && (
              <ReasonForm
                title={ACTION_TITLE(pending)}
                confirmLabel="Confirmar"
                pending={act.isPending}
                error={act.isError ? translateDbError(act.error as { code?: string; message?: string }) : null}
                onCancel={() => setPending(null)}
                onConfirm={(reason) => act.mutate({ p: pending, reason })}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
