import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { TextField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { translateDbError } from '@/core/shared/dbErrors'
import { KIND_LABEL } from '@/modules/notifications/api'
import {
  fetchAuthEmails,
  fetchMessagingSettings, fetchOutboundMessages, messagingAction, saveMessagingSettings, type WaStatus,
} from './messagingApi'

const STATUS_LABEL = { sent: 'enviado', failed: 'falhou', skipped: 'retido' } as const
const errText = (e: unknown) => (e instanceof Error && !(e as { code?: string }).code ? e.message : translateDbError(e as { code?: string; message?: string }))

/** Conexão do WhatsApp pela FZAP: situação, QR Code para ler no celular e mensagem de teste. */
function WhatsappConnection({ hasUrl, hasToken, instance, onCreated }: { hasUrl: boolean; hasToken: boolean; instance: string | null; onCreated: () => void }) {
  const [created, setCreated] = useState(false)
  const configured = hasUrl && (hasToken || created)
  const [status, setStatus] = useState<WaStatus | null>(null)
  const [qr, setQr] = useState<string>('')
  const [waiting, setWaiting] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [adminToken, setAdminToken] = useState('')
  const [pairPhone, setPairPhone] = useState('')
  const [pairCode, setPairCode] = useState('')

  const pairCodeRef = useRef('')
  pairCodeRef.current = pairCode

  async function run<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
    setBusy(name)
    setMsg(null)
    try {
      return await fn()
    } catch (e) {
      setMsg({ tone: 'error', text: errText(e) })
      return null
    } finally {
      setBusy(null)
    }
  }

  const refresh = () => run('status', () => messagingAction<WaStatus>('wa_status')).then((s) => setStatus(s ?? { connected: false, loggedIn: false }))
  useEffect(() => { if (hasUrl && hasToken) void refresh() }, [hasUrl, hasToken])

  // Enquanto espera a leitura: busca o QR (ele muda a cada ~20 s) e confere se conectou.
  useEffect(() => {
    if (!waiting) return
    let stop = false
    const tick = async () => {
      try {
        const s = await messagingAction<WaStatus>('wa_status')
        if (stop) return
        setStatus(s)
        if (s.loggedIn) {
          setWaiting(false)
          setQr('')
          setPairCode('')
          setMsg({ tone: 'success', text: 'WhatsApp conectado.' })
          return
        }
        if (pairCodeRef.current) return
        const q = await messagingAction<{ qr: string }>('wa_qr')
        if (!stop && q.qr) setQr(q.qr)
      } catch (e) {
        if (!stop) setMsg({ tone: 'error', text: errText(e) })
      }
    }
    void tick()
    const t = window.setInterval(() => void tick(), 4000)
    const end = window.setTimeout(() => { setWaiting(false); setQr(''); setPairCode(''); setMsg({ tone: 'info', text: 'O código expirou. Gere um novo.' }) }, 120_000)
    return () => { stop = true; window.clearInterval(t); window.clearTimeout(end) }
  }, [waiting])

  if (!hasUrl) return <Notice tone="info">Salve o endereço da FZAP para criar a instância e conectar o número.</Notice>

  // Cria a instância com o token de administrador (usado só agora; o servidor guarda apenas o token da instância).
  const createForm = (
    <form className="space-y-2" onSubmit={(e) => {
      e.preventDefault()
      void run('create', () => messagingAction<{ name: string; loggedIn: boolean }>('wa_create_instance', { admin_token: adminToken })).then((r) => {
        if (!r) return
        setAdminToken('')
        setCreated(true)
        onCreated()
        setMsg({ tone: 'success', text: `Instância ${r.name} criada. Leia o QR Code com o celular do número dos avisos.` })
        setStatus({ connected: true, loggedIn: r.loggedIn })
        if (!r.loggedIn) setWaiting(true)
      })
    }}>
      <TextField label="Token de administrador da FZAP" type="password" autoComplete="off" spellCheck={false} value={adminToken}
        onChange={(e) => setAdminToken(e.target.value)}
        hint="Usado só para criar a instância agora. Não fica guardado: o sistema guarda apenas o token da instância nova." />
      <Button size="sm" type="submit" loading={busy === 'create'} disabled={adminToken.trim().length < 6}>Criar instância e gerar QR Code</Button>
    </form>
  )

  if (!configured) {
    return (
      <div className="space-y-3">
        {createForm}
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {instance && <p className="text-sm text-muted">Instância na FZAP: <strong className="text-ink">{instance}</strong></p>}
      <p className="text-sm text-graphite" role="status">
        {status === null ? 'Conferindo a conexão…'
          : status.loggedIn ? <>Conectado{status.number ? <> ao número <strong>{status.number}</strong></> : ''}.</>
            : status.connected ? 'Aguardando a leitura do QR Code.' : 'Desconectado.'}
      </p>
      <div className="flex flex-wrap gap-2">
        {!status?.loggedIn && (
          <Button size="sm" loading={busy === 'connect'} disabled={waiting}
            onClick={() => { setPairCode(''); void run('connect', () => messagingAction<WaStatus>('wa_connect')).then((s) => { if (s) { setStatus(s); if (!s.loggedIn) setWaiting(true) } }) }}>
            Conectar (QR Code)
          </Button>
        )}
        <Button size="sm" variant="secondary" loading={busy === 'status'} onClick={() => void refresh()}>Atualizar</Button>
        {status?.loggedIn && (
          <Button size="sm" variant="quiet" loading={busy === 'logout'}
            onClick={() => { if (window.confirm('Desconectar o número? Os avisos por WhatsApp param até conectar de novo.')) void run('logout', () => messagingAction('wa_logout')).then(() => refresh()) }}>
            Desconectar
          </Button>
        )}
      </div>
      {waiting && pairCode && (
        <div className="rounded-doc border border-rule bg-paper p-4">
          <p className="text-sm text-graphite">No celular do número dos avisos: WhatsApp → <strong>Aparelhos conectados</strong> → <strong>Conectar um aparelho</strong> → <strong>Conectar com número de telefone</strong>, e digite:</p>
          <p className="mt-3 font-mono text-3xl font-bold tracking-widest text-ink" aria-label="Código para conectar o WhatsApp">{pairCode}</p>
          <p className="mt-2 text-sm text-muted" role="status">Aguardando você digitar o código…</p>
        </div>
      )}
      {waiting && !pairCode && (
        <div className="rounded-doc border border-rule bg-paper p-4">
          <p className="text-sm text-graphite">No celular do número que vai mandar os avisos: WhatsApp → <strong>Aparelhos conectados</strong> → <strong>Conectar um aparelho</strong> e aponte para o código.</p>
          {qr ? <img src={qr} alt="QR Code para conectar o WhatsApp" className="mt-3 h-64 w-64 bg-white p-2" /> : <p className="mt-3 text-sm text-muted" role="status">Gerando o QR Code…</p>}
        </div>
      )}
      {!status?.loggedIn && (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => {
          e.preventDefault()
          void run('pair', () => messagingAction<{ code: string }>('wa_pair', { phone: pairPhone })).then((r) => {
            if (!r) return
            setQr('')
            setPairCode(r.code)
            setWaiting(false)
            window.setTimeout(() => setWaiting(true), 0)
          })
        }}>
          <TextField label="Ou conecte pelo número (com DDD)" value={pairPhone} onChange={(e) => setPairPhone(e.target.value)} inputMode="tel"
            placeholder="21 99999-9999" className="w-60" />
          <Button size="sm" type="submit" variant="secondary" loading={busy === 'pair'} disabled={pairPhone.replace(/\D/g, '').length < 10}>Receber código</Button>
        </form>
      )}
      {status?.loggedIn && (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void run('test', () => messagingAction('test_whatsapp', { phone })).then((r) => r && setMsg({ tone: 'success', text: r.detail ?? 'Enviado.' })) }}>
          <TextField label="Celular para teste (com DDD)" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className="w-60" />
          <Button size="sm" type="submit" variant="secondary" loading={busy === 'test'}>Enviar teste</Button>
        </form>
      )}
      {!instance && !status?.loggedIn && !waiting && (
        <details className="rounded-doc border border-rule p-3">
          <summary className="cursor-pointer text-sm font-semibold text-ink">Criar uma instância nova na FZAP</summary>
          <div className="mt-3">{createForm}</div>
        </details>
      )}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  )
}

/** Avisos por e-mail (Resend) e WhatsApp (FZAP), ADR-064. */
export function AdminMessagingPage() {
  const qc = useQueryClient()
  const settings = useQuery({ queryKey: ['messaging-settings'], queryFn: fetchMessagingSettings })
  const history = useQuery({ queryKey: ['outbound-messages'], queryFn: fetchOutboundMessages })
  const [form, setForm] = useState({ emailEnabled: false, emailFrom: '', linkBase: '', resendKey: '', whatsappEnabled: false, fzapUrl: '', fzapToken: '', cooldownHours: 48 })
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [emailTest, setEmailTest] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    const s = settings.data
    if (!s) return
    setForm((f) => ({ ...f, emailEnabled: s.email_enabled, emailFrom: s.email_from, linkBase: s.link_base, whatsappEnabled: s.whatsapp_enabled,
      fzapUrl: s.fzap_url ?? '', cooldownHours: s.whatsapp_cooldown_hours }))
  }, [settings.data])

  const save = useMutation({
    mutationFn: saveMessagingSettings,
    onSuccess: () => {
      setForm((f) => ({ ...f, resendKey: '', fzapToken: '' }))
      setSaved(true)
      void qc.invalidateQueries({ queryKey: ['messaging-settings'] })
    },
    onError: (e) => setError(errText(e)),
  })
  const testEmail = useMutation({
    mutationFn: () => messagingAction('test_email'),
    onSuccess: (r) => setEmailTest({ ok: true, text: r.detail ?? 'Enviado.' }),
    onError: (e) => setEmailTest({ ok: false, text: errText(e) }),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    setSaved(false)
    setError(null)
    save.mutate(form)
  }

  const s = settings.data
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))
  const count = (k: string) => s?.last_24h[k] ?? 0

  return (
    <div>
      <Link to="/admin" className="text-sm text-muted underline underline-offset-4">Administração</Link>
      <h1 className="heading mt-2 text-3xl text-ink">E-mail e WhatsApp</h1>
      <p className="mt-1 max-w-2xl text-muted">
        Avisos que saem do sistema: fim do Premium, limite de motos e falhas de cobrança, com o link para resolver no site.
        É por aqui que o convite para assinar chega a quem usa o app da Google Play. As chaves ficam guardadas criptografadas e nunca são mostradas de novo.
      </p>

      {settings.isLoading && <p className="mt-6 text-muted" role="status">Carregando…</p>}
      {settings.isError && <div className="mt-6"><Notice tone="error">Não foi possível carregar a configuração.</Notice></div>}

      {s && (
        <div className="mt-6 grid items-start gap-8 xl:grid-cols-2">
          <form onSubmit={submit} className="grid gap-5 rounded-sheet border border-rule bg-sheet p-5" aria-label="Configuração de envio">
            <fieldset className="grid gap-4">
              <legend className="heading text-xl text-ink">E-mail (Resend)</legend>
              <label className="flex items-center gap-2 text-graphite">
                <input type="checkbox" className="h-4 w-4 accent-ink" checked={form.emailEnabled} onChange={(e) => set('emailEnabled', e.target.checked)} />
                Enviar avisos por e-mail
              </label>
              <TextField label="Chave de API do Resend" type="password" autoComplete="new-password" spellCheck={false} value={form.resendKey}
                onChange={(e) => set('resendKey', e.target.value)}
                placeholder={s.resend_key_configured ? `Cadastrada, termina em ${s.resend_key_hint}` : 're_…'}
                hint="No Resend: API Keys → Create API Key (permissão Sending access). Deixe em branco para manter a atual." />
              <TextField label="Remetente" value={form.emailFrom} onChange={(e) => set('emailFrom', e.target.value)} spellCheck={false}
                hint="O domínio precisa estar verificado no Resend (Domains)." />
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" size="sm" variant="secondary" loading={testEmail.isPending} disabled={!s.resend_key_configured} onClick={() => testEmail.mutate()}>
                  Enviar e-mail de teste para mim
                </Button>
                {emailTest && <span role="status" className={emailTest.ok ? 'text-sm text-ink' : 'text-sm text-danger'}>{emailTest.text}</span>}
              </div>
            </fieldset>

            <fieldset className="grid gap-4 border-t border-rule pt-5">
              <legend className="heading text-xl text-ink">WhatsApp (FZAP)</legend>
              <label className="flex items-center gap-2 text-graphite">
                <input type="checkbox" className="h-4 w-4 accent-ink" checked={form.whatsappEnabled} onChange={(e) => set('whatsappEnabled', e.target.checked)} />
                Enviar avisos por WhatsApp (só para quem autorizar na conta)
              </label>
              <TextField label="Endereço da FZAP" value={form.fzapUrl} onChange={(e) => set('fzapUrl', e.target.value)} spellCheck={false}
                placeholder="https://fzap.seudominio.com.br" />
              <p className="text-sm text-muted">
                O número é conectado no quadro <strong>Número do WhatsApp</strong>, ao lado. Use um número só para os avisos, nunca o WhatsApp de atendimento.
              </p>
              <TextField label="Intervalo mínimo entre avisos opcionais para a mesma pessoa (horas)" type="number" min={1} max={720}
                value={String(form.cooldownHours)} onChange={(e) => set('cooldownHours', Number(e.target.value) || 48)} className="max-w-xs" />
            </fieldset>

            <fieldset className="grid gap-4 border-t border-rule pt-5">
              <legend className="heading text-xl text-ink">Links</legend>
              <TextField label="Endereço usado nos links" value={form.linkBase} onChange={(e) => set('linkBase', e.target.value)} spellCheck={false}
                hint="Quando o app da Google Play estiver publicado, use um endereço que o app não abre (ex.: https://conta.motopassaporte.com.br), para a compra acontecer no navegador." />
            </fieldset>

            {error && <Notice tone="error">{error}</Notice>}
            {saved && !error && <Notice tone="success">Configuração salva.</Notice>}
            <div><Button type="submit" loading={save.isPending}>Salvar</Button></div>
            {s.updated_by_name && <p className="text-sm text-muted">Última alteração por {s.updated_by_name} em {new Date(s.updated_at).toLocaleString('pt-BR')}.</p>}
          </form>

          <div className="grid gap-6">
            <section className="rounded-sheet border border-rule bg-sheet p-5" aria-labelledby="wa-title">
              <h2 id="wa-title" className="heading text-xl text-ink">Número do WhatsApp</h2>
              <div className="mt-3"><WhatsappConnection hasUrl={Boolean(s.fzap_url)} hasToken={s.fzap_token_configured} instance={s.fzap_instance_id ?? null}
                onCreated={() => void qc.invalidateQueries({ queryKey: ['messaging-settings'] })} /></div>
            </section>

            <AuthEmailsSection />

            <section className="rounded-sheet border border-rule bg-sheet p-5" aria-labelledby="hist-title">
              <h2 id="hist-title" className="heading text-xl text-ink">Envios</h2>
              <p className="mt-1 text-sm text-muted">
                Últimas 24 h: e-mail {count('email:sent')} enviados, {count('email:failed')} com falha · WhatsApp {count('whatsapp:sent')} enviados,{' '}
                {count('whatsapp:failed')} com falha, {count('whatsapp:skipped')} retidos. Na fila: {s.pending.email} e-mail(s), {s.pending.whatsapp} WhatsApp.
              </p>
              {history.data && history.data.length === 0 && <p className="mt-3 text-sm text-muted">Nenhum envio ainda.</p>}
              {history.data && history.data.length > 0 && (
                <ul className="mt-3 max-h-[28rem] divide-y divide-rule overflow-auto border-y border-rule text-sm">
                  {history.data.map((m) => (
                    <li key={m.id} className="py-2">
                      <span className="font-semibold text-ink">{m.channel === 'email' ? 'E-mail' : 'WhatsApp'}</span>{' '}
                      <span className={m.status === 'failed' ? 'text-danger' : 'text-muted'}>{STATUS_LABEL[m.status]}</span>
                      <span className="text-graphite"> · {KIND_LABEL[m.kind] ?? m.kind} · {m.user_name ?? '—'} ({m.destination})</span>
                      <span className="block text-xs text-muted">{new Date(m.created_at).toLocaleString('pt-BR')}{m.error ? ` · ${m.error}` : ''}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  )
}

const AUTH_ACTION: Record<string, string> = {
  signup: 'Confirmação de cadastro', recovery: 'Nova senha', email_change: 'Troca de e-mail',
  invite: 'Convite', magiclink: 'Link de acesso', reauthentication: 'Código de confirmação',
}

function AuthEmailsSection() {
  const list = useQuery({ queryKey: ['auth-emails'], queryFn: fetchAuthEmails, refetchInterval: 30_000 })
  return (
    <section className="rounded-sheet border border-rule bg-sheet p-5" aria-labelledby="auth-mail-title">
      <h2 id="auth-mail-title" className="heading text-xl text-ink">E-mails de login</h2>
      <p className="mt-1 text-sm text-muted">Confirmação de cadastro e nova senha, enviados pelo Resend. "Aceito" quer dizer que o Resend recebeu para entregar.</p>
      {list.isError && <p className="mt-3 text-sm text-danger">Não foi possível carregar.</p>}
      {list.data && list.data.length === 0 && <p className="mt-3 text-sm text-muted">Nenhum envio ainda.</p>}
      {list.data && list.data.length > 0 && (
        <ul className="mt-3 max-h-72 divide-y divide-rule overflow-auto border-y border-rule text-sm">
          {list.data.map((m, i) => (
            <li key={`${m.created_at}-${i}`} className="py-2">
              <span className="font-semibold text-ink">{AUTH_ACTION[m.action] ?? m.action}</span>{' '}
              <span className={m.status === 'recusado' ? 'text-danger' : 'text-muted'}>{m.status}</span>
              <span className="text-graphite"> · {m.email_hint}</span>
              <span className="block text-xs text-muted">{new Date(m.created_at).toLocaleString('pt-BR')}{m.detail ? ` · ${m.detail}` : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
