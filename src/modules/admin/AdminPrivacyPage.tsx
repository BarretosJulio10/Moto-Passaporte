import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { SelectField, TextAreaField, TextField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { formatDate } from '@/core/shared/format'
import { translateDbError } from '@/core/shared/dbErrors'
import { PRIVACY_KIND_LABEL, PRIVACY_STATUS_LABEL, adminAnonymizeAccount, adminListPrivacyRequests, adminResolvePrivacyRequest, type AdminPrivacyRequest } from '@/modules/account/api'
import { ReasonForm } from './ReasonForm'

const FILTERS = ['open', 'done', 'rejected', 'all'] as const
const FILTER_LABEL: Record<string, string> = { open: 'Em aberto', done: 'Atendidos', rejected: 'Respondidos sem atender', all: 'Todos' }
const DECISIONS = ['in_progress', 'done', 'rejected'] as const
const DECISION_LABEL: Record<string, string> = { in_progress: 'Em análise (avisa o titular)', done: 'Atendido', rejected: 'Responder sem atender' }

function ResolveForm({ r, onDone }: { r: AdminPrivacyRequest; onDone: () => void }) {
  const [status, setStatus] = useState<string>('done')
  const [reply, setReply] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: () => adminResolvePrivacyRequest(r.id, status, reply.trim(), reason.trim()),
    onSuccess: onDone,
    onError: (e) => setError(translateDbError(e as { code?: string; message?: string })),
  })
  function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (reply.trim().length < 10) return setError('Escreva a resposta ao titular (pelo menos 10 caracteres).')
    if (reason.trim().length < 10) return setError('Informe o motivo para a auditoria (pelo menos 10 caracteres).')
    save.mutate()
  }
  return (
    <form onSubmit={submit} noValidate className="mt-3 grid max-w-lg gap-3" aria-label="Responder pedido">
      <SelectField label="Situação" value={status} onChange={(e) => setStatus(e.target.value)} options={DECISIONS} optionLabel={(v) => DECISION_LABEL[v] ?? v} />
      <TextAreaField label="Resposta ao titular (ele recebe aviso)" value={reply} onChange={(e) => setReply(e.target.value)} maxLength={1000} rows={3} />
      <TextField label="Motivo (fica na auditoria)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      {error && <Notice tone="error">{error}</Notice>}
      <div><Button type="submit" size="sm" loading={save.isPending}>Registrar resposta</Button></div>
    </form>
  )
}

function AnonymizeAction({ r, onDone }: { r: AdminPrivacyRequest; onDone: () => void }) {
  const [asking, setAsking] = useState(false)
  const run = useMutation({
    mutationFn: (reason: string) => adminAnonymizeAccount(r.id, reason),
    onSuccess: onDone,
  })
  if (!asking) {
    return <Button className="mt-3 ml-3" size="sm" variant="secondary" onClick={() => setAsking(true)}>Anonimizar conta</Button>
  }
  return (
    <ReasonForm
      title="Apagar os dados pessoais desta conta? Não dá para desfazer. O histórico das motos e os registros de cobrança ficam, sem identificação."
      confirmLabel="Anonimizar conta"
      onConfirm={(reason) => run.mutate(reason)}
      onCancel={() => { setAsking(false); run.reset() }}
      pending={run.isPending}
      error={run.error ? translateDbError(run.error as { code?: string; message?: string }) : null}
    />
  )
}

/** /admin/privacidade — pedidos dos titulares (LGPD art. 18, ADR-036). Procedimento em docs/LGPD.md. */
export function AdminPrivacyPage() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState<string>('open')
  const [open, setOpen] = useState<string | null>(null)
  const list = useQuery({ queryKey: ['admin-privacy', filter], queryFn: () => adminListPrivacyRequests(filter) })
  return (
    <div>
      <Link to="/admin" className="text-sm text-muted underline underline-offset-4">Administração</Link>
      <h1 className="heading mt-2 text-3xl text-ink">Pedidos de privacidade</h1>
      <p className="mt-1 max-w-2xl text-muted">
        Exclusão, correção e dúvidas dos titulares (LGPD). Prazo de resposta: 15 dias. Na exclusão, o histórico da moto fica com a moto; os dados
        pessoais são apagados ou anonimizados seguindo o procedimento documentado.
      </p>
      <div className="mt-6 max-w-xs">
        <SelectField label="Mostrar" value={filter} onChange={(e) => setFilter(e.target.value)} options={FILTERS} optionLabel={(v) => FILTER_LABEL[v] ?? v} />
      </div>
      {list.isError && <div className="mt-4"><Notice tone="error">Não foi possível carregar os pedidos.</Notice></div>}
      {list.data?.length === 0 && <p className="mt-6 text-muted">Nenhum pedido.</p>}
      {!!list.data?.length && (
        <ul className="mt-6 divide-y divide-rule border-y border-rule">
          {list.data.map((r) => (
            <li key={r.id} className="py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold text-ink">{PRIVACY_KIND_LABEL[r.kind] ?? r.kind}</span>
                <span className="text-sm text-muted">{PRIVACY_STATUS_LABEL[r.status] ?? r.status} · recebido em {formatDate(r.created_at)}</span>
              </div>
              <p className="mt-1 text-sm text-graphite">
                {r.full_name ?? 'Sem nome'} · {r.email_masked} · {r.motorcycles} moto(s) no nome
              </p>
              {r.details && <p className="mt-2 text-sm text-graphite">{r.details}</p>}
              {r.reply && <p className="mt-2 text-sm text-muted">Resposta: {r.reply}</p>}
              {(r.status === 'pending' || r.status === 'in_progress') && (
                open === r.id ? (
                  <ResolveForm r={r} onDone={() => { setOpen(null); qc.invalidateQueries({ queryKey: ['admin-privacy'] }) }} />
                ) : (
                  <>
                    <Button className="mt-3" size="sm" variant="secondary" onClick={() => setOpen(r.id)}>Responder</Button>
                    {r.kind === 'deletion' && <AnonymizeAction r={r} onDone={() => qc.invalidateQueries({ queryKey: ['admin-privacy'] })} />}
                  </>
                )
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
