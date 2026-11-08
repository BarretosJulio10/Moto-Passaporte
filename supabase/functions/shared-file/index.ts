// Abre um comprovante pelo link de compartilhamento (KI-022, ADR-034). Sem login: quem tem o
// link é quem o titular escolheu. O banco decide se o arquivo pode sair (link vigente, opções,
// comprovante de serviço vigente da moto, limite por hora) e registra a abertura; aqui só se
// gera um link temporário de 60 segundos do Storage privado.
import { CORS, reply, serverClient } from '../_shared/mercadopago.ts'

const BUCKET = 'attachments'
const TOKEN = /^[0-9a-f]{48}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return reply(405, { ok: false, message: 'Método não permitido.' })

  let token = ''
  let attachmentId = ''
  try {
    const body = (await req.json()) as { token?: unknown; attachment_id?: unknown }
    token = String(body.token ?? '')
    attachmentId = String(body.attachment_id ?? '')
  } catch {
    return reply(400, { ok: false, message: 'Pedido inválido.' })
  }
  if (!TOKEN.test(token) || !UUID.test(attachmentId)) return reply(404, { ok: false, message: 'Comprovante indisponível.' })

  const server = serverClient()
  const { data, error } = await server.rpc('shared_attachment_for_download', { p_token: token, p_attachment_id: attachmentId })
  if (error) {
    if (error.code === 'P0001') return reply(429, { ok: false, message: 'Muitas aberturas por este link. Tente de novo mais tarde.' })
    return reply(500, { ok: false, message: 'Não foi possível abrir o comprovante agora.' })
  }
  const file = data as { path: string; file_name: string } | null
  if (!file) return reply(404, { ok: false, message: 'Comprovante indisponível. O link pode ter sido revogado ou vencido.' })

  const { data: signed, error: signError } = await server.storage.from(BUCKET).createSignedUrl(file.path, 60)
  if (signError || !signed) return reply(500, { ok: false, message: 'Não foi possível abrir o comprovante agora.' })
  return reply(200, { ok: true, url: signed.signedUrl, file_name: file.file_name })
})
