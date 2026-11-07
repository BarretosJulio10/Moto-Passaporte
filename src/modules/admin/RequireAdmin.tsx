import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getSupabase } from '@/lib/supabase'
import { useAuth } from '@/core/auth/AuthProvider'
import { Button } from '@/components/Button'
import { TextField } from '@/components/Field'
import { Notice } from '@/components/Notice'

type Access = { has_admin_role: boolean; aal: string; allowed: boolean }

async function fetchAccess(): Promise<Access> {
  const { data, error } = await getSupabase().rpc('my_admin_access')
  if (error) throw error
  return data as unknown as Access
}

const CODE = /^\d{6}$/

function mfaError(message: string | undefined): string {
  const m = message ?? ''
  if (/invalid|expired|code/i.test(m)) return 'Código incorreto ou vencido. Confira o horário do celular e digite o código atual.'
  if (/disabled|not enabled/i.test(m)) return 'A verificação em duas etapas está desligada no Supabase (Authentication → Multi-Factor). Ligue o TOTP e tente de novo.'
  return 'Não foi possível concluir. Tente de novo em instantes.'
}

/** Ativação ou confirmação da verificação em duas etapas (TOTP) para administradores (ADR-030). */
function AdminMfa({ onDone }: { onDone: () => void }) {
  const [factorId, setFactorId] = useState<string | null>(null)
  const [enrolling, setEnrolling] = useState<{ id: string; qr: string; secret: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const mfa = getSupabase().auth.mfa
      const { data, error: e } = await mfa.listFactors()
      if (!alive) return
      if (e) {
        setError(mfaError(e.message))
        setLoading(false)
        return
      }
      const verified = data.totp.find((f) => f.status === 'verified')
      if (verified) setFactorId(verified.id)
      setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [])

  async function startEnroll() {
    setBusy(true)
    setError(null)
    const mfa = getSupabase().auth.mfa
    const { data: list } = await mfa.listFactors()
    for (const f of list?.all ?? []) if (f.status === 'unverified') await mfa.unenroll({ factorId: f.id })
    const { data, error: e } = await mfa.enroll({ factorType: 'totp', friendlyName: `Moto Passaporte ${new Date().toISOString().slice(0, 10)}` })
    setBusy(false)
    if (e || !data) return setError(mfaError(e?.message))
    setEnrolling({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const id = enrolling?.id ?? factorId
    if (!id) return
    if (!CODE.test(code.trim())) return setError('Digite os 6 números do aplicativo.')
    setBusy(true)
    setError(null)
    const { error: err } = await getSupabase().auth.mfa.challengeAndVerify({ factorId: id, code: code.trim() })
    setBusy(false)
    if (err) return setError(mfaError(err.message))
    onDone()
  }

  if (loading) return <p className="text-muted" role="status">Verificando…</p>

  const codeForm = (
    <form onSubmit={submit} noValidate className="mt-5 grid max-w-xs gap-3" aria-label="Código de verificação">
      <TextField label="Código de 6 números" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" loading={busy}>{busy ? 'Verificando…' : 'Confirmar'}</Button>
    </form>
  )

  return (
    <div className="max-w-xl">
      <h1 className="heading text-3xl text-ink">Verificação em duas etapas</h1>
      {factorId && !enrolling ? (
        <>
          <p className="mt-2 text-muted">Para entrar na administração, digite o código que aparece no seu aplicativo autenticador.</p>
          {codeForm}
        </>
      ) : enrolling ? (
        <>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-graphite">
            <li>Abra um aplicativo autenticador no celular (Google Authenticator, Microsoft Authenticator, 1Password…).</li>
            <li>Leia o QR Code abaixo ou digite a chave.</li>
            <li>Digite o código de 6 números que aparecer.</li>
          </ol>
          <img src={enrolling.qr} alt="QR Code para o aplicativo autenticador" className="mt-4 h-48 w-48 rounded-doc border border-rule bg-white p-2" />
          <p className="mt-2 text-sm text-muted">Chave: <code className="break-all font-mono text-ink">{enrolling.secret}</code></p>
          {codeForm}
        </>
      ) : (
        <>
          <p className="mt-2 text-muted">
            A área administrativa exige a verificação em duas etapas: além da senha, um código que muda a cada 30 segundos no seu celular.
            Isso protege os dados de todos os usuários mesmo se a sua senha vazar.
          </p>
          {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
          <Button className="mt-5" loading={busy} onClick={startEnroll}>Ativar agora</Button>
        </>
      )}
      <p className="mt-6 text-sm text-muted">
        Perdeu o celular? Remova o fator da sua conta no painel do Supabase (Authentication → Users) e ative de novo.
      </p>
    </div>
  )
}

/**
 * Esconde a área administrativa de quem não é admin e exige a verificação em duas etapas.
 * A proteção real está no banco: is_admin() só vale com a sessão verificada (aal2).
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const check = useQuery({ queryKey: ['admin-access', user?.id], enabled: Boolean(user), queryFn: fetchAccess })

  if (check.isLoading) return <p className="text-muted" role="status">Verificando acesso…</p>
  if (check.data?.has_admin_role && !check.data.allowed) {
    return <AdminMfa onDone={() => qc.invalidateQueries()} />
  }
  if (!check.data?.allowed) {
    return (
      <div>
        <h1 className="heading text-3xl text-ink">Acesso restrito</h1>
        <p className="mt-2 text-muted">Esta área é exclusiva da equipe Moto Passaporte.</p>
        <Link to="/painel" className="mt-5 inline-block font-semibold text-ink underline underline-offset-4">Voltar ao painel</Link>
      </div>
    )
  }
  return <>{children}</>
}
