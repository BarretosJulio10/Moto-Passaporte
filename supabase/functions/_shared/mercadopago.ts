// Camada de integração com o Mercado Pago (PRD 8.1): isolada das regras de negócio,
// que ficam nas funções billing_* do banco. Nunca registrar o token em logs.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

const API = 'https://api.mercadopago.com'

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

export function serverClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
}

export function userClient(authHeader: string): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
}

export class MpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function accessToken(server: SupabaseClient): Promise<string> {
  const { data, error } = await server.rpc('payment_access_token')
  if (error || !data) throw new MpError(503, 'Pagamentos indisponíveis: token do Mercado Pago não configurado.')
  return data as string
}

export async function mp<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  })
  const text = await res.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }
  if (!res.ok) {
    const msg = (body as { message?: string } | null)?.message ?? `HTTP ${res.status}`
    throw new MpError(res.status, msg)
  }
  return body as T
}

type Preapproval = { id: string; status: string; external_reference?: string | null }
type AuthorizedPayment = {
  id: number | string
  preapproval_id?: string
  status?: string
  transaction_amount?: number
  date_created?: string
  debit_date?: string
  payment?: { id?: number; status?: string; status_detail?: string } | null
}

async function applyAuthorizedPayment(server: SupabaseClient, ap: AuthorizedPayment, externalRef: string | null) {
  const status = ap.payment?.status ?? ap.status ?? 'pending'
  const { data, error } = await server.rpc('billing_apply_payment', {
    p_provider_payment_id: `ap:${ap.id}`,
    p_provider_subscription_id: ap.preapproval_id ?? null,
    p_external_reference: externalRef,
    p_provider_status: status,
    p_amount_cents: Math.round((ap.transaction_amount ?? 0) * 100),
    p_paid_at: ap.debit_date ?? ap.date_created ?? null,
  })
  if (error) throw new Error(`apply_payment: ${error.message}`)
  return data as { result: string }
}

/** Consulta a assinatura e as cobranças no Mercado Pago e aplica no banco (idempotente). */
export async function syncPreapproval(server: SupabaseClient, token: string, preapprovalId: string) {
  const pre = await mp<Preapproval>(token, `/preapproval/${encodeURIComponent(preapprovalId)}`)
  const ext = pre.external_reference ?? null
  const { data: st, error } = await server.rpc('billing_apply_subscription_state', {
    p_provider_subscription_id: pre.id,
    p_external_reference: ext,
    p_provider_status: pre.status,
  })
  if (error) throw new Error(`apply_state: ${error.message}`)
  if ((st as { result: string }).result === 'ignored') return { result: 'ignored', detail: 'Assinatura sem vínculo local' }

  const search = await mp<{ results?: AuthorizedPayment[] }>(
    token,
    `/authorized_payments/search?preapproval_id=${encodeURIComponent(pre.id)}&limit=50`,
  )
  let payments = 0
  for (const ap of search.results ?? []) {
    await applyAuthorizedPayment(server, { ...ap, preapproval_id: ap.preapproval_id ?? pre.id }, ext)
    payments++
  }
  // Estado da assinatura de novo, depois dos pagamentos (ex.: autorizada + paga = ativa).
  await server.rpc('billing_apply_subscription_state', {
    p_provider_subscription_id: pre.id,
    p_external_reference: ext,
    p_provider_status: pre.status,
  })
  return { result: 'processed', detail: `assinatura ${pre.status}, ${payments} cobrança(s)` }
}

export async function syncAuthorizedPayment(server: SupabaseClient, token: string, id: string) {
  const ap = await mp<AuthorizedPayment>(token, `/authorized_payments/${encodeURIComponent(id)}`)
  if (!ap.preapproval_id) return { result: 'ignored', detail: 'Cobrança sem assinatura' }
  return await syncPreapproval(server, token, ap.preapproval_id)
}

export async function syncPayment(server: SupabaseClient, token: string, id: string) {
  const pay = await mp<{
    metadata?: { preapproval_id?: string }
    point_of_interaction?: { transaction_data?: { subscription_id?: string } }
  }>(token, `/v1/payments/${encodeURIComponent(id)}`)
  const pre = pay.metadata?.preapproval_id ?? pay.point_of_interaction?.transaction_data?.subscription_id
  if (!pre) return { result: 'ignored', detail: 'Pagamento sem assinatura (não é do Moto Passaporte ou ainda sem vínculo)' }
  return await syncPreapproval(server, token, pre)
}

/** Assinatura do aviso: HMAC-SHA256 de "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" (documentação do Mercado Pago). */
export async function validSignature(secret: string, signatureHeader: string, requestId: string, dataId: string): Promise<boolean> {
  const parts = Object.fromEntries(
    signatureHeader.split(',').map((p) => {
      const [k, ...v] = p.trim().split('=')
      return [k, v.join('=')]
    }),
  )
  const ts = parts['ts']
  const v1 = parts['v1']
  if (!ts || !v1) return false
  const id = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId
  let manifest = ''
  if (id) manifest += `id:${id};`
  if (requestId) manifest += `request-id:${requestId};`
  manifest += `ts:${ts};`
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest)))
  const hex = Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('')
  if (hex.length !== v1.length) return false
  let diff = 0
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ v1.charCodeAt(i)
  return diff === 0
}
