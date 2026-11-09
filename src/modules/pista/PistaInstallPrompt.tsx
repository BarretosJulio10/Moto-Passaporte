import { useEffect, useState, useSyncExternalStore } from 'react'
import { canPromptInstall, isIOS, isStandalone, onPwaChange, promptInstall } from '@/core/pwa/pwa'

const KEY = 'pista-install-later'

/**
 * Logo depois de entrar no App da Pista (fora do app instalado): pede para instalar no celular.
 * Android/Chrome: botão que abre a janela de instalação do próprio celular.
 * iPhone: passo a passo (a Apple não deixa o site abrir essa janela).
 * "Agora não" esconde até a próxima vez que o app for aberto.
 */
export function PistaInstallPrompt() {
  const can = useSyncExternalStore(onPwaChange, canPromptInstall, () => false)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ios = isIOS()

  useEffect(() => {
    let later = false
    try { later = sessionStorage.getItem(KEY) === '1' } catch { /* sem armazenamento */ }
    setOpen(!isStandalone() && !later)
  }, [])

  if (!open) return null
  const close = () => {
    try { sessionStorage.setItem(KEY, '1') } catch { /* sem armazenamento */ }
    setOpen(false)
  }
  async function install() {
    setBusy(true)
    const ok = await promptInstall()
    setBusy(false)
    if (ok) setOpen(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="pista-install-title">
      <div className="w-full max-w-md rounded-2xl bg-sheet p-5 text-ink shadow-xl" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-center gap-3">
          <img src="/icons/pista-192.png" alt="" className="h-14 w-14 rounded-2xl" />
          <div>
            <h2 id="pista-install-title" className="text-xl font-bold">Instale o App da Pista</h2>
            <p className="text-sm text-graphite">Abre direto na tela de início, mais rápido e funciona sem internet.</p>
          </div>
        </div>

        {can ? (
          <button type="button" onClick={() => void install()} disabled={busy}
            className="mt-5 h-14 w-full rounded-xl bg-[#D66C20] text-lg font-bold text-white disabled:opacity-60">
            {busy ? 'Abrindo…' : 'Instalar agora'}
          </button>
        ) : ios ? (
          <>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-graphite">
              <li>Abra este link no <strong>Safari</strong>.</li>
              <li>Toque em <strong>Compartilhar</strong> (o quadrado com a seta para cima).</li>
              <li>Escolha <strong>“Adicionar à Tela de Início”</strong> e toque em <strong>Adicionar</strong>.</li>
              <li>Abra pelo ícone e entre de novo com <strong>código da oficina, apelido e senha</strong>.</li>
            </ol>
            <p className="mt-3 rounded-lg bg-brass/15 p-3 text-sm text-ink">
              Importante no iPhone: sem instalar, fotos e áudios guardados sem internet podem ser apagados pelo Safari depois de alguns dias.
            </p>
          </>
        ) : (
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-graphite">
            <li>Toque no menu <strong>⋮</strong> do Chrome (canto de cima).</li>
            <li>Escolha <strong>“Instalar app”</strong> ou <strong>“Adicionar à tela inicial”</strong>.</li>
          </ol>
        )}

        <button type="button" onClick={close} className="mt-3 h-12 w-full rounded-xl border border-rule font-semibold">
          Agora não
        </button>
      </div>
    </div>
  )
}
