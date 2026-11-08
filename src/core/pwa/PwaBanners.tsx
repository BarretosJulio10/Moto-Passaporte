import { useEffect, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/Button'
import { applyUpdate, canPromptInstall, isIOS, isStandalone, onPwaChange, promptInstall, updateReady } from './pwa'

function usePwa() {
  const update = useSyncExternalStore(onPwaChange, updateReady, () => false)
  const install = useSyncExternalStore(onPwaChange, canPromptInstall, () => false)
  return { update, install }
}

/** Versão nova publicada: um toque atualiza (ADR-040). */
export function UpdateBanner() {
  const { update } = usePwa()
  if (!update) return null
  return (
    <div role="status" className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-doc bg-ink px-4 py-3 text-sm text-sheet shadow-lg print:hidden"
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
      <span>Nova versão do Moto Passaporte disponível.</span>
      <button type="button" onClick={applyUpdate} className="rounded-doc bg-sheet px-3 py-1.5 font-semibold text-ink">Atualizar</button>
    </div>
  )
}

const DISMISS_KEY = 'mp-install-dismissed-at'
function dismissedRecently(): boolean {
  try {
    return Date.now() - Number(localStorage.getItem(DISMISS_KEY) ?? 0) < 30 * 86_400_000
  } catch {
    return false
  }
}

/** Convite para instalar o app (Android: botão; iPhone: passo a passo). Some por 30 dias ao fechar. */
export function InstallBanner() {
  const { install } = usePwa()
  const [hidden, setHidden] = useState(true)
  useEffect(() => setHidden(isStandalone() || dismissedRecently()), [])
  const ios = isIOS()
  if (hidden || (!install && !ios)) return null
  const close = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      /* sem armazenamento */
    }
    setHidden(true)
  }
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-doc border border-rule bg-sheet p-4 text-sm" role="region" aria-label="Instalar o app">
      <div className="flex items-center gap-3">
        <img src="/icons/icon-192.png" alt="" className="h-10 w-10 rounded-[10px]" />
        <p className="text-graphite">
          <span className="font-semibold text-ink">Instale o Moto Passaporte no celular.</span>{' '}
          {ios ? 'Abre como app e recebe os avisos no iPhone.' : 'Abre como app e recebe os avisos mesmo fechado.'}
        </p>
      </div>
      <div className="flex gap-2">
        {install ? (
          <Button size="sm" onClick={() => void promptInstall()}>Instalar</Button>
        ) : (
          <Link to="/instalar" className="inline-flex items-center rounded-doc bg-ink px-3 py-1.5 font-semibold text-sheet">Como instalar</Link>
        )}
        <Button size="sm" variant="quiet" onClick={close}>Agora não</Button>
      </div>
    </div>
  )
}
