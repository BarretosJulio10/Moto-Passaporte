// Contas da pista (ADR-058): o responsável cria o mecânico com nome, apelido e senha.
// O login usa um e-mail interno que ninguém vê; quem cria e gerencia é a Edge Function
// pista-accounts (a chave de serviço nunca vem para o navegador).
import { getSupabase } from '@/lib/supabase'
import { rpc } from '@/modules/workshop/shared/rpc'

export const PISTA_EMAIL_DOMAIN = 'pista.motopassaporte.com.br'
export const CODE_KEY = 'pista-code'

export type PistaAccount = {
  user_id: string
  nickname: string
  full_name: string
  active: boolean
  member_id: string | null
  last_sign_in_at: string | null
  created_at: string
}

/** "Zé Mário" → "zemario": sem acento, sem espaço, minúsculo. */
export function normalizeNickname(raw: string): string {
  return raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function normalizeCode(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6)
}

export const validNickname = (n: string) => /^[a-z0-9]{2,20}$/.test(n)
export const validCode = (c: string) => /^[a-z0-9]{6}$/.test(c)

export function pistaEmail(nickname: string, code: string): string {
  return `${normalizeNickname(nickname)}.${normalizeCode(code)}@${PISTA_EMAIL_DOMAIN}`
}

export function isPistaUser(user: { app_metadata?: Record<string, unknown> } | null | undefined): boolean {
  return user?.app_metadata?.account_kind === 'pista'
}

export function rememberCode(code: string) {
  try { localStorage.setItem(CODE_KEY, code) } catch { /* sem armazenamento: segue */ }
}
export function rememberedCode(): string {
  try { return localStorage.getItem(CODE_KEY) ?? '' } catch { return '' }
}

export const fetchWorkshopByCode = (code: string) =>
  rpc<{ code: string; name: string } | null>('pista_workshop_by_code', { p_code: normalizeCode(code) })

export const fetchPistaAccounts = (org: string) =>
  rpc<{ code: string; accounts: PistaAccount[] }>('workshop_pista_accounts', { p_org: org })

type Action =
  | { action: 'create'; full_name: string; nickname: string; password: string }
  | { action: 'convert'; member_id: string; full_name: string; nickname: string; password: string }
  | { action: 'password'; user_id: string; password: string }
  | { action: 'disable' | 'enable'; user_id: string }

export async function managePistaAccount(org: string, body: Action): Promise<void> {
  const { data, error } = await getSupabase().functions.invoke('pista-accounts', { body: { org, ...body } })
  if (error) {
    const ctx = (error as { context?: Response }).context
    let message = 'Não foi possível concluir agora. Tente de novo.'
    try { const b = ctx ? await ctx.json() : null; if (b?.message) message = b.message } catch { /* mensagem padrão */ }
    throw new Error(message)
  }
  if (!(data as { ok?: boolean })?.ok) throw new Error((data as { message?: string })?.message ?? 'Não foi possível concluir agora.')
}
