import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { useAuth } from '@/core/auth/AuthProvider'
import { translateDbError } from '@/core/shared/dbErrors'
import { formatDate } from '@/core/shared/format'
import { acceptInvite, fetchInvitePreview, PERMISSION_LABEL, type Permissions } from './teamApi'

const CLOSED: Record<string, string> = {
  invalid: 'Este link de convite não é válido. Confira se copiou o link inteiro.',
  accepted: 'Este convite já foi usado.',
  revoked: 'Este convite foi cancelado pela oficina. Peça um novo ao responsável.',
  expired: 'Este convite expirou. Peça um novo ao responsável.',
  inactive: 'Esta oficina não está ativa na plataforma.',
}

/** /convite/:token — aceite de convite para a equipe da oficina. Exige login (rota autenticada). */
export function InvitePage() {
  const { token = '' } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const preview = useQuery({ queryKey: ['invite', token], queryFn: () => fetchInvitePreview(token), retry: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onAccept() {
    setBusy(true)
    setError('')
    try {
      const orgId = await acceptInvite(token)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['my-workshops'] }),
        queryClient.invalidateQueries({ queryKey: ['my-roles'] }),
      ])
      navigate(`/oficina/${orgId}`, { replace: true })
    } catch (e) {
      setError(translateDbError(e as { code?: string; message?: string }))
      setBusy(false)
    }
  }

  if (preview.isLoading) return <p className="text-muted" role="status">Carregando convite…</p>
  if (preview.isError || !preview.data) return <Notice tone="error">Não foi possível abrir o convite agora. Tente de novo.</Notice>
  const p = preview.data

  if (p.status !== 'open') {
    return (
      <div className="max-w-xl">
        <h1 className="heading text-3xl text-ink">Convite indisponível</h1>
        <p className="mt-3 text-graphite">{CLOSED[p.status]}</p>
        <Link to="/painel" className="mt-5 inline-block font-semibold text-ink underline underline-offset-4">Ir para o painel</Link>
      </div>
    )
  }

  const perms = (Object.keys(PERMISSION_LABEL) as Array<keyof Permissions>).filter((k) => p[k])
  return (
    <div className="max-w-xl">
      <h1 className="heading text-3xl text-ink">Convite para a equipe</h1>
      <p className="mt-3 text-graphite">
        A <strong className="text-ink">{p.workshop_name}</strong> convidou você para fazer parte da equipe no Moto Passaporte.
      </p>
      <div className="mt-5 rounded-doc border border-rule bg-sheet p-4">
        <p className="text-sm font-semibold text-graphite">Você poderá</p>
        <ul className="mt-2 list-disc pl-5 text-graphite">
          <li>Ver as motos autorizadas para a oficina</li>
          {perms.map((k) => <li key={k}>{PERMISSION_LABEL[k]}</li>)}
        </ul>
        {p.expires_at && <p className="mt-3 text-xs text-muted">Convite válido até {formatDate(p.expires_at, 'short')}.</p>}
      </div>

      {!p.email_matches ? (
        <div className="mt-5">
          <Notice tone="error" title="Este convite é para outro e-mail">
            Você entrou como {user?.email}. O convite foi enviado para {p.email_hint}. Saia e entre com a conta desse e-mail.
          </Notice>
        </div>
      ) : (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button type="button" loading={busy} onClick={onAccept}>{busy ? 'Entrando na equipe…' : 'Aceitar convite'}</Button>
          <Link to="/painel" className="px-2 py-2 font-semibold text-ink underline-offset-4 hover:underline">Agora não</Link>
        </div>
      )}
      {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
    </div>
  )
}
