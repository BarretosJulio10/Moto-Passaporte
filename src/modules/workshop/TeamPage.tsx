import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { CheckboxField, SelectField, TextField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { translateDbError } from '@/core/shared/dbErrors'
import { formatDate } from '@/core/shared/format'
import { useMyWorkshops } from './WorkshopIndexPage'
import { QuotePermissions } from './team/QuotePermissions'
import { ConvertToPista, PistaMechanics, usePistaAccounts } from './team/PistaMechanics'
import {
  createInvite,
  fetchInvites,
  fetchMembers,
  inviteLink,
  leaveOrganization,
  PERMISSION_LABEL,
  removeMember,
  revokeInvite,
  ROLE_LABEL,
  updateMember,
  whatsappShareLink,
  type Member,
  type MemberRole,
  type Permissions,
} from './teamApi'

const ALL: Permissions = { can_request_access: true, can_register_services: true }
const errText = (e: unknown) => translateDbError(e as { code?: string; message?: string })

/** /oficina/:orgId/equipe — responsável gerencia a equipe; funcionário vê a equipe e pode sair (PRD 6.2). */
export function TeamPage() {
  const { orgId = '' } = useParams()
  const workshops = useMyWorkshops()
  if (workshops.isLoading) return <p className="text-muted" role="status">Carregando…</p>
  const shop = workshops.data?.find((w) => w.organization_id === orgId)
  if (!shop) {
    return (
      <div>
        <h1 className="heading text-3xl text-ink">Oficina não encontrada</h1>
        <Link to="/oficina" className="mt-5 inline-block font-semibold text-ink underline underline-offset-4">Voltar</Link>
      </div>
    )
  }
  const responsible = shop.role === 'responsible'
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="heading text-3xl text-ink">Equipe da {shop.business_name}</h1>
        <p className="mt-1 max-w-prose text-muted">
          Cada pessoa entra com o próprio login, e o histórico mostra quem fez cada ação.
          {responsible ? ' Você define o que cada funcionário pode fazer.' : ''}
        </p>
      </div>
      {responsible && <PistaMechanics organizationId={orgId} />}
      <MemberList organizationId={orgId} responsible={responsible} />
      {responsible && <InviteForm organizationId={orgId} workshopName={shop.business_name} />}
      {responsible && <QuotePermissions organizationId={orgId} />}
      {responsible && <PendingInvites organizationId={orgId} />}
      {!responsible && <LeaveOrganization organizationId={orgId} />}
    </div>
  )
}

function Permissionboxes({ value, onChange, disabled }: { value: Permissions; onChange: (p: Permissions) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      {(Object.keys(PERMISSION_LABEL) as Array<keyof Permissions>).map((k) => (
        <CheckboxField
          key={k}
          label={PERMISSION_LABEL[k]}
          checked={value[k]}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, [k]: e.target.checked })}
        />
      ))}
    </div>
  )
}

function InviteForm({ organizationId, workshopName }: { organizationId: string; workshopName: string }) {
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [perms, setPerms] = useState<Permissions>(ALL)
  const [error, setError] = useState('')
  const [fieldError, setFieldError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<{ email: string; link: string; expires_at: string } | null>(null)
  const [copied, setCopied] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const value = email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      setFieldError('Informe um e-mail válido.')
      return
    }
    setFieldError(undefined)
    setError('')
    setBusy(true)
    try {
      const r = await createInvite(organizationId, value, perms)
      setCreated({ email: value, link: inviteLink(r.token), expires_at: r.expires_at })
      setCopied(false)
      setEmail('')
      setPerms(ALL)
      await queryClient.invalidateQueries({ queryKey: ['org-invites', organizationId] })
    } catch (e) {
      setError(errText(e))
    }
    setBusy(false)
  }

  async function copy() {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created.link)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section aria-labelledby="invite-title" className="rounded-doc border border-rule bg-sheet p-5">
      <h2 id="invite-title" className="heading text-xl text-ink">Convidar por e-mail</h2>
      <p className="mt-1 max-w-prose text-sm text-muted">
        Para quem já tem conta no Moto Passaporte e vai usar o painel (atendimento, orçamentos). Mecânico da pista não precisa de convite: crie em “Mecânicos da pista”.
        Você recebe um link de convite para enviar à pessoa. Ele vale por 7 dias, funciona uma vez e só com a conta do e-mail informado.
      </p>
      <form noValidate onSubmit={onSubmit} className="mt-4 flex max-w-xl flex-col gap-4">
        <TextField label="E-mail do funcionário" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} error={fieldError} />
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-graphite">O que a pessoa poderá fazer</legend>
          <Permissionboxes value={perms} onChange={setPerms} disabled={busy} />
        </fieldset>
        <div>
          <Button type="submit" loading={busy}>{busy ? 'Criando…' : 'Criar convite'}</Button>
        </div>
      </form>
      {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
      {created && (
        <div className="mt-5 rounded-doc border border-ink/30 bg-paper p-4" aria-live="polite">
          <p className="font-semibold text-ink">Convite criado para {created.email}</p>
          <p className="mt-1 text-sm text-muted">
            Envie este link agora: por segurança, ele não aparece de novo. Vale até {formatDate(created.expires_at, 'short')}.
          </p>
          <p className="mt-3 break-all rounded-doc border border-rule bg-sheet px-3 py-2 font-mono text-sm text-graphite">{created.link}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={copy}>{copied ? 'Link copiado' : 'Copiar link'}</Button>
            <a
              href={whatsappShareLink(workshopName, created.link)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-doc border border-rule bg-sheet px-3 py-2 text-sm font-semibold text-ink hover:border-ink"
            >
              Enviar pelo WhatsApp
            </a>
          </div>
        </div>
      )}
    </section>
  )
}

function MemberList({ organizationId, responsible }: { organizationId: string; responsible: boolean }) {
  const members = useQuery({ queryKey: ['org-members', organizationId], queryFn: () => fetchMembers(organizationId) })
  const pista = usePistaAccounts(organizationId, responsible)
  const pistaIds = new Set((pista.data?.accounts ?? []).map((a) => a.user_id))
  const list = (members.data ?? []).filter((m) => !pistaIds.has(m.user_id))
  if (members.isLoading) return <p className="text-muted" role="status">Carregando equipe…</p>
  if (members.isError) return <Notice tone="error">Não foi possível carregar a equipe.</Notice>
  return (
    <section aria-labelledby="members-title">
      <h2 id="members-title" className="heading text-xl text-ink">Equipe com e-mail ({list.length})</h2>
      <ul className="mt-3 divide-y divide-rule border-y border-rule">
        {list.map((m) => (
          <MemberRow key={m.id} member={m} organizationId={organizationId} editable={responsible && !m.is_me} />
        ))}
      </ul>
    </section>
  )
}

function MemberRow({ member: m, organizationId, editable }: { member: Member; organizationId: string; editable: boolean }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [role, setRole] = useState<MemberRole>(m.role)
  const [perms, setPerms] = useState<Permissions>({ can_request_access: m.can_request_access, can_register_services: m.can_register_services })
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [converting, setConverting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await action()
      setEditing(false)
      setConfirmRemove(false)
      await queryClient.invalidateQueries({ queryKey: ['org-members', organizationId] })
    } catch (e) {
      setError(errText(e))
    }
    setBusy(false)
  }

  const summary =
    m.role === 'responsible'
      ? 'Todas as permissões e gestão da equipe'
      : (Object.keys(PERMISSION_LABEL) as Array<keyof Permissions>).filter((k) => m[k]).map((k) => PERMISSION_LABEL[k]).join(', ') || 'Só consulta as motos da oficina'

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-ink">
            {m.full_name || 'Sem nome'}
            {m.is_me && <span className="font-normal text-muted"> (você)</span>}
          </p>
          {m.email && <p className="truncate text-sm text-muted">{m.email}</p>}
          <p className="mt-1 text-sm text-graphite"><span className="font-semibold">{ROLE_LABEL[m.role]}.</span> {summary}</p>
        </div>
        {editable && !editing && !confirmRemove && !converting && (
          <div className="flex flex-wrap gap-1">
            {m.role === 'staff' && <Button type="button" size="sm" variant="quiet" onClick={() => setConverting(true)}>Virar conta da pista</Button>}
            <Button type="button" size="sm" variant="quiet" onClick={() => setEditing(true)}>Alterar</Button>
            <Button type="button" size="sm" variant="quiet" onClick={() => setConfirmRemove(true)}>Remover</Button>
          </div>
        )}
      </div>

      {editing && (
        <div className="mt-3 flex max-w-md flex-col gap-3 rounded-doc border border-rule bg-paper p-3">
          <SelectField label="Papel" value={role} onChange={(e) => setRole(e.target.value as MemberRole)} options={['staff', 'responsible']} optionLabel={(v) => ROLE_LABEL[v as MemberRole]} />
          {role === 'staff' ? (
            <Permissionboxes value={perms} onChange={setPerms} disabled={busy} />
          ) : (
            <p className="text-sm text-muted">Responsável tem todas as permissões e gerencia a equipe e o perfil.</p>
          )}
          <div className="flex gap-2">
            <Button type="button" size="sm" loading={busy} onClick={() => run(() => updateMember(m.id, role, role === 'responsible' ? ALL : perms))}>Salvar</Button>
            <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => setEditing(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      {converting && (
        <ConvertToPista organizationId={organizationId} memberId={m.id} fullName={m.full_name ?? ''}
          onDone={() => setConverting(false)} onCancel={() => setConverting(false)} />
      )}

      {confirmRemove && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-graphite">Remover {m.full_name || 'esta pessoa'} da equipe? Os registros feitos por ela continuam no histórico.</span>
          <Button type="button" size="sm" loading={busy} onClick={() => run(() => removeMember(m.id))}>Remover</Button>
          <Button type="button" size="sm" variant="quiet" disabled={busy} onClick={() => setConfirmRemove(false)}>Manter</Button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
    </li>
  )
}

function PendingInvites({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient()
  const invites = useQuery({ queryKey: ['org-invites', organizationId], queryFn: () => fetchInvites(organizationId) })
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  if (!invites.data || invites.data.length === 0) return null

  async function onRevoke(id: string) {
    setBusy(id)
    setError('')
    try {
      await revokeInvite(id)
      await queryClient.invalidateQueries({ queryKey: ['org-invites', organizationId] })
    } catch (e) {
      setError(errText(e))
    }
    setBusy(null)
  }

  return (
    <section aria-labelledby="invites-title">
      <h2 id="invites-title" className="heading text-xl text-ink">Convites em aberto ({invites.data.length})</h2>
      {error && <div className="mt-2"><Notice tone="error">{error}</Notice></div>}
      <ul className="mt-3 divide-y divide-rule border-y border-rule">
        {invites.data.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink">{i.email}</p>
              <p className="text-sm text-muted">Vale até {formatDate(i.expires_at, 'short')}</p>
            </div>
            <Button type="button" size="sm" variant="quiet" loading={busy === i.id} onClick={() => onRevoke(i.id)}>Cancelar convite</Button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function LeaveOrganization({ organizationId }: { organizationId: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onLeave() {
    setBusy(true)
    setError('')
    try {
      await leaveOrganization(organizationId)
      await queryClient.invalidateQueries({ queryKey: ['my-workshops'] })
      navigate('/oficina', { replace: true })
    } catch (e) {
      setError(errText(e))
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="leave-title" className="border-t border-rule pt-6">
      <h2 id="leave-title" className="font-semibold text-ink">Sair da oficina</h2>
      <p className="mt-1 text-sm text-muted">Você perde o acesso às motos da oficina. Os registros que fez continuam no histórico.</p>
      {error && <div className="mt-2"><Notice tone="error">{error}</Notice></div>}
      <div className="mt-3 flex flex-wrap gap-2">
        {confirming ? (
          <>
            <Button type="button" size="sm" loading={busy} onClick={onLeave}>Sair da oficina</Button>
            <Button type="button" size="sm" variant="quiet" disabled={busy} onClick={() => setConfirming(false)}>Ficar</Button>
          </>
        ) : (
          <Button type="button" size="sm" variant="secondary" onClick={() => setConfirming(true)}>Sair da oficina</Button>
        )}
      </div>
    </section>
  )
}
