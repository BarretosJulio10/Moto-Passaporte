// Avisos por e-mail (Resend) e WhatsApp (FZAP), ADR-064. O navegador só envia as chaves; nunca as lê de volta.
import { getSupabase } from '@/lib/supabase'

export type MessagingSettings = {
  email_enabled: boolean
  email_from: string
  link_base: string
  resend_key_configured: boolean
  resend_key_hint: string | null
  whatsapp_enabled: boolean
  fzap_url: string | null
  fzap_token_configured: boolean
  fzap_token_hint: string | null
  whatsapp_cooldown_hours: number
  updated_at: string
  updated_by_name: string | null
  last_24h: Record<string, number>
  pending: { email: number; whatsapp: number }
}

export type SaveMessagingInput = {
  emailEnabled: boolean
  emailFrom: string
  linkBase: string
  resendKey: string
  whatsappEnabled: boolean
  fzapUrl: string
  fzapToken: string
  cooldownHours: number
}

export type OutboundMessage = {
  id: string; channel: 'email' | 'whatsapp'; kind: string; destination: string
  status: 'sent' | 'failed' | 'skipped'; error: string | null; created_at: string; user_name: string | null
}

// Funções novas ainda fora dos tipos gerados do banco.
const call = (fn: string, args?: Record<string, unknown>) => getSupabase().rpc(fn as never, args as never)

export async function fetchMessagingSettings(): Promise<MessagingSettings> {
  const { data, error } = await call('admin_get_messaging_settings')
  if (error) throw error
  return data as unknown as MessagingSettings
}

export async function saveMessagingSettings(i: SaveMessagingInput): Promise<void> {
  const { error } = await call('admin_save_messaging_settings', {
    p_email_enabled: i.emailEnabled, p_email_from: i.emailFrom, p_link_base: i.linkBase, p_resend_key: i.resendKey || null,
    p_whatsapp_enabled: i.whatsappEnabled, p_fzap_url: i.fzapUrl || null, p_fzap_token: i.fzapToken || null,
    p_cooldown_hours: i.cooldownHours,
  })
  if (error) throw error
}

export async function fetchOutboundMessages(): Promise<OutboundMessage[]> {
  const { data, error } = await call('admin_list_outbound_messages', { p_limit: 100 })
  if (error) throw error
  return (data ?? []) as unknown as OutboundMessage[]
}

/** Ações do painel (teste e conexão do WhatsApp) pela Edge Function messages-admin. */
export async function messagingAction<T = { ok?: boolean; detail?: string }>(action: string, extra: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await getSupabase().functions.invoke('messages-admin', { body: { action, ...extra } })
  if (error) {
    const ctx = (error as { context?: Response }).context
    let message = 'Não foi possível concluir agora. Tente de novo.'
    if (ctx && typeof ctx.json === 'function') {
      try {
        const b = (await ctx.json()) as { message?: string }
        if (b.message) message = b.message
      } catch {
        /* sem corpo */
      }
    }
    throw new Error(message)
  }
  return data as T
}

export type WaStatus = { connected: boolean; loggedIn: boolean; number?: string | null }
