// Envio de avisos por e-mail (Resend) e WhatsApp (FZAP) — ADR-064.
// Nunca registrar chaves, endereços completos ou o texto das mensagens em logs.

export type MessagingConfig = {
  email_enabled: boolean
  email_from: string
  link_base: string
  resend_key: string | null
  whatsapp_enabled: boolean
  fzap_url: string | null
  fzap_token: string | null
}

export type SendResult = { ok: boolean; id?: string; error?: string }

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Link absoluto para o site (o aviso guarda só o caminho, ex.: /painel/plano). */
export function absoluteLink(base: string, link: string | null): string {
  const path = link && link.startsWith('/') ? link : '/painel/notificacoes'
  return `${base.replace(/\/+$/, '')}${path}`
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split('@')
  if (!user || !domain) return '***'
  return `${user.slice(0, 2)}***@${domain}`
}

export function maskPhone(phone: string): string {
  return phone.length > 6 ? `${phone.slice(0, 4)}****${phone.slice(-4)}` : '****'
}

/** E-mail simples, legível em qualquer cliente, com botão e link para parar de receber. */
export function renderEmail(p: {
  title: string; body: string; url: string; unsubscribeUrl: string | null; name?: string | null
}): { html: string; text: string } {
  const first = (p.name ?? '').trim().split(/\s+/)[0]
  const hello = first ? `Olá, ${first}!` : 'Olá!'
  const paragraphs = p.body.split(/\n+/).filter(Boolean)
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:0;background:#f4f1ea;font-family:Arial,Helvetica,sans-serif;color:#1c1b19">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e3ddd0;border-radius:10px">
<tr><td style="padding:20px 28px;border-bottom:1px solid #e3ddd0;font-weight:bold;font-size:16px">Moto Passaporte</td></tr>
<tr><td style="padding:28px">
<p style="margin:0 0 12px;font-size:15px">${esc(hello)}</p>
<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3">${esc(p.title)}</h1>
${paragraphs.map((t) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#3d3a35">${esc(t)}</p>`).join('\n')}
<p style="margin:22px 0 6px"><a href="${esc(p.url)}" style="display:inline-block;background:#1c1b19;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">Abrir no Moto Passaporte</a></p>
<p style="margin:10px 0 0;font-size:12px;color:#7a756b">Se o botão não abrir, copie: ${esc(p.url)}</p>
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #e3ddd0;font-size:12px;color:#7a756b;line-height:1.5">
Você recebe este e-mail porque tem uma conta no Moto Passaporte.${p.unsubscribeUrl ? ` <a href="${esc(p.unsubscribeUrl)}" style="color:#7a756b">Parar de receber avisos por e-mail</a>.` : ''}<br>
Nunca pedimos senha, código ou dados de cartão por e-mail.
</td></tr></table></td></tr></table></body></html>`
  const text = [hello, '', p.title, '', ...paragraphs, '', `Abrir: ${p.url}`, '',
    p.unsubscribeUrl ? `Parar de receber avisos por e-mail: ${p.unsubscribeUrl}` : '', 'Moto Passaporte'].join('\n')
  return { html, text }
}

/** Texto do WhatsApp: curto, com o link no fim. */
export function renderWhatsapp(p: { title: string; body: string; url: string; name?: string | null }): string {
  const first = (p.name ?? '').trim().split(/\s+/)[0]
  return [`*Moto Passaporte*`, first ? `Olá, ${first}!` : null, '', `*${p.title}*`, p.body, '', p.url, '',
    '_Para não receber mais por aqui, desligue em Notificações no site._'].filter((l) => l !== null).join('\n')
}

export async function sendResend(cfg: MessagingConfig, m: {
  to: string; subject: string; html: string; text: string; unsubscribeUrl: string | null; idempotencyKey?: string
}): Promise<SendResult> {
  if (!cfg.resend_key) return { ok: false, error: 'Chave do Resend não configurada' }
  const headers: Record<string, string> = { Authorization: `Bearer ${cfg.resend_key}`, 'Content-Type': 'application/json' }
  if (m.idempotencyKey) headers['Idempotency-Key'] = m.idempotencyKey
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        from: cfg.email_from, to: [m.to], subject: m.subject.slice(0, 150), html: m.html, text: m.text,
        ...(m.unsubscribeUrl ? { headers: { 'List-Unsubscribe': `<${m.unsubscribeUrl}>` } } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    })
    const body = (await res.json().catch(() => null)) as { id?: string; message?: string } | null
    if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${(body?.message ?? '').slice(0, 200)}` }
    return { ok: true, id: body?.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : 'falha de rede' }
  }
}

/** Chamada à FZAP com o token da instância (cabeçalho `token`). */
export async function fzap<T = unknown>(cfg: MessagingConfig, path: string, init: { method?: string; body?: unknown } = {}): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  if (!cfg.fzap_url || !cfg.fzap_token) return { ok: false, status: 0, data: null, error: 'FZAP não configurada' }
  try {
    const res = await fetch(`${cfg.fzap_url}${path}`, {
      method: init.method ?? 'GET',
      headers: { token: cfg.fzap_token, 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(20_000),
    })
    const json = (await res.json().catch(() => null)) as { success?: boolean; data?: T; error?: string; message?: string } | null
    if (!res.ok || json?.success === false) {
      return { ok: false, status: res.status, data: null, error: `FZAP ${res.status}: ${String(json?.error ?? json?.message ?? '').slice(0, 200)}` }
    }
    return { ok: true, status: res.status, data: (json?.data ?? null) as T | null }
  } catch (e) {
    return { ok: false, status: 0, data: null, error: e instanceof Error ? e.message.slice(0, 200) : 'falha de rede' }
  }
}

export async function sendWhatsapp(cfg: MessagingConfig, phone: string, body: string): Promise<SendResult> {
  const r = await fzap<{ Id?: string; id?: string }>(cfg, '/chat/send/text', { method: 'POST', body: { phone, body, delay: 1200, linkPreview: false } })
  return r.ok ? { ok: true, id: r.data?.Id ?? r.data?.id } : { ok: false, error: r.error }
}
