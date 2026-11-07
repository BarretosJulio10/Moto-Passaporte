// Testa a conexão com o Mercado Pago usando o token guardado no Vault (ADR-019).
// Só administradores. O token nunca sai do servidor nem aparece em logs.
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return reply(405, { ok: false, message: 'Método não permitido.' })

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const authHeader = req.headers.get('Authorization') ?? ''

  const asUser = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } })
  const { data: isAdmin, error: adminError } = await asUser.rpc('is_admin')
  if (adminError || isAdmin !== true) return reply(403, { ok: false, message: 'Operação não permitida.' })

  const server = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: token, error: tokenError } = await server.rpc('payment_access_token')
  if (tokenError) return reply(500, { ok: false, message: 'Não foi possível ler a configuração.' })
  if (!token) return reply(400, { ok: false, message: 'Cadastre o token de acesso antes de testar.' })

  let ok = false
  let message = ''
  let accountId: string | null = null
  let nickname: string | null = null
  let siteId: string | null = null
  try {
    const res = await fetch('https://api.mercadopago.com/users/me', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (res.status === 401 || res.status === 403) {
      message = 'O Mercado Pago recusou o token. Confira se copiou o token de acesso completo da conta certa.'
    } else if (!res.ok) {
      message = `O Mercado Pago respondeu com erro (${res.status}). Tente de novo em alguns minutos.`
    } else {
      const me = (await res.json()) as { id?: number; nickname?: string; site_id?: string }
      accountId = me.id != null ? String(me.id) : null
      nickname = me.nickname ?? null
      siteId = me.site_id ?? null
      ok = siteId === 'MLB'
      message = ok ? 'Conexão confirmada.' : `Conta conectada, mas não é do Brasil (${siteId ?? 'país desconhecido'}).`
    }
  } catch {
    message = 'Não foi possível falar com o Mercado Pago agora. Tente de novo em alguns minutos.'
  }

  await server.rpc('record_payment_check', { p_ok: ok, p_message: message, p_account_id: accountId, p_nickname: nickname })
  return reply(200, { ok, message, account_id: accountId, nickname, site_id: siteId })
})
