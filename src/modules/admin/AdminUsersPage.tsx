import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { TextField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { translateDbError } from '@/core/shared/dbErrors'
import { formatPlate } from '@/core/shared/format'
import { ACCOUNT_STATUS_LABEL, getUserDetail, listUsers, setUserStatus, type AccountStatus, type AdminUserDetail, type AdminUserRow } from './adminApi'
import { ReasonForm } from './ReasonForm'

const err = (e: unknown) => translateDbError(e as { code?: string; message?: string })
const d = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—')

function UserDetail({ user, detail, onClose }: { user: AdminUserRow; detail: AdminUserDetail; onClose: () => void }) {
  const qc = useQueryClient()
  const [action, setAction] = useState<AccountStatus | null>(null)
  const change = useMutation({
    mutationFn: ({ status, reason }: { status: AccountStatus; reason: string }) => setUserStatus(user.id, status, reason),
    onSuccess: () => {
      setAction(null)
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      onClose()
    },
  })
  return (
    <div className="mt-3 rounded-doc border border-rule bg-sheet p-4 text-sm" aria-label={`Dados de ${detail.full_name ?? 'usuário'}`} role="region">
      <dl className="grid gap-3 sm:grid-cols-3">
        <div><dt className="text-muted">E-mail</dt><dd className="break-all font-semibold">{detail.email ?? '—'}</dd></div>
        <div><dt className="text-muted">Telefone</dt><dd className="font-semibold">{detail.phone ?? '—'}</dd></div>
        <div><dt className="text-muted">Último acesso</dt><dd className="font-semibold">{d(detail.last_sign_in_at)}</dd></div>
        <div><dt className="text-muted">Plano</dt><dd className="font-semibold">{detail.plan ?? '—'}</dd></div>
        <div><dt className="text-muted">Assinatura</dt><dd className="font-semibold">{detail.subscription ? `${detail.subscription.plan_name} · ${detail.subscription.status}` : 'Nenhuma'}</dd></div>
        <div><dt className="text-muted">Papéis</dt><dd className="font-semibold">{detail.roles.join(', ') || '—'}</dd></div>
      </dl>
      {detail.status_reason && <p className="mt-3 text-graphite">Motivo da situação atual: {detail.status_reason}</p>}
      <p className="mt-3 font-semibold text-ink">Motos ({detail.motorcycles.length})</p>
      <ul className="mt-1 text-graphite">
        {detail.motorcycles.map((m) => <li key={m.id}>{m.name} {m.year} · {formatPlate(m.plate)}</li>)}
        {detail.motorcycles.length === 0 && <li className="text-muted">Nenhuma</li>}
      </ul>
      {detail.workshops.length > 0 && (
        <p className="mt-2 text-graphite">Oficinas: {detail.workshops.map((w) => `${w.name} (${w.role})`).join('; ')}</p>
      )}
      <p className="mt-3 text-xs text-muted">Esta consulta ficou registrada na auditoria com o motivo informado.</p>
      {!user.is_admin && !action && (
        <div className="mt-3 flex flex-wrap gap-2">
          {detail.account_status !== 'active' && <Button size="sm" variant="secondary" onClick={() => setAction('active')}>Reativar conta</Button>}
          {detail.account_status !== 'suspended' && <Button size="sm" variant="secondary" onClick={() => setAction('suspended')}>Suspender</Button>}
          {detail.account_status !== 'blocked' && <Button size="sm" variant="secondary" onClick={() => setAction('blocked')}>Bloquear</Button>}
          <Button size="sm" variant="quiet" onClick={onClose}>Fechar</Button>
        </div>
      )}
      {action && (
        <ReasonForm
          title={action === 'active' ? 'Reativar conta' : action === 'suspended' ? 'Suspender conta' : 'Bloquear conta'}
          confirmLabel="Confirmar"
          pending={change.isPending}
          error={change.isError ? err(change.error) : null}
          onCancel={() => setAction(null)}
          onConfirm={(reason) => change.mutate({ status: action, reason })}
        />
      )}
      {action && action !== 'active' && (
        <p className="mt-2 text-xs text-muted">A pessoa não consegue entrar de novo. Uma sessão já aberta termina quando o acesso dela expirar (até 1 hora). Motos e histórico não mudam.</p>
      )}
    </div>
  )
}

/** Gestão de usuários (PRD 7.2). Dados privados só com motivo registrado (PRD 7.7). */
export function AdminUsersPage() {
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')
  const [opening, setOpening] = useState<string | null>(null)
  const [opened, setOpened] = useState<{ id: string; detail: AdminUserDetail } | null>(null)
  const users = useQuery({ queryKey: ['admin-users', term], queryFn: () => listUsers(term) })

  const open = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => getUserDetail(id, reason),
    onSuccess: (detail, v) => {
      setOpened({ id: v.id, detail })
      setOpening(null)
    },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    setTerm(search.trim())
  }

  return (
    <div>
      <Link to="/admin" className="text-sm text-muted underline underline-offset-4">Administração</Link>
      <h1 className="heading mt-2 text-3xl text-ink">Usuários</h1>
      <p className="mt-1 max-w-2xl text-muted">
        E-mails aparecem mascarados. Para ver dados de uma conta ou mudar a situação dela, informe o motivo: tudo fica na auditoria.
      </p>
      <form onSubmit={submit} className="mt-5 flex max-w-xl items-end gap-3" role="search">
        <TextField label="Buscar por nome ou e-mail" value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1" />
        <Button type="submit" variant="secondary">Buscar</Button>
      </form>
      {users.isError && <div className="mt-4"><Notice tone="error">Não foi possível carregar os usuários.</Notice></div>}
      {users.data?.length === 0 && <p className="mt-4 text-muted">Nenhum usuário encontrado.</p>}
      <ul className="mt-5 divide-y divide-rule border-y border-rule">
        {users.data?.map((u) => (
          <li key={u.id} className="py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <p className="font-semibold text-ink">
                  {u.full_name ?? 'Sem nome'}
                  {u.is_admin && <span className="ml-2 rounded-doc bg-ink px-2 py-0.5 text-xs text-sheet">Admin</span>}
                  {u.account_status !== 'active' && (
                    <span className="ml-2 rounded-doc bg-danger px-2 py-0.5 text-xs text-sheet">{ACCOUNT_STATUS_LABEL[u.account_status]}</span>
                  )}
                </p>
                <p className="text-sm text-muted">
                  {u.email_masked} · desde {new Date(u.created_at).toLocaleDateString('pt-BR')} · {u.motorcycles} moto(s) · {u.plan_name ?? '—'}
                  {u.workshops > 0 ? ` · ${u.workshops} oficina(s)` : ''}
                </p>
              </div>
              {opened?.id !== u.id && opening !== u.id && (
                <Button size="sm" variant="secondary" onClick={() => { setOpened(null); setOpening(u.id) }}>Ver dados</Button>
              )}
            </div>
            {opening === u.id && (
              <ReasonForm
                title="Por que você precisa ver os dados desta conta?"
                confirmLabel="Ver dados"
                pending={open.isPending}
                error={open.isError ? err(open.error) : null}
                onCancel={() => setOpening(null)}
                onConfirm={(reason) => open.mutate({ id: u.id, reason })}
              />
            )}
            {opened?.id === u.id && <UserDetail user={u} detail={opened.detail} onClose={() => setOpened(null)} />}
          </li>
        ))}
      </ul>
    </div>
  )
}
