import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Outlet, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/core/auth/AuthProvider'
import { getSupabase } from '@/lib/supabase'
import { translateDbError } from '@/core/shared/dbErrors'
import { formatKm } from '@/core/shared/format'
import { fetchPistaContext, fetchPistaOrders, PISTA_STATUS_LABEL, PISTA_STATUS_TONE, vehicleLabel, type PistaOrderRow, type PistaShop } from './api'
import { fetchWorkshopByCode, normalizeCode, pistaEmail, rememberCode, rememberedCode, validCode, validNickname, normalizeNickname } from './accountsApi'
import { listOutbox, onOutboxChange, startOutbox, flush, type OutboxEntry } from './outbox'

/** App da Pista (ADR-057): PWA próprio em /pista, para o mecânico registrar rápido na moto. */

const ORG_KEY = 'pista-org'

export type PistaCtx = { shop: PistaShop; userId: string; outbox: OutboxEntry[]; online: boolean }
export const usePista = () => useOutletContext<PistaCtx>()

/** Guarda a última resposta no aparelho para abrir sem internet (só dados sem preço). */
export function cacheRead<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(`pista:${key}`)
    return raw ? (JSON.parse(raw) as T) : undefined
  } catch {
    return undefined
  }
}
export async function withCache<T>(key: string, fn: () => Promise<T>): Promise<T> {
  try {
    const data = await fn()
    try { localStorage.setItem(`pista:${key}`, JSON.stringify(data)) } catch { /* sem espaço: segue sem cache */ }
    return data
  } catch (err) {
    const cached = cacheRead<T>(key)
    if (cached !== undefined && typeof navigator !== 'undefined' && navigator.onLine === false) return cached
    throw err
  }
}

/** Troca o manifesto e o ícone para instalar o App da Pista (e não o painel). */
function usePistaManifest() {
  useEffect(() => {
    const set = (selector: string, attr: string, value: string) => {
      const el = document.querySelector(selector)
      const old = el?.getAttribute(attr) ?? null
      el?.setAttribute(attr, value)
      return () => { if (el && old !== null) el.setAttribute(attr, old) }
    }
    const undo = [
      set('link[rel="manifest"]', 'href', '/pista.webmanifest'),
      set('link[rel="apple-touch-icon"]', 'href', '/icons/pista-apple-touch.png'),
      set('meta[name="theme-color"]', 'content', '#D66C20'),
    ]
    let title = document.querySelector('meta[name="apple-mobile-web-app-title"]')
    const created = !title
    if (!title) {
      title = document.createElement('meta')
      title.setAttribute('name', 'apple-mobile-web-app-title')
      document.head.appendChild(title)
    }
    title.setAttribute('content', 'Pista')
    const prevTitle = document.title
    document.title = 'Pista – Moto Passaporte'
    return () => {
      undo.forEach((u) => u())
      if (created) title?.remove()
      document.title = prevTitle
    }
  }, [])
}

function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return online
}

export function PistaLayout() {
  usePistaManifest()
  const { user, loading } = useAuth()
  if (loading) return <PistaFrame><p className="p-6 text-muted" role="status">Carregando…</p></PistaFrame>
  if (!user) return <PistaFrame><PistaLogin /></PistaFrame>
  return <PistaGate userId={user.id} />
}

function PistaFrame({ children, header }: { children: ReactNode; header?: ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="sticky top-0 z-20 bg-[#1C2B4A] px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-sheet shadow">
        {header ?? <p className="text-lg font-bold">Pista <span className="font-normal text-sheet/70">· Moto Passaporte</span></p>}
      </header>
      <main className="mx-auto max-w-2xl pb-28">{children}</main>
    </div>
  )
}

function PistaLogin() {
  const params = useParams()
  const fromLink = normalizeCode(params.code ?? '')
  const [code, setCode] = useState(() => (validCode(fromLink) ? fromLink : rememberedCode()))
  const [mode, setMode] = useState<'nickname' | 'email'>('nickname')
  const [nickname, setNickname] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const shop = useQuery({
    queryKey: ['pista-code', code],
    queryFn: () => fetchWorkshopByCode(code),
    enabled: validCode(code),
    staleTime: 5 * 60_000,
  })
  useEffect(() => { if (validCode(fromLink)) setCode(fromLink) }, [fromLink])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (mode === 'nickname') {
      if (!validCode(code)) return setError('Digite o código da oficina (6 letras ou números).')
      if (shop.data === null) return setError('Código da oficina não encontrado.')
      if (!validNickname(normalizeNickname(nickname))) return setError('Digite o seu apelido.')
    }
    setBusy(true)
    const login = mode === 'nickname' ? pistaEmail(nickname, code) : email.trim()
    const { error: err } = await getSupabase().auth.signInWithPassword({ email: login, password })
    if (err) {
      setError(/banned/i.test(err.message) ? 'Seu acesso foi desligado pela oficina.'
        : /invalid/i.test(err.message) ? (mode === 'nickname' ? 'Apelido ou senha incorretos.' : 'E-mail ou senha incorretos.')
        : /rate|many/i.test(err.message) ? 'Muitas tentativas. Espere alguns minutos e tente de novo.'
        : 'Não foi possível entrar. Verifique a internet.')
    } else if (mode === 'nickname') {
      rememberCode(code)
    }
    setBusy(false)
  }

  const input = 'mt-1 h-14 w-full rounded-xl border border-rule bg-sheet px-4 text-lg'
  return (
    <form onSubmit={submit} className="space-y-4 p-5" noValidate>
      {mode === 'nickname' && shop.data?.name ? (
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-muted">Oficina</p>
          <h1 className="text-2xl font-bold">{shop.data.name}</h1>
        </div>
      ) : (
        <h1 className="text-2xl font-bold">Entrar na pista</h1>
      )}
      {mode === 'nickname' ? (
        <>
          <p className="text-graphite">Entre com o apelido e a senha que o responsável da oficina criou para você. Você fica conectado neste celular.</p>
          {!validCode(fromLink) && (
            <label className="block">
              <span className="text-sm font-semibold">Código da oficina</span>
              <input autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={6} value={code}
                onChange={(e) => setCode(normalizeCode(e.target.value))} className={`${input} font-mono tracking-widest`} />
              {validCode(code) && shop.data === null && <span className="mt-1 block text-sm text-danger">Código não encontrado.</span>}
            </label>
          )}
          <label className="block">
            <span className="text-sm font-semibold">Apelido</span>
            <input autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={nickname}
              onChange={(e) => setNickname(e.target.value)} className={input} />
          </label>
        </>
      ) : (
        <>
          <p className="text-graphite">Para o responsável ou quem entra com e-mail: use o mesmo e-mail e senha do painel.</p>
          <label className="block">
            <span className="text-sm font-semibold">E-mail</span>
            <input type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
          </label>
        </>
      )}
      <label className="block">
        <span className="text-sm font-semibold">Senha</span>
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
      </label>
      {error && <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 font-semibold text-danger">{error}</p>}
      <button type="submit" disabled={busy || !password || (mode === 'nickname' ? !nickname : !email)}
        className="h-14 w-full rounded-xl bg-[#D66C20] text-lg font-bold text-white disabled:opacity-60">
        {busy ? 'Entrando…' : 'Entrar'}
      </button>
      {mode === 'nickname' ? (
        <>
          <p className="text-center text-sm text-muted">Esqueceu a senha? Peça ao responsável da oficina para criar uma nova.</p>
          <button type="button" onClick={() => { setMode('email'); setError(null) }} className="block w-full text-center font-semibold underline underline-offset-4">
            Entrar com e-mail
          </button>
        </>
      ) : (
        <>
          <Link to="/recuperar-senha" className="block text-center font-semibold underline underline-offset-4">Esqueci a senha</Link>
          <button type="button" onClick={() => { setMode('nickname'); setError(null) }} className="block w-full text-center font-semibold underline underline-offset-4">
            Entrar com apelido
          </button>
        </>
      )}
    </form>
  )
}

function PistaGate({ userId }: { userId: string }) {
  const { signOut } = useAuth()
  const online = useOnline()
  const ctx = useQuery({
    queryKey: ['pista-context', userId],
    queryFn: () => withCache(`ctx:${userId}`, fetchPistaContext),
    initialData: () => cacheRead<PistaShop[]>(`ctx:${userId}`),
    staleTime: 60_000,
  })
  const [orgId, setOrgId] = useState<string | null>(() => localStorage.getItem(ORG_KEY))
  const [outbox, setOutbox] = useState<OutboxEntry[]>([])

  useEffect(() => startOutbox(userId), [userId])
  useEffect(() => {
    const load = () => { void listOutbox(userId).then(setOutbox) }
    load()
    return onOutboxChange(load)
  }, [userId])

  const shops = ctx.data ?? []
  const shop = shops.find((s) => s.organization_id === orgId) ?? (shops.length === 1 ? shops[0] : undefined)
  useEffect(() => { if (shop) localStorage.setItem(ORG_KEY, shop.organization_id) }, [shop])

  const pending = outbox.filter((e) => !e.failed).length
  const failed = outbox.filter((e) => e.failed).length
  const header = (
    <div className="flex items-center justify-between gap-3">
      <Link to="/pista" className="min-w-0">
        <p className="truncate text-lg font-bold leading-tight">{shop?.name ?? 'Pista'}</p>
        <p className="truncate text-xs text-sheet/70">{shop ? `${shop.user_name || 'Mecânico'}${shop.nickname ? ` · ${shop.nickname}` : ''}` : 'Moto Passaporte'}</p>
      </Link>
      <div className="flex shrink-0 items-center gap-2">
        <button type="button" onClick={() => void flush(userId)}
          className={`rounded-full px-3 py-1.5 text-xs font-bold ${failed ? 'bg-danger text-white' : pending ? 'bg-brass text-white' : 'bg-white/15 text-sheet'}`}
          aria-label="Situação do envio">
          {!online ? `Sem internet${pending ? ` · ${pending}` : ''}` : failed ? `${failed} com erro` : pending ? `Enviando ${pending}` : 'Tudo enviado'}
        </button>
        <details className="relative">
          <summary className="list-none rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold" aria-label="Menu">☰</summary>
          <div className="absolute right-0 mt-2 w-56 rounded-xl border border-rule bg-sheet p-2 text-ink shadow-lg">
            {shops.length > 1 && shops.map((s) => (
              <button key={s.organization_id} type="button" onClick={() => setOrgId(s.organization_id)}
                className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${s.organization_id === shop?.organization_id ? 'font-bold' : ''}`}>
                {s.name}
              </button>
            ))}
            {!shop?.pista_account && <Link to="/oficina" className="block rounded-lg px-3 py-2 text-sm">Abrir o painel completo</Link>}
            <button type="button" onClick={() => { localStorage.removeItem(ORG_KEY); void signOut() }}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-danger">
              Trocar mecânico (sair)
            </button>
          </div>
        </details>
      </div>
    </div>
  )

  if (ctx.isLoading) return <PistaFrame header={header}><p className="p-6 text-muted" role="status">Carregando…</p></PistaFrame>
  if (ctx.isError && !ctx.data) {
    return <PistaFrame header={header}><p className="m-4 rounded-xl bg-danger/10 p-4 text-danger">{translateDbError(ctx.error as { message?: string })}</p></PistaFrame>
  }
  if (shops.length === 0) {
    return (
      <PistaFrame header={header}>
        <div className="space-y-3 p-5">
          <h1 className="text-2xl font-bold">Sem acesso à pista</h1>
          <p className="text-graphite">Peça ao responsável da oficina para incluir você na equipe e ligar a permissão “Executar OS”.</p>
          <button type="button" onClick={() => void signOut()} className="h-12 rounded-xl border border-rule bg-sheet px-4 font-semibold">Sair</button>
        </div>
      </PistaFrame>
    )
  }
  if (!shop) {
    return (
      <PistaFrame header={header}>
        <div className="space-y-3 p-5">
          <h1 className="text-2xl font-bold">Qual oficina?</h1>
          {shops.map((s) => (
            <button key={s.organization_id} type="button" onClick={() => setOrgId(s.organization_id)}
              className="block h-16 w-full rounded-xl border border-rule bg-sheet px-4 text-left text-lg font-semibold">{s.name}</button>
          ))}
        </div>
      </PistaFrame>
    )
  }
  return (
    <PistaFrame header={header}>
      {failed > 0 && <FailedList outbox={outbox.filter((e) => e.failed)} />}
      <Outlet context={{ shop, userId, outbox, online } satisfies PistaCtx} />
    </PistaFrame>
  )
}

function FailedList({ outbox }: { outbox: OutboxEntry[] }) {
  const LABEL: Record<OutboxEntry['kind'], string> = {
    photo: 'Foto', audio: 'Áudio', note: 'Nota', item: 'Item', status: 'Situação', ready: 'Pronto', take: 'Pegar OS', inspection: 'Checklist',
  }
  return (
    <div className="m-3 rounded-xl border border-danger/40 bg-danger/5 p-3 text-sm" role="alert">
      <p className="font-bold text-danger">Não foi possível enviar</p>
      <ul className="mt-1 space-y-1">
        {outbox.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-2">
            <span>{LABEL[e.kind]}: {e.lastError}</span>
            <button type="button" className="shrink-0 font-semibold underline"
              onClick={() => { void import('./outbox').then((m) => m.removeEntry(e.id)) }}>Descartar</button>
          </li>
        ))}
      </ul>
    </div>
  )
}

type Tab = 'mine' | 'free' | 'all'

export function PistaHomePage() {
  const { shop, online } = usePista()
  const navigate = useNavigate()
  const org = shop.organization_id
  const orders = useQuery({
    queryKey: ['pista-orders', org],
    queryFn: () => withCache(`orders:${org}`, () => fetchPistaOrders(org)),
    initialData: () => cacheRead<PistaOrderRow[]>(`orders:${org}`),
    refetchInterval: online ? 60_000 : false,
  })
  const [tab, setTab] = useState<Tab>('mine')
  const [search, setSearch] = useState('')
  const all = orders.data ?? []
  const list = useMemo(() => {
    const q = search.replace(/[^0-9a-z]/gi, '').toUpperCase()
    return all
      .filter((o) => (tab === 'mine' ? o.mine : tab === 'free' ? !o.mechanic_user_id : true))
      .filter((o) => !q || (o.plate ?? '').replace(/[^0-9a-z]/gi, '').toUpperCase().includes(q) || String(o.number).includes(q))
  }, [all, tab, search])
  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: 'mine', label: `Minhas (${all.filter((o) => o.mine).length})`, show: true },
    { key: 'free', label: `Sem mecânico (${all.filter((o) => !o.mechanic_user_id).length})`, show: shop.allow_unassigned || shop.is_responsible },
    { key: 'all', label: 'Todas', show: shop.is_responsible },
  ]

  return (
    <div className="p-3">
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar placa ou nº da OS"
        autoCapitalize="characters" className="h-14 w-full rounded-xl border border-rule bg-sheet px-4 text-lg uppercase" aria-label="Buscar placa" />
      <div className="mt-3 flex gap-2 overflow-x-auto" role="tablist">
        {tabs.filter((t) => t.show).map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-full px-4 py-2.5 font-semibold ${tab === t.key ? 'bg-ink text-sheet' : 'border border-rule bg-sheet'}`}>{t.label}</button>
        ))}
      </div>
      {orders.isError && !orders.data && <p className="mt-4 rounded-xl bg-danger/10 p-4 text-danger">{translateDbError(orders.error as { message?: string })}</p>}
      {orders.isLoading && <p className="mt-6 text-muted" role="status">Carregando OS…</p>}
      {orders.data && list.length === 0 && (
        <p className="mt-8 text-center text-muted">{tab === 'mine' ? 'Nenhuma OS com você agora.' : 'Nada por aqui.'}</p>
      )}
      <ul className="mt-3 space-y-3">
        {list.map((o) => (
          <li key={o.id}>
            <button type="button" onClick={() => navigate(`/pista/os/${o.id}`)}
              className={`w-full rounded-2xl border bg-sheet p-4 text-left shadow-sm active:scale-[0.99] ${o.status === 'in_progress' && o.mine ? 'border-[#D66C20] border-2' : 'border-rule'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-2xl font-bold tracking-wider">{o.plate || `OS ${o.number}`}</p>
                  <p className="truncate text-graphite">{vehicleLabel(o)} · {o.customer_name}</p>
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${PISTA_STATUS_TONE[o.status]}`}>{PISTA_STATUS_LABEL[o.status]}</span>
              </div>
              <p className="mt-2 text-sm text-muted">
                OS {o.number} · {o.items_done}/{o.items_total} itens · {o.photos} fotos
                {o.km_in != null ? ` · ${formatKm(o.km_in)}` : ''}
                {o.due_date ? ` · prazo ${new Date(o.due_date + 'T12:00').toLocaleDateString('pt-BR')}` : ''}
                {!o.mechanic_user_id ? ' · sem mecânico' : !o.mine && o.mechanic_name ? ` · ${o.mechanic_name}` : ''}
              </p>
              {o.notes && <p className="mt-1 line-clamp-2 text-sm text-graphite">“{o.notes}”</p>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

