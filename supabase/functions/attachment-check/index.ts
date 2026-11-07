// Conferência do conteúdo de um arquivo enviado (KI-018, ADR-033). Chamada pelo site logo depois
// do envio ao Storage e antes do registro. Confere a assinatura dos primeiros bytes contra o tipo
// declarado; se não bater, apaga o arquivo. O banco só aceita registrar arquivo conferido.
import { CORS, reply, serverClient, userClient } from '../_shared/mercadopago.ts'

const BUCKET = 'attachments'
const EXT: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' }

function matches(mime: string, b: Uint8Array): boolean {
  const at = (i: number, ...v: number[]) => v.every((x, k) => b[i + k] === x)
  switch (mime) {
    case 'image/jpeg':
      return at(0, 0xff, 0xd8, 0xff)
    case 'image/png':
      return at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
    case 'image/webp':
      return at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)
    case 'application/pdf':
      return at(0, 0x25, 0x50, 0x44, 0x46, 0x2d)
    default:
      return false
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return reply(405, { ok: false, message: 'Método não permitido.' })

  const authHeader = req.headers.get('Authorization') ?? ''
  const { data: auth } = await userClient(authHeader).auth.getUser(authHeader.replace(/^Bearer\s+/i, ''))
  const user = auth?.user
  if (!user) return reply(401, { ok: false, message: 'Entre na sua conta.' })

  let path = ''
  try {
    path = String(((await req.json()) as { path?: unknown }).path ?? '')
  } catch {
    return reply(400, { ok: false, message: 'Pedido inválido.' })
  }
  const m = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/.exec(path)
  if (!m) return reply(400, { ok: false, message: 'Arquivo inválido.' })

  const server = serverClient()
  const { data: info } = await server.rpc('attachment_object_info', { p_path: path })
  const obj = info as { owner: string | null; mime: string | null; registered: boolean } | null
  if (!obj || obj.owner !== user.id) return reply(404, { ok: false, message: 'Arquivo não encontrado.' })
  if (obj.registered) return reply(409, { ok: false, message: 'Arquivo já registrado.' })

  const declared = obj.mime ?? ''
  let ok = EXT[m[1]] === declared
  if (ok) {
    const { data: blob, error } = await server.storage.from(BUCKET).download(path)
    if (error || !blob) return reply(502, { ok: false, message: 'Não foi possível conferir o arquivo. Tente de novo.' })
    ok = matches(declared, new Uint8Array(await blob.slice(0, 16).arrayBuffer()))
  }
  await server.rpc('record_attachment_check', { p_path: path, p_user: user.id, p_mime: declared, p_ok: ok })
  if (!ok) {
    await server.storage.from(BUCKET).remove([path])
    return reply(422, { ok: false, message: 'O conteúdo do arquivo não corresponde ao tipo informado. Envie uma foto (JPG, PNG, WebP) ou um PDF.' })
  }
  return reply(200, { ok: true })
})
