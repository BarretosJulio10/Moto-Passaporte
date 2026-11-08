// Service worker do Moto Passaporte (ADR-040).
// - Guarda só a "casca" do app (arquivos do site). Dados pessoais NUNCA vão para o cache:
//   tudo que vem do Supabase é buscado ao vivo, com login.
// - Sem internet: mostra /offline.html.
// - Recebe as notificações no celular (Web Push) e abre a tela certa ao tocar.
const VERSION = 'mp-v1'
const SHELL = `shell-${VERSION}`
const PRECACHE = ['/offline.html', '/icons/icon-192.png', '/icons/badge-96.png', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== SHELL) await caches.delete(key)
      await self.clients.claim()
    })(),
  )
})

// A página pede para ativar a versão nova (botão "Atualizar").
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // Supabase, Mercado Pago etc.: sempre direto, sem cache

  // Páginas: sempre da rede (versão mais nova); sem internet, a página de aviso.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/offline.html')))
    return
  }
  // Arquivos com hash no nome (/assets/...): nunca mudam; guarda depois do primeiro uso.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/fonts/')) {
    event.respondWith(
      caches.open(SHELL).then(async (cache) => {
        const hit = await cache.match(req)
        if (hit) return hit
        const res = await fetch(req)
        if (res.ok) {
          await cache.put(req, res.clone())
          // Limita o tamanho: versões antigas dos arquivos saem primeiro.
          const keys = await cache.keys()
          for (const k of keys.slice(0, Math.max(0, keys.length - 150))) await cache.delete(k)
        }
        return res
      }),
    )
  }
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Moto Passaporte', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Moto Passaporte'
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, {
        body: data.body || '',
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-96.png',
        tag: data.id || data.tag || undefined,
        data: { url: data.url || '/painel/notificacoes' },
        lang: 'pt-BR',
      })
      // Número no ícone do app (quando o aparelho permite).
      if ('setAppBadge' in self.navigator) {
        const list = await self.registration.getNotifications()
        self.navigator.setAppBadge(list.length).catch(() => {})
      }
      // Avisa as telas abertas para atualizar o sino.
      for (const c of await self.clients.matchAll({ type: 'window' })) c.postMessage({ type: 'push-received' })
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL((event.notification.data && event.notification.data.url) || '/painel/notificacoes', self.location.origin)
  if (target.origin !== self.location.origin) return
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const w of wins) {
        if ('focus' in w) {
          await w.focus()
          if ('navigate' in w) return w.navigate(target.href)
          return
        }
      }
      return self.clients.openWindow(target.href)
    })(),
  )
})

// O navegador trocou a inscrição (raro): a próxima abertura do app registra de novo.
self.addEventListener('pushsubscriptionchange', () => {})
