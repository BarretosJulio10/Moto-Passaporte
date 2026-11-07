import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { TextField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { env } from '@/core/config/env'
import { translateDbError } from '@/core/shared/dbErrors'
import {
  checkPaymentConnection,
  fetchPaymentSettings,
  savePaymentSettings,
  validatePaymentInput,
  type CheckResult,
  type PaymentEnvironment,
  type PaymentSettings,
} from './paymentsApi'

const ENV_LABEL: Record<PaymentEnvironment, string> = { test: 'Teste', production: 'Produção' }

function Status({ s }: { s: PaymentSettings }) {
  if (!s.access_token_configured) return <Notice tone="info">Nenhum token cadastrado. Cole o token de acesso da sua conta do Mercado Pago abaixo.</Notice>
  if (s.last_check_ok === true)
    return (
      <Notice tone="success">
        Conectado à conta {s.account_nickname ?? s.account_id} (id {s.account_id}) em ambiente de {ENV_LABEL[s.environment].toLowerCase()}.
        {s.last_check_at ? ` Testado em ${new Date(s.last_check_at).toLocaleString('pt-BR')}.` : ''}
      </Notice>
    )
  if (s.last_check_ok === false) return <Notice tone="error">{s.last_check_message ?? 'O último teste falhou.'}</Notice>
  return <Notice tone="info">Token cadastrado e ainda não testado. Use "Testar conexão".</Notice>
}

/** Credenciais do Mercado Pago, trocáveis pelo administrador (ADR-019). */
export function AdminPaymentsPage() {
  const qc = useQueryClient()
  const settings = useQuery({ queryKey: ['payment-settings'], queryFn: fetchPaymentSettings })
  const [environment, setEnvironment] = useState<PaymentEnvironment>('test')
  const [publicKey, setPublicKey] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [check, setCheck] = useState<CheckResult | null>(null)

  useEffect(() => {
    if (!settings.data) return
    setEnvironment(settings.data.environment)
    setPublicKey(settings.data.public_key ?? '')
  }, [settings.data])

  const save = useMutation({
    mutationFn: savePaymentSettings,
    onSuccess: () => {
      setAccessToken('')
      setWebhookSecret('')
      setSaved(true)
      setCheck(null)
      qc.invalidateQueries({ queryKey: ['payment-settings'] })
    },
    onError: (e) => setError(translateDbError(e as { code?: string; message?: string })),
  })

  const test = useMutation({
    mutationFn: checkPaymentConnection,
    onSuccess: (r) => {
      setCheck(r)
      qc.invalidateQueries({ queryKey: ['payment-settings'] })
    },
    onError: () => setCheck({ ok: false, message: 'Não foi possível testar agora. Tente de novo em alguns minutos.', account_id: null, nickname: null }),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    setSaved(false)
    const input = { environment, publicKey, accessToken, webhookSecret }
    const invalid = validatePaymentInput(input)
    if (invalid) return setError(invalid)
    const s = settings.data
    if (s && (accessToken.trim() || environment !== s.environment) && s.access_token_configured) {
      const ok = window.confirm(
        'Trocar o token ou o ambiente muda a conta que recebe os pagamentos. Assinaturas criadas na conta anterior continuam lá. Continuar?',
      )
      if (!ok) return
    }
    setError(null)
    save.mutate(input)
  }

  const webhookUrl = env.supabaseUrl ? `${env.supabaseUrl}/functions/v1/mercadopago-webhook` : null
  const s = settings.data

  return (
    <div>
      <Link to="/admin" className="text-sm text-muted underline underline-offset-4">Administração</Link>
      <h1 className="heading mt-2 text-3xl text-ink">Pagamentos (Mercado Pago)</h1>
      <p className="mt-1 max-w-2xl text-muted">
        A conta do Mercado Pago que recebe as assinaturas. Você pode trocar de conta quando quiser. O token fica guardado criptografado no servidor e
        nunca é mostrado de novo, nem para você.
      </p>

      {settings.isLoading && <p className="mt-6 text-muted" role="status">Carregando…</p>}
      {settings.isError && <div className="mt-6"><Notice tone="error">Não foi possível carregar a configuração.</Notice></div>}

      {s && (
        <>
          <div className="mt-6 max-w-2xl space-y-3">
            <Status s={s} />
            {!s.billing_enabled && (
              <p className="text-sm text-muted">A contratação pelo site continua desligada até o fluxo de pagamento ser testado de ponta a ponta.</p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" onClick={() => test.mutate()} loading={test.isPending} disabled={!s.access_token_configured}>
                Testar conexão
              </Button>
              {check && <span role="status" className={check.ok ? 'text-sm text-ink' : 'text-sm text-danger'}>{check.message}</span>}
            </div>
          </div>

          <form onSubmit={submit} className="mt-8 grid max-w-2xl gap-5 rounded-sheet border border-rule bg-sheet p-5" aria-label="Credenciais do Mercado Pago">
            <fieldset>
              <legend className="text-sm font-semibold text-graphite">Ambiente</legend>
              <div className="mt-2 flex flex-wrap gap-5">
                {(['test', 'production'] as const).map((v) => (
                  <label key={v} className="flex items-center gap-2 text-graphite">
                    <input type="radio" name="environment" value={v} checked={environment === v} onChange={() => setEnvironment(v)} className="h-4 w-4 accent-ink" />
                    {ENV_LABEL[v]}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-sm text-muted">Use Teste com as credenciais de teste até validar tudo. Em Produção, as cobranças são reais.</p>
            </fieldset>
            <TextField label="Chave pública (Public key)" value={publicKey} onChange={(e) => setPublicKey(e.target.value)} autoComplete="off" spellCheck={false}
              placeholder="APP_USR-… ou TEST-…" />
            <TextField
              label="Token de acesso (Access token)"
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              autoComplete="new-password"
              spellCheck={false}
              placeholder={s.access_token_configured ? `Cadastrado, termina em ${s.access_token_hint}` : 'APP_USR-… ou TEST-…'}
              hint={s.access_token_configured ? 'Deixe em branco para manter o atual. Preencha só para trocar de conta.' : 'No Mercado Pago: Suas integrações → sua aplicação → Credenciais.'}
            />
            <TextField
              label="Assinatura secreta do Webhook"
              type="password"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              autoComplete="new-password"
              spellCheck={false}
              placeholder={s.webhook_secret_configured ? `Cadastrada, termina em ${s.webhook_secret_hint}` : 'Opcional por enquanto'}
              hint="Usada para confirmar que os avisos de pagamento vieram mesmo do Mercado Pago. Deixe em branco para manter a atual."
            />
            {webhookUrl && (
              <div className="text-sm">
                <p className="font-semibold text-graphite">Endereço para avisos (Webhooks)</p>
                <p className="mt-1 break-all font-mono text-muted">{webhookUrl}</p>
                <p className="mt-1 text-muted">Cadastre no Mercado Pago quando a etapa de assinaturas estiver pronta (eventos de pagamentos e assinaturas).</p>
              </div>
            )}
            {error && <Notice tone="error">{error}</Notice>}
            {saved && !error && <Notice tone="success">Configuração salva. Teste a conexão.</Notice>}
            <div>
              <Button type="submit" loading={save.isPending}>Salvar</Button>
            </div>
            {s.updated_by_name && (
              <p className="text-sm text-muted">Última alteração por {s.updated_by_name} em {new Date(s.updated_at).toLocaleString('pt-BR')}.</p>
            )}
          </form>
        </>
      )}
    </div>
  )
}
