// Envio dos avisos por e-mail (Resend) e WhatsApp (FZAP) — ADR-064.
// Chamado pelo pg_cron a cada 2 min (só quando há pendentes). Autenticado pelo segredo do Vault (x-job-secret).
import { reply, serverClient } from '../_shared/mercadopago.ts'
import {
  absoluteLink, maskEmail, maskPhone, renderEmail, renderWhatsapp, sendResend, sendWhatsapp, type MessagingConfig,
} from '../_shared/messaging.ts'

type Server = ReturnType<typeof serverClient>
type Report = { notification_id: string | null; user_id: string | null; channel: 'email' | 'whatsapp'; kind: string; destination: string; status: 'sent' | 'failed' | 'skipped'; provider_id?: string | null; error?: string | null }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function sendEmails(server: Server, cfg: MessagingConfig, out: Report[]) {
  if (!cfg.email_enabled || !cfg.resend_key) return
  const { data, error } = await server.rpc('messages_claim_email', { p_limit: 50 })
  if (error) throw new Error(`fila de e-mail: ${error.message}`)
  for (const m of (data ?? []) as { notification_id: string; user_id: string; kind: string; title: string; body: string | null; link: string | null; email: string; full_name: string | null; unsub_token: string }[]) {
    const url = absoluteLink(cfg.link_base, m.link)
    const unsubscribeUrl = `${cfg.link_base}/avisos/sair?t=${m.unsub_token}`
    const { html, text } = renderEmail({ title: m.title, body: m.body ?? '', url, unsubscribeUrl, name: m.full_name })
    const r = await sendResend(cfg, { to: m.email, subject: m.title, html, text, unsubscribeUrl, idempotencyKey: `notification-${m.notification_id}` })
    out.push({ notification_id: m.notification_id, user_id: m.user_id, channel: 'email', kind: m.kind, destination: maskEmail(m.email),
      status: r.ok ? 'sent' : 'failed', provider_id: r.id ?? null, error: r.error ?? null })
  }
}

async function sendWhatsapps(server: Server, cfg: MessagingConfig, out: Report[]) {
  if (!cfg.whatsapp_enabled || !cfg.fzap_url || !cfg.fzap_token) return
  const { data, error } = await server.rpc('messages_claim_whatsapp', { p_limit: 20 })
  if (error) throw new Error(`fila de WhatsApp: ${error.message}`)
  let first = true
  for (const m of (data ?? []) as { notification_id: string; user_id: string; kind: string; title: string; body: string | null; link: string | null; phone: string; full_name: string | null; skip: boolean }[]) {
    if (m.skip) {
      out.push({ notification_id: m.notification_id, user_id: m.user_id, channel: 'whatsapp', kind: m.kind, destination: maskPhone(m.phone),
        status: 'skipped', error: 'Intervalo mínimo entre mensagens' })
      continue
    }
    // Espaça os envios para não parecer disparo em massa (o número pode ser bloqueado).
    if (!first) await sleep(2500)
    first = false
    const body = renderWhatsapp({ title: m.title, body: m.body ?? '', url: absoluteLink(cfg.link_base, m.link), name: m.full_name })
    const r = await sendWhatsapp(cfg, m.phone, body)
    out.push({ notification_id: m.notification_id, user_id: m.user_id, channel: 'whatsapp', kind: m.kind, destination: maskPhone(m.phone),
      status: r.ok ? 'sent' : 'failed', provider_id: r.id ?? null, error: r.error ?? null })
  }
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
  if (job !== 'send') return reply(400, { ok: false })

  const out: Report[] = []
  const problems: string[] = []
  try {
    const { data: cfg, error } = await server.rpc('messaging_config')
    if (error || !cfg) throw new Error('configuração indisponível')
    const c = cfg as MessagingConfig
    await sendEmails(server, c, out).catch((e) => problems.push(e instanceof Error ? e.message : 'e-mail'))
    await sendWhatsapps(server, c, out).catch((e) => problems.push(e instanceof Error ? e.message : 'whatsapp'))
  } catch (e) {
    problems.push(e instanceof Error ? e.message : 'erro')
  }
  if (out.length) await server.rpc('messages_report', { p_items: out })
  const count = (ch: string, st: string) => out.filter((o) => o.channel === ch && o.status === st).length
  if (problems.length) console.error('messages-send', problems.join('; ').slice(0, 300))
  return reply(200, {
    ok: problems.length === 0,
    email: { sent: count('email', 'sent'), failed: count('email', 'failed') },
    whatsapp: { sent: count('whatsapp', 'sent'), failed: count('whatsapp', 'failed'), skipped: count('whatsapp', 'skipped') },
  })
})
