import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { publicPassportUrl } from '@/modules/motorcycles/api'
import { downloadQrPng, qrSvg } from './qr'
import { fetchPublicPageEnabled, setPublicPageEnabled } from './sharesApi'

/** QR Code do passaporte público. Aponta para /p/:public_id — nunca para o id interno. */
export function QrCodePanel({ publicId, label, motorcycleId }: { publicId: string; label: string; motorcycleId?: string }) {
  const url = publicPassportUrl(publicId)
  const [svg, setSvg] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let active = true
    qrSvg(url).then((markup) => {
      if (active) setSvg(markup)
    })
    return () => {
      active = false
    }
  }, [url])

  async function download() {
    await downloadQrPng(url, label)
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section aria-labelledby="qr-title" className="guilloche rounded-sheet border border-rule p-5">
      <h2 id="qr-title" className="font-semibold text-ink">QR Code do passaporte</h2>
      <p className="mt-1 text-sm text-muted">
        Quem escanear vê marca, modelo, ano, cilindrada, cor e a data de criação do passaporte. Placa, chassi e seus dados não aparecem.
      </p>
      <div className="mx-auto mt-4 aspect-square w-full max-w-[13rem] rounded-doc border border-rule bg-sheet p-2">
        {svg ? (
          <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" role="img" aria-label={`QR Code para ${url}`} dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <div className="h-full w-full animate-pulse bg-paper-deep" aria-hidden="true" />
        )}
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <Button type="button" onClick={download} size="sm">Baixar QR Code</Button>
        <Button type="button" variant="secondary" size="sm" onClick={copy}>
          {copied ? 'Link copiado' : 'Copiar link'}
        </Button>
        <a href={url} target="_blank" rel="noreferrer" className="px-2 py-2 text-center text-sm font-semibold text-ink underline-offset-4 hover:underline">
          Abrir página pública
        </a>
      </div>
      {motorcycleId && <PublicPageToggle motorcycleId={motorcycleId} />}
      <span className="sr-only" aria-live="polite">{copied ? 'Link copiado para a área de transferência.' : ''}</span>
    </section>
  )
}

/** O titular pode desativar a página básica do QR Code permanente (ADR-017). */
function PublicPageToggle({ motorcycleId }: { motorcycleId: string }) {
  const queryClient = useQueryClient()
  const setting = useQuery({ queryKey: ['public-page', motorcycleId], queryFn: () => fetchPublicPageEnabled(motorcycleId) })
  const [busy, setBusy] = useState(false)
  if (setting.data === undefined) return null
  const enabled = setting.data
  async function toggle() {
    setBusy(true)
    try {
      await setPublicPageEnabled(motorcycleId, !enabled)
      await queryClient.invalidateQueries({ queryKey: ['public-page', motorcycleId] })
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="mt-4 border-t border-rule pt-3 text-sm">
      <p className="text-graphite">
        Página básica: <strong className="text-ink">{enabled ? 'ativa' : 'desativada'}</strong>
      </p>
      {!enabled && <p className="text-muted">Quem escanear este QR Code vê "indisponível".</p>}
      <Button type="button" size="sm" variant="quiet" loading={busy} onClick={toggle}>
        {enabled ? 'Desativar página básica' : 'Reativar página básica'}
      </Button>
    </div>
  )
}
