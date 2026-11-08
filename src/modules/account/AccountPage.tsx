import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/core/auth/AuthProvider'
import { Button } from '@/components/Button'
import { SelectField, TextAreaField, TextField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { formatDate } from '@/core/shared/format'
import { translateDbError } from '@/core/shared/dbErrors'
import {
  PRIVACY_KIND_LABEL,
  PRIVACY_STATUS_LABEL,
  cancelPrivacyRequest,
  changePassword,
  createPrivacyRequest,
  downloadJson,
  exportMyData,
  fetchMyPrivacyRequests,
  fetchMyProfile,
  updateMyProfile,
  type PrivacyKind,
} from './api'

const KINDS: PrivacyKind[] = ['deletion', 'correction', 'access', 'other']
const errorText = (e: unknown) => translateDbError(e as { code?: string; message?: string })

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-10 border-t border-rule pt-8 first:mt-6 first:border-0 first:pt-0">
      <h2 id={id} className="heading text-2xl text-ink">{title}</h2>
      {children}
    </section>
  )
}

function ProfileForm({ userId }: { userId: string }) {
  const qc = useQueryClient()
  const profile = useQuery({ queryKey: ['my-profile', userId], queryFn: () => fetchMyProfile(userId) })
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    if (profile.data) {
      setName(profile.data.full_name ?? '')
      setPhone(profile.data.phone ?? '')
    }
  }, [profile.data])
  const save = useMutation({
    mutationFn: () => updateMyProfile(userId, name.trim(), phone.replace(/\D/g, '') || null),
    onSuccess: () => {
      setSaved(true)
      qc.invalidateQueries({ queryKey: ['my-profile', userId] })
    },
    onError: (e) => setError(errorText(e)),
  })
  function submit(e: FormEvent) {
    e.preventDefault()
    setSaved(false)
    setError(null)
    const digits = phone.replace(/\D/g, '')
    if (name.trim().length < 2 || name.trim().length > 120) return setError('Informe seu nome (2 a 120 caracteres).')
    if (digits && (digits.length < 10 || digits.length > 13)) return setError('Telefone inválido. Inclua o DDD.')
    save.mutate()
  }
  if (profile.isLoading) return <p className="mt-4 text-muted" role="status">Carregando…</p>
  return (
    <form onSubmit={submit} noValidate className="mt-4 grid max-w-md gap-4" aria-label="Dados pessoais">
      <TextField label="Nome" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120} />
      <TextField label="E-mail" value={profile.data?.email ?? ''} readOnly hint="Para trocar o e-mail, fale com o suporte." />
      <TextField label="Telefone (opcional)" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" maxLength={20} />
      {error && <Notice tone="error">{error}</Notice>}
      {saved && <Notice tone="success">Dados salvos.</Notice>}
      <div><Button type="submit" loading={save.isPending}>Salvar</Button></div>
    </form>
  )
}

function PasswordForm() {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const change = useMutation({
    mutationFn: () => changePassword(pw),
    onSuccess: () => {
      setDone(true)
      setPw('')
      setPw2('')
    },
    onError: (e) => setError(/weak|short|least/i.test((e as Error).message) ? 'Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.' : 'Não foi possível trocar a senha. Tente de novo.'),
  })
  function submit(e: FormEvent) {
    e.preventDefault()
    setDone(false)
    setError(null)
    if (pw.length < 8) return setError('A senha precisa ter pelo menos 8 caracteres.')
    if (pw !== pw2) return setError('As senhas não conferem.')
    change.mutate()
  }
  return (
    <form onSubmit={submit} noValidate className="mt-4 grid max-w-md gap-4" aria-label="Trocar senha">
      <TextField label="Nova senha" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
      <TextField label="Repita a nova senha" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
      {error && <Notice tone="error">{error}</Notice>}
      {done && <Notice tone="success">Senha trocada.</Notice>}
      <div><Button type="submit" variant="secondary" loading={change.isPending}>Trocar senha</Button></div>
    </form>
  )
}

function PrivacySection() {
  const qc = useQueryClient()
  const requests = useQuery({ queryKey: ['my-privacy-requests'], queryFn: fetchMyPrivacyRequests })
  const [kind, setKind] = useState<PrivacyKind>('deletion')
  const [details, setDetails] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const exporting = useMutation({
    mutationFn: exportMyData,
    onSuccess: (data) => downloadJson(data, `moto-passaporte-meus-dados-${new Date().toISOString().slice(0, 10)}.json`),
    onError: () => setExportError('Não foi possível gerar a cópia agora. Tente de novo.'),
  })
  const create = useMutation({
    mutationFn: () => createPrivacyRequest(kind, details),
    onSuccess: () => {
      setSent(true)
      setDetails('')
      qc.invalidateQueries({ queryKey: ['my-privacy-requests'] })
    },
    onError: (e) => setError(errorText(e)),
  })
  const cancel = useMutation({
    mutationFn: cancelPrivacyRequest,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-privacy-requests'] }),
  })
  function submit(e: FormEvent) {
    e.preventDefault()
    setSent(false)
    setError(null)
    if ((kind === 'correction' || kind === 'other') && details.trim().length < 10) return setError('Descreva o pedido (pelo menos 10 caracteres).')
    create.mutate()
  }
  return (
    <>
      <p className="mt-2 max-w-2xl text-muted">
        Pela LGPD você pode pedir uma cópia dos seus dados, correção ou exclusão. Veja a{' '}
        <Link to="/privacidade" className="underline underline-offset-4">política de privacidade</Link>.
      </p>
      <div className="mt-4">
        <Button variant="secondary" loading={exporting.isPending} onClick={() => { setExportError(null); exporting.mutate() }}>
          Baixar meus dados
        </Button>
        <p className="mt-1 text-sm text-muted">Arquivo JSON com sua conta, motos atuais, histórico, diário, assinaturas e avisos. Fotos e notas ficam na página de cada moto.</p>
        {exportError && <div className="mt-2"><Notice tone="error">{exportError}</Notice></div>}
      </div>

      <form onSubmit={submit} noValidate className="mt-6 grid max-w-md gap-4" aria-label="Pedido de privacidade">
        <SelectField label="Pedido" value={kind} onChange={(e) => setKind(e.target.value as PrivacyKind)} options={KINDS} optionLabel={(v) => PRIVACY_KIND_LABEL[v] ?? v} />
        {kind === 'deletion' && (
          <Notice tone="info">
            O histórico da moto pertence à moto e continua com o próximo dono; seus dados pessoais (nome, e-mail, telefone, diário) são apagados ou
            anonimizados. Motos no seu nome precisam ser transferidas ou arquivadas antes. Assinaturas ativas são canceladas.
          </Notice>
        )}
        <TextAreaField label={kind === 'correction' || kind === 'other' ? 'Descreva o pedido' : 'Detalhes (opcional)'} value={details}
          onChange={(e) => setDetails(e.target.value)} maxLength={1000} rows={3} />
        {error && <Notice tone="error">{error}</Notice>}
        {sent && <Notice tone="success">Pedido enviado. Você recebe a resposta aqui e nos avisos.</Notice>}
        <div><Button type="submit" loading={create.isPending}>Enviar pedido</Button></div>
      </form>

      {!!requests.data?.length && (
        <ul className="mt-6 divide-y divide-rule border-y border-rule text-sm" aria-label="Meus pedidos de privacidade">
          {requests.data.map((r) => (
            <li key={r.id} className="py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold text-ink">{PRIVACY_KIND_LABEL[r.kind] ?? r.kind}</span>
                <span className="text-muted">{PRIVACY_STATUS_LABEL[r.status] ?? r.status} · {formatDate(r.created_at)}</span>
              </div>
              {r.details && <p className="mt-1 text-graphite">{r.details}</p>}
              {r.reply && <p className="mt-2 rounded-doc bg-sheet px-3 py-2 text-graphite"><span className="font-semibold">Resposta da equipe:</span> {r.reply}</p>}
              {r.status === 'pending' && (
                <button type="button" onClick={() => cancel.mutate(r.id)} disabled={cancel.isPending}
                  className="mt-2 text-sm font-semibold text-ink underline underline-offset-4">Cancelar pedido</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/** /painel/conta — dados pessoais, senha e direitos do titular (LGPD, ADR-036). */
export function AccountPage() {
  const { user } = useAuth()
  if (!user) return null
  return (
    <div>
      <h1 className="heading text-3xl text-ink">Minha conta</h1>
      <Section id="profile-title" title="Dados pessoais"><ProfileForm userId={user.id} /></Section>
      <Section id="password-title" title="Senha"><PasswordForm /></Section>
      <Section id="privacy-title" title="Privacidade e meus dados"><PrivacySection /></Section>
    </div>
  )
}
