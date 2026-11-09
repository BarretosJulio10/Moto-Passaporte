// Contas da pista (PRD 2.5, ADR-058): o responsável da oficina cria o mecânico com nome,
// apelido e senha, sem convite. O login usa um e-mail interno que ninguém vê
// (<apelido>.<código>@pista.motopassaporte.com.br). A chave de serviço só existe aqui;
// o banco (pista_account_*) confere sempre se quem pede é o responsável.
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BAN = '876000h'

export function normalizeNickname(raw: string): string {
  return raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function readClaims(jwt: string): { sub?: string; role?: string; exp?: number } | null {
  try {
    const part = jwt.split('.')[1] ?? ''
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))))
  } catch {
    return null
  }
}

type Body = {
  action?: 'create' | 'convert' | 'password' | 'disable' | 'enable'
  org?: string
  user_id?: string
  member_id?: string
  full_name?: string
  nickname?: string
  password?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return reply(405, { message: 'Método não permitido.' })

  const url = Deno.env.get('SUPABASE_URL')!
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  if (!jwt) return reply(401, { message: 'Entre na sua conta.' })
  const server = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  // A assinatura do token já foi conferida pelo Supabase antes de chegar aqui (verify_jwt);
  // lê o usuário do token e confirma que a conta existe e não está bloqueada.
  const claims = readClaims(jwt)
  const now = Math.floor(Date.now() / 1000)
  if (!claims?.sub || !UUID.test(claims.sub) || claims.role !== 'authenticated' || (claims.exp ?? 0) < now) {
    return reply(401, { message: 'Sua sessão expirou. Saia e entre de novo.' })
  }
  const { data: found, error: authError } = await server.auth.admin.getUserById(claims.sub)
  const actor = found?.user
  if (!actor || (actor.banned_until && new Date(actor.banned_until).getTime() > Date.now())) {
    console.error('pista-accounts: conta não encontrada', authError?.message)
    return reply(401, { message: 'Sua sessão expirou. Saia e entre de novo.' })
  }

  let body: Body = {}
  try {
    body = await req.json()
  } catch {
    return reply(400, { message: 'Pedido inválido.' })
  }
  if (!body.org || !UUID.test(body.org)) return reply(400, { message: 'Oficina inválida.' })
  const dbError = (e: { message?: string; code?: string }) =>
    reply(e.code === '42501' ? 403 : 409, { message: e.message ?? 'Não foi possível concluir agora.' })

  const password = body.password ?? ''
  const needsPassword = body.action === 'create' || body.action === 'convert' || body.action === 'password'
  if (needsPassword && (password.length < 6 || password.length > 72)) {
    return reply(400, { message: 'A senha precisa ter de 6 a 72 caracteres.' })
  }

  if (body.action === 'create' || body.action === 'convert') {
    const nickname = normalizeNickname(body.nickname ?? '')
    const fullName = (body.full_name ?? '').trim().slice(0, 120)
    if (!fullName) return reply(400, { message: 'Informe o nome do mecânico.' })
    const replace = body.action === 'convert' ? body.member_id ?? '' : null
    if (replace !== null && !UUID.test(replace)) return reply(400, { message: 'Membro inválido.' })

    const { data: prep, error: prepError } = await server.rpc('pista_account_prepare', {
      p_actor: actor.id, p_org: body.org, p_nickname: nickname, p_replace_member: replace,
    })
    if (prepError) return dbError(prepError)
    const email = (prep as { email: string }).email

    const created = await server.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { account_kind: 'pista', pista_org: body.org },
      user_metadata: { full_name: fullName },
    })
    if (created.error || !created.data.user) {
      console.error('pista-accounts: createUser', created.error?.message)
      return reply(409, { message: 'Não foi possível criar o acesso. Tente outro apelido.' })
    }
    const { error: regError } = await server.rpc('pista_account_register', {
      p_actor: actor.id, p_org: body.org, p_user: created.data.user.id, p_nickname: nickname,
      p_full_name: fullName, p_replace_member: replace,
    })
    if (regError) {
      await server.auth.admin.deleteUser(created.data.user.id)
      return dbError(regError)
    }
    return reply(200, { ok: true, user_id: created.data.user.id, nickname })
  }

  if (body.action === 'password' || body.action === 'disable' || body.action === 'enable') {
    if (!body.user_id || !UUID.test(body.user_id)) return reply(400, { message: 'Mecânico inválido.' })
    const { error } = await server.rpc('pista_account_manage', {
      p_actor: actor.id, p_org: body.org, p_user: body.user_id, p_action: body.action,
    })
    if (error) return dbError(error)
    const attrs =
      body.action === 'password' ? { password }
      : body.action === 'disable' ? { ban_duration: BAN }
      : { ban_duration: 'none' }
    const updated = await server.auth.admin.updateUserById(body.user_id, attrs)
    if (updated.error) return reply(500, { message: 'Não foi possível concluir agora. Tente de novo.' })
    return reply(200, { ok: true })
  }

  return reply(400, { message: 'Ação inválida.' })
})
