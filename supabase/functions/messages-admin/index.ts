// Painel do admin para os avisos (ADR-064): teste de e-mail e conexão do WhatsApp pela FZAP (QR Code).
// Só administradores. As chaves ficam no Vault e nunca voltam para o navegador.
import { CORS, reply, serverClient, userClient } from '../_shared/mercadopago.ts'
import { fzap, maskPhone, renderEmail, renderWhatsapp, sendResend, sendWhatsapp, type MessagingConfig } from '../_shared/messaging.ts'

function readClaims(jwt: string): { sub?: string; role?: string; exp?: number } | null {
  try {
    const part = jwt.split('.')[1] ?? ''
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))))
  } catch {
    return null
  }
}

type Session = { connected?: boolean; loggedIn?: boolean; jid?: string; name?: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return reply(405, { message: 'Método não permitido.' })

  const authHeader = req.headers.get('Authorization') ?? ''
  const claims = readClaims(authHeader.replace(/^Bearer\s+/i, ''))
  if (!claims?.sub || claims.role !== 'authenticated' || (claims.exp ?? 0) < Math.floor(Date.now() / 1000)) {
    return reply(401, { message: 'Entre na sua conta.' })
  }
  const { data: isAdmin } = await userClient(authHeader).rpc('is_admin')
  if (isAdmin !== true) return reply(403, { message: 'Operação não permitida.' })

  let body: { action?: string; phone?: string; admin_token?: string } = {}
  try {
    body = await req.json()
  } catch {
    return reply(400, { message: 'Pedido inválido.' })
  }
  const server = serverClient()
  const { data: cfgData, error } = await server.rpc('messaging_config')
  if (error || !cfgData) return reply(500, { message: 'Configuração indisponível.' })
  const cfg = cfgData as MessagingConfig

  switch (body.action) {
    case 'test_email': {
      const { data: found } = await server.auth.admin.getUserById(claims.sub)
      const to = found?.user?.email
      if (!to) return reply(400, { message: 'Sua conta não tem e-mail.' })
      if (!cfg.resend_key) return reply(400, { message: 'Salve a chave do Resend primeiro.' })
      const url = `${cfg.link_base}/painel/notificacoes`
      const { html, text } = renderEmail({
        title: 'Teste de envio do Moto Passaporte',
        body: 'Se você está lendo isto, os avisos por e-mail estão funcionando.\nOs usuários recebem por aqui o fim do Premium, o limite de motos e as falhas de cobrança.',
        url, unsubscribeUrl: null, name: found?.user?.user_metadata?.full_name as string | undefined,
      })
      const r = await sendResend(cfg, { to, subject: 'Teste de envio do Moto Passaporte', html, text, unsubscribeUrl: null })
      return r.ok ? reply(200, { ok: true, detail: `Enviado para ${to}.` }) : reply(502, { message: r.error ?? 'O Resend recusou o envio.' })
    }
    // Cria a instância na FZAP com o token de administrador (usado só agora, nunca guardado),
    // grava apenas o token da instância no cofre e já inicia a conexão para o QR Code.
    case 'wa_create_instance': {
      const adminToken = String(body.admin_token ?? '').trim()
      if (!cfg.fzap_url) return reply(400, { message: 'Salve o endereço da FZAP primeiro.' })
      if (adminToken.length < 6 || adminToken.length > 300) return reply(400, { message: 'Informe o token de administrador da FZAP.' })
      const bytes = crypto.getRandomValues(new Uint8Array(24))
      const token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
      const name = `motopassaporte-avisos-${token.slice(0, 4)}`
      let created: { id?: string } | null = null
      try {
        const res = await fetch(`${cfg.fzap_url}/admin/users`, {
          method: 'POST',
          headers: { Authorization: adminToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, token, expiration: 0 }),
          signal: AbortSignal.timeout(20_000),
        })
        const json = (await res.json().catch(() => null)) as { success?: boolean; data?: { id?: string }; error?: string } | null
        if (res.status === 401 || res.status === 403) return reply(400, { message: 'A FZAP recusou o token de administrador. Confira e tente de novo.' })
        if (!res.ok || json?.success === false) return reply(502, { message: `A FZAP não criou a instância (${res.status}${json?.error ? `: ${String(json.error).slice(0, 120)}` : ''}).` })
        created = json?.data ?? null
      } catch {
        return reply(502, { message: 'A FZAP não respondeu. Confira o endereço.' })
      }
      const { error: saveError } = await server.rpc('messaging_set_fzap_instance', { p_token: token, p_instance_id: created?.id ?? name, p_actor: claims.sub })
      if (saveError) return reply(500, { message: 'A instância foi criada, mas o token não foi salvo. Tente de novo.' })
      const next = { ...cfg, fzap_token: token }
      await fzap(next, '/session/connect', { method: 'POST', body: { immediate: true } })
      const s = await fzap<Session>(next, '/session/status')
      return reply(200, { ok: true, name, connected: Boolean(s.data?.connected), loggedIn: Boolean(s.data?.loggedIn) })
    }
    case 'wa_status': {
      const r = await fzap<Session>(cfg, '/session/status')
      if (!r.ok) return reply(502, { message: r.error ?? 'FZAP não respondeu.' })
      return reply(200, { connected: Boolean(r.data?.connected), loggedIn: Boolean(r.data?.loggedIn), number: r.data?.jid ? maskPhone(r.data.jid.split('@')[0]!.split(':')[0]!) : null })
    }
    case 'wa_connect': {
      const r = await fzap<Session>(cfg, '/session/connect', { method: 'POST', body: { immediate: true } })
      // Já conectada também responde erro em algumas versões; o status diz a verdade.
      const s = await fzap<Session>(cfg, '/session/status')
      if (!s.ok) return reply(502, { message: r.error ?? s.error ?? 'FZAP não respondeu.' })
      return reply(200, { connected: Boolean(s.data?.connected), loggedIn: Boolean(s.data?.loggedIn) })
    }
    case 'wa_qr': {
      // A FZAP devolve "qrCode"; a documentação antiga mostra "QRCode". Aceita os dois.
      const r = await fzap<{ qrCode?: string; QRCode?: string }>(cfg, '/session/qr')
      if (!r.ok) return reply(502, { message: r.error ?? 'QR Code indisponível. Toque em Conectar de novo.' })
      const qr = r.data?.qrCode ?? r.data?.QRCode ?? ''
      return reply(200, { qr: qr.startsWith('data:image/') ? qr : '' })
    }
    case 'wa_logout': {
      const r = await fzap(cfg, '/session/logout', { method: 'POST' })
      return r.ok ? reply(200, { ok: true }) : reply(502, { message: r.error ?? 'FZAP não respondeu.' })
    }
    case 'test_whatsapp': {
      const phone = String(body.phone ?? '').replace(/\D/g, '')
      if (!/^[0-9]{10,13}$/.test(phone)) return reply(400, { message: 'Informe o celular com DDD.' })
      const to = phone.length <= 11 ? `55${phone}` : phone
      const text = renderWhatsapp({ title: 'Teste de envio', body: 'Se chegou, os avisos por WhatsApp estão funcionando.', url: `${cfg.link_base}/painel` })
      const r = await sendWhatsapp(cfg, to, text)
      return r.ok ? reply(200, { ok: true, detail: `Enviado para ${maskPhone(to)}.` }) : reply(502, { message: r.error ?? 'A FZAP recusou o envio.' })
    }
    default:
      return reply(400, { message: 'Ação desconhecida.' })
  }
})
