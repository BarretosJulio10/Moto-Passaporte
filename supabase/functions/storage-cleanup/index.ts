// Limpeza de arquivos sem vínculo no Storage (PRD 7.6, ADR-026). Só administradores.
// O banco decide o que pode ser apagado (admin_plan_storage_cleanup: só arquivos sem
// registro e mais antigos que a retenção) e audita; aqui só se apaga pela API de Storage,
// porque o Supabase não permite apagar objetos direto pelo SQL.
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const BUCKET = 'attachments'

// Caminhos com prefixo "expense-receipts:" são comprovantes de despesa (ADR-052); o resto é do bucket de anexos.
const RECEIPTS_PREFIX = 'expense-receipts:'
async function removePlanned(
  // deno-lint-ignore no-explicit-any
  server: any,
  paths: string[],
): Promise<{ deleted: string[]; failed: number }> {
  const deleted: string[] = []
  let failed = 0
  const groups: Array<[string, string[]]> = [
    [BUCKET, paths.filter((p) => !p.startsWith(RECEIPTS_PREFIX))],
    ['expense-receipts', paths.filter((p) => p.startsWith(RECEIPTS_PREFIX))],
  ]
  for (const [bucket, list] of groups) {
    const prefix = bucket === BUCKET ? '' : RECEIPTS_PREFIX
    for (let i = 0; i < list.length; i += 100) {
      const chunk = list.slice(i, i + 100)
      const names = chunk.map((p) => p.slice(prefix.length))
      const { data, error } = await server.storage.from(bucket).remove(names)
      if (error) {
        failed += chunk.length
        continue
      }
      const removed = new Set(((data ?? []) as { name: string }[]).map((o) => o.name))
      for (const p of chunk) {
        if (removed.has(p.slice(prefix.length))) deleted.push(p)
        else failed += 1
      }
    }
  }
  return { deleted, failed }
}

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return reply(405, { ok: false, message: 'Método não permitido.' })

  let reason = ''
  try {
    const body = (await req.json()) as { reason?: unknown }
    reason = typeof body.reason === 'string' ? body.reason : ''
  } catch {
    return reply(400, { ok: false, message: 'Pedido inválido.' })
  }

  const url = Deno.env.get('SUPABASE_URL')!
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  })
  // Valida admin e motivo, registra o plano e a auditoria em nome do admin.
  const { data: plan, error: planError } = await asUser.rpc('admin_plan_storage_cleanup', { p_reason: reason })
  if (planError) {
    const status = planError.code === '42501' ? 403 : 400
    return reply(status, { ok: false, message: status === 403 ? 'Operação não permitida.' : planError.message })
  }
  const { cleanup_id: cleanupId, paths } = plan as { cleanup_id: string; paths: string[] }
  if (paths.length === 0) return reply(200, { ok: true, deleted_files: 0, deleted_bytes: 0, failed_files: 0 })

  const server = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { deleted, failed } = await removePlanned(server, paths)

  const { data: fin, error: finError } = await server.rpc('storage_cleanup_finish', {
    p_cleanup_id: cleanupId,
    p_deleted: deleted,
    p_failed: failed,
  })
  if (finError) return reply(500, { ok: false, message: 'Arquivos apagados, mas não foi possível registrar o resultado.' })
  const result = fin as { deleted_files: number; deleted_bytes: number }
  return reply(200, { ok: failed === 0, ...result, failed_files: failed })
})
