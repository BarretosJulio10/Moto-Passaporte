// Rotinas agendadas pelo pg_cron (ADR-029): conciliação com o Mercado Pago e limpeza de arquivos
// sem vínculo. Sem login de usuário: autenticada pelo segredo do Vault no cabeçalho x-job-secret.
// Resultado vai para job_runs, sem dados pessoais nem segredos.
import { CORS, MpError, accessToken, reply, serverClient, syncPass, syncPreapproval } from '../_shared/mercadopago.ts'

const BUCKET = 'attachments'
type Server = ReturnType<typeof serverClient>
type Outcome = { status: 'ok' | 'failed' | 'skipped'; detail: string }

async function reconcile(server: Server): Promise<Outcome> {
  const { data: settings } = await server.from('system_settings').select('value').eq('key', 'billing_enabled').maybeSingle()
  let token: string
  try {
    token = await accessToken(server)
  } catch (e) {
    if (e instanceof MpError) return { status: 'skipped', detail: 'Mercado Pago não configurado.' }
    throw e
  }
  const { data: targets, error } = await server.rpc('billing_reconcile_targets', { p_limit: 200 })
  if (error) throw new Error(`Falha ao listar assinaturas: ${error.message}`)
  const list = (targets ?? []) as { id: string; provider_subscription_id: string }[]
  // Pagamentos avulsos (Pix/boleto) ainda pendentes: o aviso pode ter se perdido (ADR-039).
  const { data: passTargets } = await server.rpc('billing_pass_targets', { p_user: null, p_limit: 100 })
  const passes = (passTargets ?? []) as { id: string }[]
  const failures: string[] = []
  let passOk = 0
  for (const t of passes) {
    try {
      await syncPass(server, token, t.id)
      passOk++
    } catch (e) {
      failures.push(`pix ${t.id.slice(0, 8)}: ${e instanceof Error ? e.message.slice(0, 120) : 'erro'}`)
    }
  }
  const passNote = passes.length ? ` ${passOk} de ${passes.length} pagamento(s) avulso(s).` : ''
  if (list.length === 0) {
    return {
      status: failures.length ? 'failed' : 'ok',
      detail: `Nenhuma assinatura para conferir${settings?.value === true ? '' : ' (contratação desligada)'}.${passNote}` + (failures.length ? ` Falhas: ${failures.slice(0, 5).join('; ')}` : ''),
    }
  }
  let ok = 0
  for (const t of list) {
    try {
      await syncPreapproval(server, token, t.provider_subscription_id)
      ok++
    } catch (e) {
      failures.push(`${t.id.slice(0, 8)}: ${e instanceof Error ? e.message.slice(0, 120) : 'erro'}`)
    }
  }
  const detail = `${ok} de ${list.length} assinatura(s) conferida(s).${passNote}` + (failures.length ? ` Falhas: ${failures.slice(0, 5).join('; ')}` : '')
  return { status: failures.length ? 'failed' : 'ok', detail }
}

async function storageCleanup(server: Server): Promise<Outcome> {
  const { data: plan, error } = await server.rpc('system_plan_storage_cleanup', { p_limit: 500 })
  if (error) throw new Error(`Falha ao planejar: ${error.message}`)
  const { cleanup_id: id, paths, busy } = plan as { cleanup_id: string | null; paths: string[]; busy?: boolean }
  if (busy) return { status: 'skipped', detail: 'Outra limpeza em andamento.' }
  if (!id || paths.length === 0) return { status: 'ok', detail: 'Nada para limpar.' }
  const deleted: string[] = []
  let failed = 0
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100)
    const { data, error: rmError } = await server.storage.from(BUCKET).remove(chunk)
    if (rmError) {
      failed += chunk.length
      continue
    }
    const removed = new Set((data ?? []).map((o) => o.name))
    for (const p of chunk) {
      if (removed.has(p)) deleted.push(p)
      else failed++
    }
  }
  const { data: fin, error: finError } = await server.rpc('storage_cleanup_finish', { p_cleanup_id: id, p_deleted: deleted, p_failed: failed })
  if (finError) throw new Error(`Falha ao registrar: ${finError.message}`)
  const r = fin as { deleted_files: number; deleted_bytes: number }
  return { status: failed ? 'failed' : 'ok', detail: `${r.deleted_files} arquivo(s) apagado(s), ${r.deleted_bytes} bytes.${failed ? ` ${failed} falharam.` : ''}` }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
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
  if (job !== 'reconcile' && job !== 'storage_cleanup') return reply(400, { ok: false })

  const { data: runId } = await server.rpc('job_run_start', { p_job: job, p_trigger: 'schedule' })
  if (runId == null) return reply(200, { ok: true, skipped: 'em andamento' })

  let out: Outcome
  try {
    out = job === 'reconcile' ? await reconcile(server) : await storageCleanup(server)
  } catch (e) {
    out = { status: 'failed', detail: e instanceof Error ? e.message.slice(0, 500) : 'Erro inesperado.' }
  }
  await server.rpc('job_run_finish', { p_id: runId, p_status: out.status, p_detail: out.detail })
  return reply(200, { ok: out.status !== 'failed', ...out })
})
