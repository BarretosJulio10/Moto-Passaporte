// Ações de assinatura do usuário e conciliação do admin (PRD 8.2, 8.3; ADR-020).
// O estado só muda a partir do que o Mercado Pago confirma.
import {
  CORS, MpError, accessToken, mp, reply, serverClient, syncPreapproval, userClient,
} from '../_shared/mercadopago.ts'

const MONTHS: Record<string, number> = { monthly: 1, semiannual: 6, annual: 12 }

function backUrl(req: Request): string | null {
  const origin = req.headers.get('Origin') ?? ''
  if (/^https:\/\/[a-z0-9.-]+$/i.test(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin)) {
    return `${origin}/painel/plano?assinatura=retorno`
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return reply(405, { message: 'Método não permitido.' })

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  const asUser = userClient(authHeader)
  const { data: auth } = await asUser.auth.getUser(jwt)
  const user = auth?.user
  if (!user) return reply(401, { message: 'Entre na sua conta.' })

  let body: { action?: string; plan_code?: string } = {}
  try {
    body = await req.json()
  } catch {
    return reply(400, { message: 'Pedido inválido.' })
  }
  const server = serverClient()

  try {
    if (body.action === 'subscribe') {
      if (!body.plan_code || !/^[a-z0-9_]{2,40}$/.test(body.plan_code)) return reply(400, { message: 'Plano inválido.' })
      const back = backUrl(req)
      if (!back) return reply(400, { message: 'Origem do pedido não reconhecida.' })
      const { data: prep, error } = await server.rpc('billing_prepare_subscription', { p_user: user.id, p_plan_code: body.plan_code })
      if (error) return reply(409, { message: error.message })
      const p = prep as {
        subscription_id: string; payer_email: string; plan_name: string; billing_period: string
        price_cents: number; currency: string; trial_days: number; expired_provider_ids: string[]
        first_charge_at: string | null
      }
      const token = await accessToken(server)
      for (const old of p.expired_provider_ids ?? []) {
        await mp(token, `/preapproval/${encodeURIComponent(old)}`, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) }).catch(() => null)
      }
      const autoRecurring: Record<string, unknown> = {
        frequency: MONTHS[p.billing_period] ?? 1,
        frequency_type: 'months',
        transaction_amount: p.price_cents / 100,
        currency_id: p.currency,
      }
      // Bônus Premium em vigor: a primeira cobrança só no dia em que ele termina (ADR-037).
      if (p.first_charge_at) autoRecurring.start_date = new Date(p.first_charge_at).toISOString()
      else if (p.trial_days > 0) autoRecurring.free_trial = { frequency: p.trial_days, frequency_type: 'days' }
      try {
        const pre = await mp<{ id: string; init_point: string }>(token, '/preapproval', {
          method: 'POST',
          headers: { 'X-Idempotency-Key': p.subscription_id },
          body: JSON.stringify({
            reason: `Moto Passaporte — ${p.plan_name}`,
            external_reference: p.subscription_id,
            payer_email: p.payer_email,
            auto_recurring: autoRecurring,
            back_url: back,
            status: 'pending',
          }),
        })
        await server.rpc('billing_attach_checkout', {
          p_subscription_id: p.subscription_id, p_provider_subscription_id: pre.id, p_checkout_url: pre.init_point,
        })
        return reply(200, { checkout_url: pre.init_point })
      } catch (e) {
        const msg = e instanceof MpError ? e.message : 'falha de comunicação'
        await server.rpc('billing_fail_checkout', { p_subscription_id: p.subscription_id, p_reason: `Mercado Pago: ${msg}` })
        return reply(502, { message: 'O Mercado Pago não aceitou a assinatura agora. Tente de novo em alguns minutos.' })
      }
    }

    if (body.action === 'sync' || body.action === 'cancel') {
      const { data: sub } = await server.rpc('billing_user_subscription', { p_user: user.id })
      const s = sub as { id: string | null; provider_subscription_id: string | null; status: string } | null
      if (!s?.id || !s.provider_subscription_id) return reply(404, { message: 'Nenhuma assinatura encontrada.' })
      const token = await accessToken(server)
      if (body.action === 'cancel') {
        if (!['pending', 'active', 'past_due', 'paused'].includes(s.status)) return reply(409, { message: 'Esta assinatura já está cancelada.' })
        await mp(token, `/preapproval/${encodeURIComponent(s.provider_subscription_id)}`, {
          method: 'PUT', body: JSON.stringify({ status: 'cancelled' }),
        })
        await server.rpc('billing_cancel_local', { p_subscription_id: s.id, p_reason: 'Cancelada pelo usuário' })
      }
      const r = await syncPreapproval(server, token, s.provider_subscription_id)
      return reply(200, { ok: true, detail: r.detail })
    }

    if (body.action === 'reconcile') {
      const { data: isAdmin } = await asUser.rpc('is_admin')
      if (isAdmin !== true) return reply(403, { message: 'Operação não permitida.' })
      const token = await accessToken(server)
      const { data: targets } = await server.rpc('billing_reconcile_targets', { p_limit: 100 })
      let ok = 0
      const failures: string[] = []
      for (const t of (targets ?? []) as { id: string; provider_subscription_id: string }[]) {
        try {
          await syncPreapproval(server, token, t.provider_subscription_id)
          ok++
        } catch (e) {
          failures.push(`${t.id.slice(0, 8)}: ${e instanceof Error ? e.message : 'erro'}`)
        }
      }
      return reply(200, { ok: failures.length === 0, checked: ok + failures.length, synced: ok, failures: failures.slice(0, 10) })
    }

    return reply(400, { message: 'Ação desconhecida.' })
  } catch (e) {
    if (e instanceof MpError) return reply(e.status >= 500 ? 502 : 409, { message: e.message })
    return reply(500, { message: 'Erro inesperado. Tente de novo.' })
  }
})
