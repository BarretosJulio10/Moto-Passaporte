// Credenciais do Mercado Pago (ADR-019). O navegador só envia segredos; nunca os lê de volta.
import { getSupabase } from '@/lib/supabase'

export type PaymentEnvironment = 'test' | 'production'

export type PaymentSettings = {
  environment: PaymentEnvironment
  public_key: string | null
  access_token_configured: boolean
  access_token_hint: string | null
  webhook_secret_configured: boolean
  webhook_secret_hint: string | null
  account_id: string | null
  account_nickname: string | null
  last_check_at: string | null
  last_check_ok: boolean | null
  last_check_message: string | null
  updated_at: string
  updated_by_name: string | null
  billing_enabled: boolean
}

export type SavePaymentInput = {
  environment: PaymentEnvironment
  publicKey: string
  accessToken: string
  webhookSecret: string
}

export type CheckResult = { ok: boolean; message: string; account_id: string | null; nickname: string | null }

export async function fetchPaymentSettings(): Promise<PaymentSettings> {
  const { data, error } = await getSupabase().rpc('admin_get_payment_settings')
  if (error) throw error
  return data as unknown as PaymentSettings
}

export async function savePaymentSettings(input: SavePaymentInput): Promise<void> {
  const { error } = await getSupabase().rpc('admin_save_payment_settings', {
    p_environment: input.environment,
    p_public_key: input.publicKey.trim() || null,
    p_access_token: input.accessToken.trim() || null,
    p_webhook_secret: input.webhookSecret.trim() || null,
  })
  if (error) throw error
}

export async function checkPaymentConnection(): Promise<CheckResult> {
  const { data, error } = await getSupabase().functions.invoke('mercadopago-check', { body: {} })
  if (error) {
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      try {
        const body = (await ctx.json()) as Partial<CheckResult>
        if (body.message) return { ok: false, message: body.message, account_id: null, nickname: null }
      } catch {
        /* resposta sem corpo */
      }
    }
    throw error
  }
  return data as CheckResult
}

/** Validação local (o servidor valida de novo). */
export function validatePaymentInput(i: SavePaymentInput): string | null {
  const key = i.publicKey.trim()
  const token = i.accessToken.trim()
  const secret = i.webhookSecret.trim()
  if (key && !/^(TEST|APP_USR)-[A-Za-z0-9-]{10,200}$/.test(key)) return 'Chave pública inválida. Ela começa com TEST- ou APP_USR-.'
  if (token && !/^(TEST|APP_USR)-[A-Za-z0-9-]{20,250}$/.test(token)) return 'Token de acesso inválido. Ele começa com TEST- ou APP_USR-.'
  if (secret && !/^[A-Za-z0-9_-]{16,200}$/.test(secret)) return 'Assinatura secreta inválida. Copie o valor completo do painel do Mercado Pago.'
  return null
}

export async function setBillingEnabled(enabled: boolean): Promise<void> {
  const { error } = await getSupabase().rpc('admin_set_billing_enabled', { p_enabled: enabled })
  if (error) throw error
}

export type AdminSubscription = import('@/types/supabase').Database['public']['Functions']['admin_list_subscriptions']['Returns'][number]
export type PaymentEvent = import('@/types/supabase').Database['public']['Functions']['admin_list_payment_events']['Returns'][number]

export async function adminListSubscriptions(): Promise<AdminSubscription[]> {
  const { data, error } = await getSupabase().rpc('admin_list_subscriptions', { p_limit: 200 })
  if (error) throw error
  return data ?? []
}

export async function adminListPaymentEvents(): Promise<PaymentEvent[]> {
  const { data, error } = await getSupabase().rpc('admin_list_payment_events', { p_limit: 50 })
  if (error) throw error
  return data ?? []
}

export type AdminInvoice = import('@/types/supabase').Database['public']['Functions']['admin_list_invoices']['Returns'][number]

export async function adminListInvoices(): Promise<AdminInvoice[]> {
  const { data, error } = await getSupabase().rpc('admin_list_invoices', { p_limit: 100 })
  if (error) throw error
  return data ?? []
}
