// App instalável (PWA, ADR-040): service worker, aviso de versão nova e pedido de instalação.

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let waiting: ServiceWorker | null = null
let installEvent: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function onPwaChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export const updateReady = () => waiting !== null
export const canPromptInstall = () => installEvent !== null

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function isIOS(): boolean {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

/** Ativa a versão nova já baixada e recarrega. */
export function applyUpdate() {
  if (!waiting) return window.location.reload()
  waiting.postMessage('skip-waiting')
}

export async function promptInstall(): Promise<boolean> {
  if (!installEvent) return false
  await installEvent.prompt()
  const { outcome } = await installEvent.userChoice
  installEvent = null
  emit()
  return outcome === 'accepted'
}

export function registerServiceWorker() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    installEvent = e as InstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    installEvent = null
    emit()
  })
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return
  let reloading = false
  // Só recarrega quando uma versão nova assume (na primeira instalação não há o que recarregar).
  const hadController = Boolean(navigator.serviceWorker.controller)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return
    reloading = true
    window.location.reload()
  })
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        const track = (w: ServiceWorker | null) => {
          if (!w) return
          w.addEventListener('statechange', () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller) {
              waiting = w
              emit()
            }
          })
        }
        if (reg.waiting && navigator.serviceWorker.controller) {
          waiting = reg.waiting
          emit()
        }
        reg.addEventListener('updatefound', () => track(reg.installing))
        // Procura versão nova ao voltar para o app e a cada 30 min.
        const check = () => reg.update().catch(() => {})
        document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
        setInterval(check, 30 * 60_000)
      })
      .catch(() => {})
  })
}
