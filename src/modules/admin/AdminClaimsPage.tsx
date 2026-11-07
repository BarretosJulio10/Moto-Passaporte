import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { CheckboxField, TextAreaField, TextField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { translateDbError } from '@/core/shared/dbErrors'
import { formatPlate } from '@/core/shared/format'
import { adminListClaims, adminResolveClaim, CLAIM_STATUS_LABEL, type AdminClaim } from '@/modules/claims/api'
import { validReason } from './adminApi'

const d = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—')

function ResolveForm({ c, onDone }: { c: AdminClaim; onDone: () => void }) {
  const qc = useQueryClient()
  const [status, setStatus] = useState<'approved' | 'rejected'>('approved')
  const [reply, setReply] = useState('')
  const [notify, setNotify] = useState(true)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: adminResolveClaim,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-claims'] })
      qc.invalidateQueries({ queryKey: ['admin-metrics'] })
      onDone()
    },
    onError: (e) => setError(translateDbError(e as { code?: string; message?: string })),
  })
  function submit(e: FormEvent) {
    e.preventDefault()
    if (reply.trim().length < 10) return setError('Escreva a resposta ao solicitante (pelo menos 10 caracteres).')
    const r = validReason(reason)
    if (r) return setError(r)
    setError(null)
    save.mutate({ id: c.id, status, reply: reply.trim(), notifyOwner: status === 'approved' && notify, reason: reason.trim() })
  }
  return (
    <form onSubmit={submit} noValidate className="mt-3 grid gap-3 rounded-doc border border-rule bg-sheet p-4" aria-label="Decidir pedido">
      <fieldset>
        <legend className="text-sm font-semibold text-graphite">Decisão</legend>
        <div className="mt-2 flex flex-wrap gap-5 text-graphite">
          {(['approved', 'rejected'] as const).map((v) => (
            <label key={v} className="flex items-center gap-2">
              <input type="radio" name={`decision-${c.id}`} checked={status === v} onChange={() => setStatus(v)} className="h-4 w-4 accent-ink" />
              {CLAIM_STATUS_LABEL[v]}
            </label>
          ))}
        </div>
      </fieldset>
      <TextAreaField label="Resposta ao solicitante (ele lê no painel)" value={reply} onChange={(e) => setReply(e.target.value)} rows={2} maxLength={1000}
        hint="Não revele dados do titular atual." />
      {status === 'approved' && (
        <CheckboxField label="Avisar o titular atual, sem identificar o solicitante, para transferir o passaporte" checked={notify}
          onChange={(e) => setNotify(e.target.checked)} />
      )}
      <TextField label="Motivo interno (fica na auditoria)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex gap-3">
        <Button type="submit" size="sm" loading={save.isPending}>Registrar decisão</Button>
        <Button type="button" size="sm" variant="secondary" onClick={onDone}>Cancelar</Button>
      </div>
    </form>
  )
}

/** Pedidos de verificação de placa (ADR-007, ADR-025). Sem transferência forçada (decisão P-7 pendente). */
export function AdminClaimsPage() {
  const [tab, setTab] = useState<'pending' | 'all'>('pending')
  const [open, setOpen] = useState<string | null>(null)
  const list = useQuery({ queryKey: ['admin-claims', tab], queryFn: () => adminListClaims(tab === 'pending' ? 'pending' : null) })
  return (
    <div>
      <Link to="/admin" className="text-sm text-muted underline underline-offset-4">Administração</Link>
      <h1 className="heading mt-2 text-3xl text-ink">Verificação de placas</h1>
      <p className="mt-1 max-w-2xl text-muted">
        Pedidos de quem tentou cadastrar uma placa que já tem passaporte. O solicitante não vê os dados da moto nem do titular. Procedente: você pode
        avisar o titular, sem identificar o solicitante, para fazer a transferência. Transferência sem o titular ainda não existe (decisão P-7).
      </p>
      <div className="mt-5 flex gap-2" role="tablist">
        {(['pending', 'all'] as const).map((t) => (
          <Button key={t} size="sm" variant={tab === t ? 'primary' : 'secondary'} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {t === 'pending' ? 'Em análise' : 'Todos'}
          </Button>
        ))}
      </div>
      {list.isError && <div className="mt-4"><Notice tone="error">Não foi possível carregar os pedidos.</Notice></div>}
      {list.data?.length === 0 && <p className="mt-4 text-muted">{tab === 'pending' ? 'Nenhum pedido em análise.' : 'Nenhum pedido.'}</p>}
      <ul className="mt-4 divide-y divide-rule border-y border-rule">
        {list.data?.map((c) => (
          <li key={c.id} className="py-4 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="grid gap-1">
                <p className="font-semibold text-ink">
                  Placa {formatPlate(c.plate)} · {CLAIM_STATUS_LABEL[c.status] ?? c.status} · pedido em {d(c.created_at)}
                </p>
                <p className="text-graphite">
                  <span className="font-semibold">Solicitante:</span> {c.requester_name ?? '—'} ({c.requester_email_masked}) · conta com {c.requester_account_age_days ?? '?'} dia(s)
                </p>
                {c.requester_note && <p className="text-graphite">“{c.requester_note}”</p>}
                <p className="text-graphite">
                  <span className="font-semibold">Passaporte existente:</span> {c.motorcycle_name ?? '—'} · criado em {d(c.passport_created_at)} · placa desde {d(c.plate_since)}
                </p>
                <p className="text-graphite">
                  <span className="font-semibold">Titular atual:</span> {c.current_owner_name ?? '—'} desde {d(c.owner_since)}
                  {c.pending_transfer ? ' · já existe transferência em aberto' : ''}
                  {c.same_moto_claims > 1 ? ` · ${c.same_moto_claims} pedidos para esta moto` : ''}
                </p>
                {c.resolution_note && (
                  <p className="text-muted">Resposta: {c.resolution_note} ({c.resolved_by_name ?? '—'}, {d(c.resolved_at)}){c.owner_notified_at ? ' · titular avisado' : ''}</p>
                )}
              </div>
              {c.status === 'pending' && open !== c.id && <Button size="sm" variant="secondary" onClick={() => setOpen(c.id)}>Decidir</Button>}
            </div>
            {open === c.id && <ResolveForm c={c} onDone={() => setOpen(null)} />}
          </li>
        ))}
      </ul>
    </div>
  )
}
