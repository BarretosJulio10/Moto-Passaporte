// Depois de uma publicação nova, uma aba antiga pode pedir um arquivo de página que não existe mais
// ("Failed to fetch dynamically imported module"). Nesse caso recarregamos a página uma vez para
// buscar a versão nova; a trava de 30 s evita recarregar em ciclo se o problema for outro (sem internet).
const KEY = 'mp-stale-reload-at'

export function isStaleChunkError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String((error as { message?: string } | null)?.message ?? error ?? '')
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(msg)
}

/** Recarrega uma vez (por 30 s). Devolve false se já recarregou há pouco. */
export function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0)
    if (Date.now() - last < 30_000) return false
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    /* sem sessionStorage: recarrega mesmo assim */
  }
  window.location.reload()
  return true
}

export function installStaleChunkReload() {
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadForNewVersion()) event.preventDefault()
  })
}
