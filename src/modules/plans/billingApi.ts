// Assinatura do usuário (ADR-020). Tudo que muda estado passa pela Edge Function,
// que confirma com o Mercado Pago; o navegador nunca ativa o Premium.
import { getSupabase } from '@/lib/supabase'
import type { Database } from '@/types/supabase'
import type { BillingPeriod } from './api'

export type SubscriptionStatus = 'pending' | 'active' | 'past_due' | 'paused' | 'canceled' | 'expired' | 'rejected'

export type MySubscription = {
  id: string
  plan_name: string
  billing_period: Exclude<BillingPeriod, 'none'>
  price_cents: number
  status: SubscriptionStatus
  current_period_end: string | null
  started_at: string | null
  canceled_at: string | null
  past_due_since: string | null
  grace_until: string | null
  has_access: boolean
  environment: 'test' | 'production'
}

export type MyPayment = Database['public']['Functions']['get_my_payments']['Returns'][number]

export const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  pending: 'Aguardando pagamento',
  active: 'Ativa',
  past_due: 'Pagamento em atraso',
  paused: 'Pausada',
  canceled: 'Cancelada',
  expired: 'Encerrada',
  rejected: 'Não concluída',
}

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: 'Em processamento',
  approved: 'Aprovado',
  rejected: 'Recusado',
  refunded: 'Reembolsado',
  charged_back: 'Contestado',
  canceled: 'Cancelado',
}

export async function fetchMySubscription(): Promise<MySubscription | null> {
  const { data, error } = await getSupabase().rpc('get_my_subscription')
  if (error) throw error
  return (data ?? null) as unknown as MySubscription | null
}

export async function fetchMyPayments(): Promise<MyPayment[]> {
  const { data, error } = await getSupabase().rpc('get_my_payments')
  if (error) throw error
  return data ?? []
}

async function billing<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().functions.invoke('mercadopago-billing', { body })
  if (error) {
    const ctx = (error as { context?: Response }).context
    let message = 'Não foi possível concluir agora. Tente de novo em alguns minutos.'
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

export async function startSubscription(planCode: string): Promise<string> {
  const r = await billing<{ checkout_url: string }>({ action: 'subscribe', plan_code: planCode })
  if (!/^https:\/\/([a-z0-9-]+\.)*mercadopago\.com(\.br)?\//.test(r.checkout_url)) throw new Error('Endereço de pagamento inesperado.')
  return r.checkout_url
}

export const syncSubscription = () => billing<{ ok: boolean }>({ action: 'sync' })

// Premium por período pago à vista: Pix, débito, boleto ou saldo, sem cartão salvo (ADR-039).
export async function startPassPayment(planCode: string): Promise<string> {
  const r = await billing<{ checkout_url: string }>({ action: 'pay_pass', plan_code: planCode })
  if (!/^https:\/\/([a-z0-9-]+\.)*mercadopago\.com(\.br)?\//.test(r.checkout_url)) throw new Error('Endereço de pagamento inesperado.')
  return r.checkout_url
}
export const syncPassPayments = () => billing<{ ok: boolean }>({ action: 'sync_pass' })

export type MyPass = Database['public']['Functions']['get_my_passes']['Returns'][number]
export const PASS_STATUS_LABEL: Record<string, string> = {
  pending: 'Aguardando pagamento',
  paid: 'Pago',
  failed: 'Não concluído',
  expired: 'Não pago',
  refunded: 'Reembolsado',
}
export const PAY_METHOD_LABEL: Record<string, string> = {
  bank_transfer: 'Pix',
  ticket: 'Boleto',
  debit_card: 'Débito',
  credit_card: 'Cartão',
  account_money: 'Saldo Mercado Pago',
}
export async function fetchMyPasses(): Promise<MyPass[]> {
  const { data, error } = await getSupabase().rpc('get_my_passes')
  if (error) throw error
  return data ?? []
}

/** Dias inteiros até o fim (último dia incluído). */
export function daysLeft(endIso: string, now = new Date()): number {
  return Math.ceil((new Date(endIso).getTime() - now.getTime()) / 86_400_000)
}
export const cancelSubscription = () => billing<{ ok: boolean }>({ action: 'cancel' })
export const reconcileSubscriptions = () =>
  billing<{ ok: boolean; checked: number; synced: number; failures: string[] }>({ action: 'reconcile' })

export type MyInvoice = Database['public']['Functions']['get_my_invoices']['Returns'][number]

export type InvoiceReceipt = {
  number: string
  status: 'paid' | 'refunded' | 'charged_back'
  plan_name: string
  billing_period: Exclude<BillingPeriod, 'none'>
  period_start: string
  period_end: string
  amount_cents: number
  currency: string
  paid_at: string | null
  environment: 'test' | 'production'
  payment_reference: string | null
  customer_name: string | null
  customer_email: string | null
}

export const INVOICE_STATUS_LABEL: Record<string, string> = {
  open: 'Em aberto',
  failed: 'Cobrança não aprovada',
  paid: 'Paga',
  refunded: 'Reembolsada',
  charged_back: 'Contestada',
  canceled: 'Cancelada',
}

export async function fetchMyInvoices(): Promise<MyInvoice[]> {
  const { data, error } = await getSupabase().rpc('get_my_invoices')
  if (error) throw error
  return data ?? []
}

export async function fetchInvoiceReceipt(id: string): Promise<InvoiceReceipt> {
  const { data, error } = await getSupabase().rpc('get_invoice_receipt', { p_invoice_id: id })
  if (error) throw error
  return data as unknown as InvoiceReceipt
}
