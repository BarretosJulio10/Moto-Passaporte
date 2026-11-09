// Modo toque da oficina (Fase C): vale para todas as telas da oficina e fica guardado no aparelho.
import { useEffect, useSyncExternalStore } from 'react'

const KEY = 'mp-esteira-toque'
const LAST_ORG = 'mp-last-org'
const listeners = new Set<() => void>()

function read(): boolean {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}
export function setTouchMode(on: boolean) {
  try { localStorage.setItem(KEY, on ? '1' : '0') } catch { /* sem armazenamento */ }
  listeners.forEach((l) => l())
}
export function useTouchMode(): [boolean, (v: boolean) => void] {
  const on = useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb) } }, read, () => false)
  useEffect(() => {
    if (!on) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setTouchMode(false) }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [on])
  return [on, setTouchMode]
}

/** Última oficina aberta: o app instalado (início em /painel) abre direto nela quando o modo toque está ligado. */
export function rememberWorkshop(orgId: string) {
  try { localStorage.setItem(LAST_ORG, orgId) } catch { /* sem armazenamento */ }
}
export function touchStartWorkshop(): string | null {
  try { return read() ? localStorage.getItem(LAST_ORG) : null } catch { return null }
}
