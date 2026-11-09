import { useEffect, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { CheckboxField, SelectField, TextField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { translateDbError } from '@/core/shared/dbErrors'
import { formatDate } from '@/core/shared/format'
import { downloadQrPng, qrSvg } from './qr'
import { fetchMyVault } from '@/modules/maintenance/api'
import {
  createShare,
  DEFAULT_OPTIONS,
  fetchShares,
  OPTION_LABEL,
  revokeShare,
  SHARE_STATUS_LABEL,
  shareUrl,
  type Share,
  type ShareOptions,
  type ShareStatus,
} from './sharesApi'
import { PremiumLink } from '@/modules/plans/PremiumLink'

const errText = (e: unknown) => translateDbError(e as { code?: string; message?: string })
const EXPIRY: Record<string, string> = { '7': '7 dias', '30': '30 dias', '90': '90 dias', none: 'Sem prazo' }
const OPTION_ORDER: Array<keyof ShareOptions> = ['show_history', 'show_mileage', 'show_plate', 'show_values', 'show_attachments', 'show_diary']

/** Links de compartilhamento escolhidos e revogáveis (PRD 11). */
export function ShareSection({ motorcycleId }: { motorcycleId: string }) {
  const queryClient = useQueryClient()
  const shares = useQuery({ queryKey: ['shares', motorcycleId], queryFn: () => fetchShares(motorcycleId) })
  const vault = useQuery({ queryKey: ['my-vault'], queryFn: fetchMyVault, retry: false })
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [expiry, setExpiry] = useState('30')
  const [options, setOptions] = useState<ShareOptions>(DEFAULT_OPTIONS)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [createdId, setCreatedId] = useState<string | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const r = await createShare(motorcycleId, label, expiry === 'none' ? null : Number(expiry), options)
      setCreatedId(r.id)
      setOpen(false)
      setLabel('')
      setOptions(DEFAULT_OPTIONS)
      await queryClient.invalidateQueries({ queryKey: ['shares', motorcycleId] })
    } catch (e) {
      setError(errText(e))
    }
    setBusy(false)
  }

  const list = shares.data ?? []
  const active = list.filter((s) => s.status === 'active')
  const inactive = list.filter((s) => s.status !== 'active')

  return (
    <section id="compartilhar" aria-labelledby="share-title" className="scroll-mt-24">
      <h2 id="share-title" className="heading text-xl text-ink">Compartilhar com comprador</h2>
      <p className="mt-1 max-w-prose text-sm text-muted">
        Crie um link para cada pessoa ou anúncio e escolha o que mostrar. Quem abre não precisa de conta. Você pode revogar quando quiser,
        e se vender a moto os links param de funcionar.
      </p>

      {active.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3" aria-label="Links ativos">
          {active.map((s) => <ShareCard key={s.id} share={s} motorcycleId={motorcycleId} highlight={s.id === createdId} />)}
        </ul>
      )}

      {!open ? (
        <div className="mt-4">
          <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>Criar link de compartilhamento</Button>
        </div>
      ) : (
        <form noValidate onSubmit={onSubmit} className="mt-4 flex max-w-xl flex-col gap-4 rounded-doc border border-rule bg-sheet p-4">
          {vault.data?.applies && (
            <Notice tone="info" title="Seu comprador verá só um resumo">
              No plano gratuito, o link mostra quantos serviços a moto tem, quantos foram feitos por oficina e o último serviço, mas não a lista com detalhes e comprovantes.{' '}
              <PremiumLink>Liberar o histórico completo com o Premium</PremiumLink>
            </Notice>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Nome do link (opcional)" maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Anúncio OLX" />
            <SelectField label="Validade" value={expiry} onChange={(e) => setExpiry(e.target.value)} options={Object.keys(EXPIRY)} optionLabel={(v) => EXPIRY[v] ?? v} />
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-graphite">O que mostrar</legend>
            <p className="mb-3 text-sm text-muted">Sempre aparecem marca, modelo, ano, cilindrada, cor e a data do passaporte. Nunca aparecem seus dados, chassi, observações nem o diário privado.</p>
            <div className="flex flex-col gap-3">
              {OPTION_ORDER.map((k) => {
                const dependsOnHistory = (k === 'show_values' || k === 'show_attachments') && !options.show_history
                return (
                  <CheckboxField
                    key={k}
                    label={<><strong className="text-ink">{OPTION_LABEL[k].label}.</strong> {OPTION_LABEL[k].hint}</>}
                    checked={options[k] && !dependsOnHistory}
                    disabled={dependsOnHistory}
                    onChange={(e) => setOptions({ ...options, [k]: e.target.checked })}
                  />
                )
              })}
            </div>
          </fieldset>
          {error && <Notice tone="error">{error}</Notice>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={busy}>{busy ? 'Criando…' : 'Criar link'}</Button>
            <Button type="button" variant="quiet" disabled={busy} onClick={() => { setOpen(false); setError('') }}>Cancelar</Button>
          </div>
        </form>
      )}

      {inactive.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink">Links encerrados ({inactive.length})</summary>
          <ul className="mt-2 divide-y divide-rule text-sm">
            {inactive.map((s) => (
              <li key={s.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span className="text-graphite">{s.label || 'Sem nome'}</span>
                <span className="text-muted">
                  {SHARE_STATUS_LABEL[s.status as ShareStatus]} em {formatDate(s.revoked_at ?? s.expires_at, 'short')}, {s.view_count} {s.view_count === 1 ? 'acesso' : 'acessos'}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

function ShareCard({ share: s, motorcycleId, highlight }: { share: Share; motorcycleId: string; highlight: boolean }) {
  const queryClient = useQueryClient()
  const url = shareUrl(s.token)
  const [showQr, setShowQr] = useState(highlight)
  const [svg, setSvg] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!showQr) return
    let alive = true
    qrSvg(url).then((m) => alive && setSvg(m))
    return () => {
      alive = false
    }
  }, [showQr, url])

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
    }
  }

  async function onRevoke() {
    setBusy(true)
    setError('')
    try {
      await revokeShare(s.id)
      await queryClient.invalidateQueries({ queryKey: ['shares', motorcycleId] })
    } catch (e) {
      setError(errText(e))
      setBusy(false)
    }
  }

  const shown = OPTION_ORDER.filter((k) => s[k]).map((k) => OPTION_LABEL[k].label)
  return (
    <li className={`rounded-doc border bg-sheet p-4 ${highlight ? 'border-ink' : 'border-rule'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-ink">{s.label || 'Link sem nome'}</p>
          <p className="text-sm text-muted">
            {s.expires_at ? `Vale até ${formatDate(s.expires_at, 'short')}` : 'Sem prazo'}, {s.view_count} {s.view_count === 1 ? 'acesso' : 'acessos'}
          </p>
        </div>
      </div>
      <p className="mt-2 text-sm text-graphite">Mostra: {shown.length ? shown.join(', ') : 'só a identificação da moto'}.</p>
      <p className="mt-2 break-all rounded-doc border border-rule bg-paper px-3 py-2 font-mono text-xs text-graphite">{url}</p>
      {showQr && (
        <div className="mt-3 aspect-square w-40 rounded-doc border border-rule bg-sheet p-2">
          {svg ? (
            <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" role="img" aria-label={`QR Code para ${s.label || 'o link'}`} dangerouslySetInnerHTML={{ __html: svg }} />
          ) : (
            <div className="h-full w-full animate-pulse bg-paper-deep" aria-hidden="true" />
          )}
        </div>
      )}
      {error && <div className="mt-2"><Notice tone="error">{error}</Notice></div>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={copy}>{copied ? 'Link copiado' : 'Copiar link'}</Button>
        {showQr ? (
          <Button type="button" size="sm" variant="secondary" onClick={() => downloadQrPng(url, s.label || 'compartilhamento')}>Baixar QR Code</Button>
        ) : (
          <Button type="button" size="sm" variant="secondary" onClick={() => setShowQr(true)}>Mostrar QR Code</Button>
        )}
        <a href={url} target="_blank" rel="noreferrer" className="px-2 py-2 text-sm font-semibold text-ink underline-offset-4 hover:underline">Ver como o comprador</a>
        {confirm ? (
          <>
            <span className="text-sm text-graphite">Revogar este link?</span>
            <Button type="button" size="sm" loading={busy} onClick={onRevoke}>Revogar</Button>
            <Button type="button" size="sm" variant="quiet" disabled={busy} onClick={() => setConfirm(false)}>Manter</Button>
          </>
        ) : (
          <Button type="button" size="sm" variant="quiet" onClick={() => setConfirm(true)}>Revogar</Button>
        )}
      </div>
    </li>
  )
}
