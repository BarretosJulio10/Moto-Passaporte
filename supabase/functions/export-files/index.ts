// Exportação dos comprovantes do próprio usuário (PRD 2.4, LGPD art. 18 §5 e art. 19).
// Sempre grátis e independente do plano: o banco (export_my_attachments, como o usuário) decide
// quais arquivos são dele e limita a 5 pacotes por 24 h; aqui só se geram links temporários
// (1 hora) do Storage privado, de cada bucket.
import { CORS, reply, serverClient, userClient } from '../_shared/mercadopago.ts'

const BUCKETS = new Set(['attachments', 'expense-receipts'])
const LINK_SECONDS = 60 * 60

type FileRow = { bucket: string; path: string; file_name: string; motorcycle: string; date: string | null; title: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return reply(405, { ok: false, message: 'Método não permitido.' })

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  if (!jwt) return reply(401, { ok: false, message: 'Entre na sua conta.' })
  const asUser = userClient(authHeader)
  const { data: auth } = await asUser.auth.getUser(jwt)
  if (!auth?.user) return reply(401, { ok: false, message: 'Entre na sua conta.' })

  const { data, error } = await asUser.rpc('export_my_attachments')
  if (error) {
    if (error.code === 'P0001') return reply(429, { ok: false, message: error.message })
    return reply(500, { ok: false, message: 'Não foi possível preparar seus comprovantes agora.' })
  }
  const rows = ((data ?? []) as FileRow[]).filter((f) => BUCKETS.has(f.bucket) && f.path)

  const server = serverClient()
  const files: Array<FileRow & { url: string | null }> = []
  for (const bucket of BUCKETS) {
    const group = rows.filter((f) => f.bucket === bucket)
    if (group.length === 0) continue
    const { data: signed } = await server.storage.from(bucket).createSignedUrls(group.map((f) => f.path), LINK_SECONDS)
    const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]))
    for (const f of group) files.push({ ...f, url: byPath.get(f.path) ?? null })
  }
  files.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  return reply(200, { ok: true, expires_in: LINK_SECONDS, files })
})
