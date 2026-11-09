import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Button } from '@/components/Button'
import { TextField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { formatDate } from '@/core/shared/format'
import {
  fetchPistaAccounts,
  managePistaAccount,
  normalizeNickname,
  validNickname,
  type PistaAccount,
} from '@/modules/pista/accountsApi'

export const pistaAccountsKey = (org: string) => ['pista-accounts', org]
export const usePistaAccounts = (org: string, enabled = true) =>
  useQuery({ queryKey: pistaAccountsKey(org), queryFn: () => fetchPistaAccounts(org), enabled })

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Não foi possível concluir agora.')

function checkForm(fullName: string, nickname: string, password: string, needName = true): string | null {
  if (needName && !fullName.trim()) return 'Informe o nome do mecânico.'
  if (!validNickname(normalizeNickname(nickname))) return 'Apelido: de 2 a 20 letras ou números, sem espaço.'
  if (password.length < 6) return 'A senha precisa ter pelo menos 6 caracteres.'
  return null
}

/** Equipe → mecânicos da pista (ADR-058): criados pelo responsável, sem convite, só acessam o App da Pista. */
export function PistaMechanics({ organizationId }: { organizationId: string }) {
  const qc = useQueryClient()
  const accounts = usePistaAccounts(organizationId)
  const [fullName, setFullName] = useState('')
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ nickname: string; password: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const code = accounts.data?.code

  async function submit(e: FormEvent) {
    e.preventDefault()
    const problem = checkForm(fullName, nickname, password)
    if (problem) return setError(problem)
    setError('')
    setBusy(true)
    try {
      const nick = normalizeNickname(nickname)
      await managePistaAccount(organizationId, { action: 'create', full_name: fullName.trim(), nickname: nick, password })
      setDone({ nickname: nick, password })
      setFullName('')
      setNickname('')
      setPassword('')
      await qc.invalidateQueries({ queryKey: pistaAccountsKey(organizationId) })
      await qc.invalidateQueries({ queryKey: ['org-members', organizationId] })
    } catch (err) {
      setError(msg(err))
    }
    setBusy(false)
  }

  const list = accounts.data?.accounts ?? []
  return (
    <section aria-labelledby="pista-team-title" className="rounded-doc border border-rule bg-sheet p-5">
      <h2 id="pista-team-title" className="heading text-xl text-ink">Mecânicos da pista</h2>
      <p className="mt-1 max-w-prose text-sm text-muted">
        Crie o acesso do mecânico com nome, apelido e senha, sem convite e sem e-mail. Ele entra pelo{' '}
        <Link to={`/oficina/${organizationId}/pista`} className="font-semibold text-ink underline underline-offset-4">App da Pista</Link>
        {code ? <> com o código da oficina <strong className="font-mono tracking-widest text-ink">{code}</strong></> : null} e só vê as ordens de serviço, sem preços nem dados do cliente.
      </p>

      <form noValidate onSubmit={submit} className="mt-4 grid max-w-3xl gap-3 sm:grid-cols-3">
        <TextField label="Nome" autoComplete="off" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <TextField label="Apelido (login)" autoComplete="off" autoCapitalize="none" value={nickname}
          onChange={(e) => setNickname(e.target.value)} hint={nickname ? `Entra como: ${normalizeNickname(nickname) || '—'}` : 'Ex.: davi'} />
        <TextField label="Senha (mín. 6)" type="text" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="sm:col-span-3">
          <Button type="submit" loading={busy}>{busy ? 'Criando…' : 'Criar mecânico'}</Button>
        </div>
      </form>
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      {done && (
        <div className="mt-4 rounded-doc border border-ink/30 bg-paper p-4" aria-live="polite">
          <p className="font-semibold text-ink">Mecânico criado. Passe para ele:</p>
          <p className="mt-1 text-graphite">Apelido: <strong className="font-mono">{done.nickname}</strong> · Senha: <strong className="font-mono">{done.password}</strong>{code ? <> · Código da oficina: <strong className="font-mono">{code}</strong></> : null}</p>
          <p className="mt-1 text-sm text-muted">A senha não aparece de novo. Se ele esquecer, crie uma nova aqui.</p>
        </div>
      )}

      {accounts.isError && <div className="mt-4"><Notice tone="error">Não foi possível carregar os mecânicos.</Notice></div>}
      {list.length > 0 && (
        <ul className="mt-5 divide-y divide-rule border-y border-rule">
          {list.map((a) => <AccountRow key={a.user_id} account={a} organizationId={organizationId} />)}
        </ul>
      )}
    </section>
  )
}

function AccountRow({ account: a, organizationId }: { account: PistaAccount; organizationId: string }) {
  const qc = useQueryClient()
  const [mode, setMode] = useState<'idle' | 'password' | 'disable'>('idle')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  async function run(body: Parameters<typeof managePistaAccount>[1], done: string) {
    setBusy(true)
    setError('')
    setOk('')
    try {
      await managePistaAccount(organizationId, body)
      setMode('idle')
      setPassword('')
      setOk(done)
      await qc.invalidateQueries({ queryKey: pistaAccountsKey(organizationId) })
      await qc.invalidateQueries({ queryKey: ['org-members', organizationId] })
    } catch (err) {
      setError(msg(err))
    }
    setBusy(false)
  }

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-ink">
            {a.full_name || a.nickname} <span className="font-mono font-normal text-muted">· {a.nickname}</span>
            {!a.active && <span className="ml-2 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">Desligado</span>}
          </p>
          <p className="text-sm text-muted">{a.last_sign_in_at ? `Último acesso: ${formatDate(a.last_sign_in_at, 'short')}` : 'Ainda não entrou'}</p>
        </div>
        {mode === 'idle' && (
          <div className="flex flex-wrap gap-1">
            {a.active ? (
              <>
                <Button type="button" size="sm" variant="quiet" onClick={() => setMode('password')}>Trocar senha</Button>
                <Button type="button" size="sm" variant="quiet" onClick={() => setMode('disable')}>Desligar</Button>
              </>
            ) : (
              <Button type="button" size="sm" variant="quiet" loading={busy} onClick={() => void run({ action: 'enable', user_id: a.user_id }, 'Mecânico reativado.')}>Reativar</Button>
            )}
          </div>
        )}
      </div>
      {mode === 'password' && (
        <form className="mt-3 flex max-w-md flex-wrap items-end gap-2" noValidate
          onSubmit={(e) => {
            e.preventDefault()
            if (password.length < 6) return setError('A senha precisa ter pelo menos 6 caracteres.')
            void run({ action: 'password', user_id: a.user_id, password }, `Senha nova de ${a.nickname}: ${password}`)
          }}>
          <div className="min-w-48 flex-1"><TextField label="Senha nova (mín. 6)" type="text" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <Button type="submit" size="sm" loading={busy}>Salvar</Button>
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => { setMode('idle'); setError('') }}>Cancelar</Button>
        </form>
      )}
      {mode === 'disable' && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-graphite">Desligar {a.nickname}? Ele sai do app na hora. Os registros dele continuam nas OS.</span>
          <Button type="button" size="sm" loading={busy} onClick={() => void run({ action: 'disable', user_id: a.user_id }, 'Mecânico desligado.')}>Desligar</Button>
          <Button type="button" size="sm" variant="quiet" disabled={busy} onClick={() => setMode('idle')}>Manter</Button>
        </div>
      )}
      {ok && <p className="mt-2 text-sm text-graphite" aria-live="polite">{ok}</p>}
      {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
    </li>
  )
}

/** Converte um funcionário convidado por e-mail em conta da pista (a conta pessoal dele sai da equipe). */
export function ConvertToPista({ organizationId, memberId, fullName, onDone, onCancel }: {
  organizationId: string; memberId: string; fullName: string; onDone: () => void; onCancel: () => void
}) {
  const qc = useQueryClient()
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    const problem = checkForm(fullName || nickname, nickname, password, false)
    if (problem) return setError(problem)
    setBusy(true)
    setError('')
    try {
      const nick = normalizeNickname(nickname)
      await managePistaAccount(organizationId, { action: 'convert', member_id: memberId, full_name: fullName || nick, nickname: nick, password })
      await qc.invalidateQueries({ queryKey: pistaAccountsKey(organizationId) })
      await qc.invalidateQueries({ queryKey: ['org-members', organizationId] })
      onDone()
    } catch (err) {
      setError(msg(err))
      setBusy(false)
    }
  }

  return (
    <form noValidate onSubmit={submit} className="mt-3 flex max-w-xl flex-col gap-3 rounded-doc border border-rule bg-paper p-3">
      <p className="text-sm text-graphite">
        Cria um acesso só da pista (apelido e senha) com as OS em andamento dele. A conta pessoal com e-mail sai da equipe, mas continua dele.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Apelido (login)" autoComplete="off" autoCapitalize="none" value={nickname} onChange={(e) => setNickname(e.target.value)} />
        <TextField label="Senha (mín. 6)" type="text" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={busy}>Virar conta da pista</Button>
        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={onCancel}>Cancelar</Button>
      </div>
    </form>
  )
}
