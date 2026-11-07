// Avisos do Mercado Pago (PRD 8.3; ADR-020). Público (sem login), protegido pela
// assinatura secreta. Nunca confia no conteúdo do aviso: consulta o recurso na API.
import {
  accessToken, serverClient, syncAuthorizedPayment, syncPayment, syncPreapproval, validSignature,
} from '../_shared/mercadopago.ts'

const ok = (status = 200, text = 'ok') => new Response(text, { status })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return ok(405, 'method not allowed')
  const url = new URL(req.url)
  let body: { type?: string; topic?: string; action?: string; data?: { id?: string | number } } = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const type = String(body.type ?? body.topic ?? url.searchParams.get('type') ?? url.searchParams.get('topic') ?? '')
  const dataId = String(url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? body.data?.id ?? '')
  const requestId = req.headers.get('x-request-id') ?? ''
  const signature = req.headers.get('x-signature') ?? ''

  const server = serverClient()
  const { data: secret } = await server.rpc('payment_webhook_secret')
  const valid = Boolean(secret) && Boolean(signature) && (await validSignature(secret as string, signature, requestId, dataId))

  const { data: eventId } = await server.rpc('billing_log_event', {
    p_event_type: type || null, p_action: body.action ?? null, p_resource_id: dataId || null,
    p_request_id: requestId || null, p_signature_valid: valid,
  })
  if (!valid) return ok(401, 'invalid signature')
  if (eventId == null) return ok(200, 'duplicate')
  if (!dataId) {
    await server.rpc('billing_finish_event', { p_event_id: eventId, p_result: 'ignored', p_detail: 'Aviso sem identificador' })
    return ok()
  }

  try {
    const token = await accessToken(server)
    let r: { result: string; detail: string }
    if (type === 'subscription_preapproval') r = await syncPreapproval(server, token, dataId)
    else if (type === 'subscription_authorized_payment') r = await syncAuthorizedPayment(server, token, dataId)
    else if (type === 'payment') r = await syncPayment(server, token, dataId)
    else r = { result: 'ignored', detail: `Tipo não tratado: ${type || 'vazio'}` }
    await server.rpc('billing_finish_event', { p_event_id: eventId, p_result: r.result, p_detail: r.detail })
    return ok()
  } catch (e) {
    const detail = e instanceof Error ? e.message : 'erro'
    await server.rpc('billing_finish_event', { p_event_id: eventId, p_result: 'error', p_detail: detail })
    // 500 faz o Mercado Pago tentar de novo; a conciliação cobre o que faltar.
    return ok(500, 'error')
  }
})
