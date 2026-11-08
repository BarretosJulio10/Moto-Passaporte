import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/Button'
import { currentSubscription, enablePush, pushSupport, sendTestPush } from './push'

const KEY = 'mp-push-prompt-dismissed-at'

/** Convite no momento certo (depois da primeira moto) para receber avisos no celular (ADR-040). */
export function PushPrompt() {
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ios = pushSupport() === 'ios-needs-install'

  useEffect(() => {
    let dismissed = false
    try {
      dismissed = Date.now() - Number(localStorage.getItem(KEY) ?? 0) < 14 * 86_400_000
    } catch {
      dismissed = false
    }
    const s = pushSupport()
    if (dismissed || (s !== 'ok' && s !== 'ios-needs-install')) return
    if (s !== 'ok') return setShow(true)
    void currentSubscription().then((sub) => setShow(!sub)).catch(() => setShow(false))
  }, [])

  if (!show) return null
  const close = () => {
    try {
      localStorage.setItem(KEY, String(Date.now()))
    } catch {
      /* sem armazenamento */
    }
    setShow(false)
  }
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-doc border border-rule bg-sheet p-4 text-sm" role="region" aria-label="Avisos no celular">
      <p className="text-graphite">
        <span className="font-semibold text-ink">Quer ser avisado no celular?</span> Próxima revisão, pedidos de oficina, transferências e
        vencimento do Premium chegam como notificação, mesmo com o app fechado.
        {error && <span className="mt-1 block text-danger">{error}</span>}
      </p>
      <div className="flex gap-2">
        {ios ? (
          <Link to="/instalar" className="inline-flex items-center rounded-doc bg-ink px-3 py-1.5 font-semibold text-sheet">Instalar no iPhone</Link>
        ) : (
          <Button size="sm" loading={busy} onClick={async () => {
            setBusy(true)
            setError(null)
            try {
              await enablePush()
              await sendTestPush().catch(() => undefined)
              setShow(false)
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Não foi possível ativar agora.')
            } finally {
              setBusy(false)
            }
          }}>Ativar avisos</Button>
        )}
        <Button size="sm" variant="quiet" onClick={close}>Agora não</Button>
      </div>
    </div>
  )
}
