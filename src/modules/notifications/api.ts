import { getSupabase } from '@/lib/supabase'
import type { Database } from '@/types/supabase'

type Fn = Database['public']['Functions']
export type AppNotification = Fn['get_my_notifications']['Returns'][number]
export type NotificationPreference = Fn['get_my_notification_preferences']['Returns'][number]

/** Rótulos dos tipos de aviso (PRD 12, ADR-031). */
export const KIND_LABEL: Record<string, string> = {
  care_checkup: 'Check-up semanal da moto (sábado)',
  oil_change: 'Troca de óleo chegando ou vencida',
  workshop_access_request: 'Pedidos de acesso de oficinas',
  workshop_access_decided: 'Respostas aos pedidos da minha oficina',
  workshop_access_revoked: 'Acessos revogados da minha oficina',
  workshop_service: 'Serviços registrados por oficinas',
  transfer_received: 'Transferências recebidas',
  transfer_decided: 'Respostas às minhas transferências',
  reminder_due: 'Lembretes de manutenção',
  subscription_ending: 'Fim do período Premium',
  payment_approved: 'Pagamentos confirmados',
  payment_failed: 'Falhas e atrasos de pagamento',
  storage_limit: 'Espaço quase cheio',
  claim_decided: 'Pedidos de verificação de placa',
  ownership_notice: 'Avisos sobre a minha moto',
  admin_notice: 'Avisos da equipe',
  quote_viewed: 'Orçamento aberto pelo cliente',
  quote_decided: 'Resposta do cliente ao orçamento',
  quote_expired: 'Orçamento vencido',
  service_order_assigned: 'Ordem de serviço designada a mim',
  appointment_requested: 'Pedidos de agendamento pelo site',
  workshop_review: 'Novas avaliações da oficina',
}

export async function fetchNotifications(before?: string): Promise<AppNotification[]> {
  const { data, error } = await getSupabase().rpc('get_my_notifications', { p_limit: 30, p_before: before })
  if (error) throw error
  return data ?? []
}

export async function fetchUnreadCount(): Promise<number> {
  const { data, error } = await getSupabase().rpc('count_my_unread_notifications')
  if (error) throw error
  return Number(data ?? 0)
}

export async function markRead(ids?: string[]): Promise<number> {
  const { data, error } = await getSupabase().rpc('mark_my_notifications_read', ids ? { p_ids: ids } : {})
  if (error) throw error
  return Number(data ?? 0)
}

export async function fetchPreferences(): Promise<NotificationPreference[]> {
  const { data, error } = await getSupabase().rpc('get_my_notification_preferences')
  if (error) throw error
  return data ?? []
}

export async function setPreference(kind: string, inApp: boolean, email: boolean, push?: boolean): Promise<void> {
  const { error } = await getSupabase().rpc('set_my_notification_preference', { p_kind: kind, p_in_app: inApp, p_email: email, p_push: push ?? null })
  if (error) throw error
}
