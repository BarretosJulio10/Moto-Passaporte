// Envio das notificações no celular (Web Push, ADR-040). Chamado pelo banco (pg_net, logo após
// um aviso) e pelo pg_cron a cada 5 min. Autenticado pelo segredo do Vault (x-job-secret).
// O texto vai criptografado para cada aparelho; nada de dado pessoal nos logs.
import { reply, serverClient } from '../_shared/mercadopago.ts'
import { generateVapidKeys, sendPush, type VapidKeys } from '../_shared/webpush.ts'

type Server = ReturnType<typeof serverClient>
type Item = {
  notification_id: string
  kind: string
  title: string
  body: string | null
  link: string | null
  subscriptions: { id: string; endpoint: string; p256dh: string; auth: string }[]
}

const URGENT = new Set(['workshop_access_request', 'transfer_received', 'payment_failed'])

async function loadKeys(server: Server): Promise<{ keys: VapidKeys; subject: string }> {
  const { data, error } = await server.rpc('push_get_keys')
  if (error) throw new Error(`chaves: ${error.message}`)
  const k = data as { public_key: string | null; private_jwk: string | null; subject: string }
  if (k.public_key && k.private_jwk) return { keys: { publicKey: k.public_key, privateJwk: JSON.parse(k.private_jwk) }, subject: k.subject }
  // Primeira vez: gera e guarda (a privada só no Vault). Se outra chamada gravou antes, usa a dela.
  const fresh = await generateVapidKeys()
  const { data: stored, error: storeError } = await server.rpc('push_store_keys', {
    p_public_key: fresh.publicKey, p_private_jwk: JSON.stringify(fresh.privateJwk),
  })
  if (storeError) throw new Error(`gravar chaves: ${storeError.message}`)
  if (stored === true) return { keys: fresh, subject: k.subject }
  return await loadKeys(server)
}

async function deliver(server: Server): Promise<{ sent: number; devices: number; removed: number; failed: number }> {
  const { keys, subject } = await loadKeys(server)
  let sent = 0, devices = 0, removed = 0, failed = 0
  for (let round = 0; round < 10; round++) {
    const { data, error } = await server.rpc('push_claim_batch', { p_limit: 100 })
    if (error) throw new Error(`lote: ${error.message}`)
    const items = (data ?? []) as Item[]
    if (items.length === 0) break
    const ok: string[] = [], gone: string[] = [], bad: string[] = []
    const jobs: Promise<void>[] = []
    for (const it of items) {
      sent++
      const payload = {
        title: it.title,
        body: (it.body ?? '').slice(0, 180),
        url: it.link && it.link.startsWith('/') ? it.link : '/painel/notificacoes',
        tag: it.kind,
        id: it.notification_id,
      }
      for (const s of it.subscriptions) {
        devices++
        jobs.push(
          sendPush(s, payload, keys, subject, { urgency: URGENT.has(it.kind) ? 'high' : 'normal' })
            .then((r) => { (r.ok ? ok : r.gone ? gone : bad).push(s.id) })
            .catch(() => { bad.push(s.id) }),
        )
      }
    }
    await Promise.all(jobs)
    removed += gone.length
    failed += bad.length
    await server.rpc('push_report', { p_ok: ok, p_gone: gone, p_failed: bad })
    if (items.length < 100) break
  }
  return { sent, devices, removed, failed }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405, { ok: false })
  const server = serverClient()
  const { data: allowed } = await server.rpc('scheduled_job_secret_ok', { p_secret: req.headers.get('x-job-secret') ?? '' })
  if (allowed !== true) return reply(401, { ok: false })
  let job = ''
  try {
    job = String(((await req.json()) as { job?: unknown }).job ?? '')
  } catch {
    return reply(400, { ok: false })
  }
  try {
    if (job === 'setup') {
      await loadKeys(server)
      return reply(200, { ok: true })
    }
    if (job !== 'push') return reply(400, { ok: false })
    const r = await deliver(server)
    return reply(200, { ok: true, ...r })
  } catch (e) {
    console.error('push-send', e instanceof Error ? e.message.slice(0, 200) : 'erro')
    return reply(500, { ok: false })
  }
})
