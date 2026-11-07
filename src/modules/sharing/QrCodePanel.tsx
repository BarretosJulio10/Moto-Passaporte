import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Button } from '@/components/Button'
import { publicPassportUrl } from '@/modules/motorcycles/api'

const QR_OPTIONS = {
  errorCorrectionLevel: 'M' as const,
  margin: 1,
  color: { dark: '#1C2B4A', light: '#F8FAF5' },
}

/** QR Code do passaporte público. Aponta para /p/:public_id — nunca para o id interno. */
export function QrCodePanel({ publicId, label }: { publicId: string; label: string }) {
  const url = publicPassportUrl(publicId)
  const [svg, setSvg] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let active = true
    QRCode.toString(url, { ...QR_OPTIONS, type: 'svg' }).then((markup) => {
      if (active) setSvg(markup)
    })
    return () => {
      active = false
    }
  }, [url])

  async function download() {
    const dataUrl = await QRCode.toDataURL(url, { ...QR_OPTIONS, width: 1024 })
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = `moto-passaporte-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-qrcode.png`
    link.click()
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
      <span className="sr-only" aria-live="polite">{copied ? 'Link copiado para a área de transferência.' : ''}</span>
    </section>
  )
}
