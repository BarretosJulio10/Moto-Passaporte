import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { TextAreaField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { useAuth } from '@/core/auth/AuthProvider'
import { translateDbError } from '@/core/shared/dbErrors'
import { formatPlate } from '@/core/shared/format'
import { cancelMyClaim, CLAIM_STATUS_LABEL, dismissOwnershipNotice, fetchMyClaims, fetchOwnershipNotices, updateMyClaimNote, type MyClaim } from './api'

const err = (e: unknown) => translateDbError(e as { code?: string; message?: string })

function ClaimItem({ c }: { c: MyClaim }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState(c.requester_note ?? '')
  const done = { onSuccess: () => { setEditing(false); qc.invalidateQueries({ queryKey: ['my-claims'] }) } }
  const save = useMutation({ mutationFn: () => updateMyClaimNote(c.id, note), ...done })
  const cancel = useMutation({ mutationFn: () => cancelMyClaim(c.id), ...done })
  const error = save.error ?? cancel.error
  return (
    <li className="py-3 text-sm">
      <p className="font-semibold text-ink">
        Placa {formatPlate(c.plate)} · <span className={c.status === 'rejected' ? 'text-danger' : 'text-graphite'}>{CLAIM_STATUS_LABEL[c.status] ?? c.status}</span>
      </p>
      <p className="text-muted">Pedido em {new Date(c.created_at).toLocaleDateString('pt-BR')}</p>
      {c.resolution_note && <p className="mt-1 text-graphite">Resposta da equipe: {c.resolution_note}</p>}
      {c.status === 'pending' && !editing && (
        <>
          {c.requester_note && <p className="mt-1 text-graphite">Sua informação: {c.requester_note}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>{c.requester_note ? 'Editar informação' : 'Explicar o caso'}</Button>
            <Button size="sm" variant="quiet" loading={cancel.isPending}
              onClick={() => window.confirm('Cancelar este pedido de verificação?') && cancel.mutate()}>Cancelar pedido</Button>
          </div>
        </>
      )}
      {editing && (
        <form className="mt-2 grid gap-2" onSubmit={(e) => { e.preventDefault(); save.mutate() }} aria-label="Explicar o caso">
          <TextAreaField label="Conte como você tem a moto (compra, data, documentos que possui)" value={note} onChange={(e) => setNote(e.target.value)}
            rows={3} maxLength={1000} hint="Não envie números de documentos pessoais aqui." />
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={save.isPending}>Salvar</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(false)}>Voltar</Button>
          </div>
        </form>
      )}
      {error && <div className="mt-2"><Notice tone="error">{err(error)}</Notice></div>}
    </li>
  )
}

/** Painel: pedidos de verificação de placa feitos pelo usuário. */
export function MyClaims() {
  const { user } = useAuth()
  const claims = useQuery({ queryKey: ['my-claims', user?.id], enabled: Boolean(user), queryFn: fetchMyClaims })
  const items = (claims.data ?? []).filter((c) => c.status === 'pending' || (c.resolved_at && Date.now() - Date.parse(c.resolved_at) < 60 * 86400000))
  if (items.length === 0) return null
  return (
    <section aria-labelledby="claims-title" className="mt-6 rounded-doc border border-rule bg-sheet p-4">
      <h2 id="claims-title" className="font-semibold text-ink">Pedidos de verificação de placa</h2>
      <p className="text-sm text-muted">Quando a placa já tem passaporte, nossa equipe analisa o caso. Os dados do passaporte existente não são mostrados.</p>
      <ul className="mt-1 divide-y divide-rule">{items.map((c) => <ClaimItem key={c.id} c={c} />)}</ul>
    </section>
  )
}

/** Painel do titular: aviso anônimo de que alguém informou ter comprado a moto. */
export function OwnershipNotices() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const notices = useQuery({ queryKey: ['ownership-notices', user?.id], enabled: Boolean(user), queryFn: fetchOwnershipNotices })
  const dismiss = useMutation({
    mutationFn: dismissOwnershipNotice,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ownership-notices'] }),
  })
  if (!notices.data?.length) return null
  return (
    <div className="mt-6 space-y-3">
      {notices.data.map((n) => (
        <Notice key={n.claim_id} tone="info" title={`Sobre a ${n.motorcycle_name}`}>
          <p>
            Uma pessoa informou à nossa equipe que comprou esta moto. Se você vendeu, transfira o passaporte pela página da moto para que o histórico
            continue com ela. Se não vendeu, fale com o suporte.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <Link to={`/painel/motos/${n.motorcycle_id}`} className="font-semibold text-ink underline underline-offset-4">Abrir a moto</Link>
            <button type="button" className="font-semibold text-ink underline underline-offset-4" onClick={() => dismiss.mutate(n.claim_id)}>
              Entendi, dispensar aviso
            </button>
          </div>
        </Notice>
      ))}
    </div>
  )
}
