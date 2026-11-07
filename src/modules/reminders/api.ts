// Lembretes de manutenção (PRD 5.8; ADR-021). Intervalos vêm do usuário — nunca inventados.
import { getSupabase } from '@/lib/supabase'
import type { MaintenanceCategory } from '@/modules/maintenance/labels'

export type ReminderStatus = 'ok' | 'soon' | 'due' | 'paused' | 'done'

export type Reminder = {
  id: string
  motorcycle_id: string
  title: string
  category: MaintenanceCategory | null
  every_km: number | null
  every_months: number | null
  due_date: string | null
  base_mileage: number | null
  base_date: string
  notes: string | null
  paused: boolean
  last_completed_at: string | null
  next_km: number | null
  next_date: string | null
  km_left: number | null
  days_left: number | null
  current_km: number | null
  status: ReminderStatus
  motorcycle_name?: string
}

export type ReminderInput = {
  title: string
  category: MaintenanceCategory | null
  everyKm: number | null
  everyMonths: number | null
  dueDate: string | null
  notes: string
  lastDate: string | null
  lastKm: number | null
}

export const STATUS_LABEL: Record<ReminderStatus, string> = {
  due: 'Vencido',
  soon: 'Em breve',
  ok: 'Em dia',
  paused: 'Pausado',
  done: 'Concluído',
}

export async function fetchReminders(motorcycleId: string): Promise<Reminder[]> {
  const { data, error } = await getSupabase().rpc('get_motorcycle_reminders', { p_motorcycle_id: motorcycleId })
  if (error) throw error
  return (data ?? []) as unknown as Reminder[]
}

export async function fetchDueReminders(): Promise<Reminder[]> {
  const { data, error } = await getSupabase().rpc('get_my_due_reminders')
  if (error) throw error
  return (data ?? []) as unknown as Reminder[]
}

export async function createReminder(motorcycleId: string, i: ReminderInput): Promise<string> {
  const { data, error } = await getSupabase().rpc('create_reminder', {
    p_motorcycle_id: motorcycleId,
    p_title: i.title,
    p_category: i.category,
    p_every_km: i.everyKm,
    p_every_months: i.everyMonths,
    p_due_date: i.dueDate,
    p_notes: i.notes || null,
    p_base_mileage: i.lastKm,
    p_base_date: i.lastDate,
  })
  if (error) throw error
  return data
}

export async function updateReminder(id: string, i: ReminderInput): Promise<void> {
  const { error } = await getSupabase().rpc('update_reminder', {
    p_reminder_id: id,
    p_title: i.title,
    p_category: i.category,
    p_every_km: i.everyKm,
    p_every_months: i.everyMonths,
    p_due_date: i.dueDate,
    p_notes: i.notes || null,
  })
  if (error) throw error
}

export async function completeReminder(id: string, mileage: number | null): Promise<void> {
  const { error } = await getSupabase().rpc('complete_reminder', { p_reminder_id: id, p_mileage: mileage })
  if (error) throw error
}

export async function setReminderPaused(id: string, paused: boolean): Promise<void> {
  const { error } = await getSupabase().rpc('set_reminder_paused', { p_reminder_id: id, p_paused: paused })
  if (error) throw error
}

export async function deleteReminder(id: string): Promise<void> {
  const { error } = await getSupabase().rpc('delete_reminder', { p_reminder_id: id })
  if (error) throw error
}

/** Texto curto do que falta: "faltam 450 km", "vence em 12 dias", "venceu há 3 dias". */
export function describeDue(r: Reminder): string {
  const parts: string[] = []
  if (r.km_left !== null) {
    parts.push(r.km_left > 0 ? `faltam ${r.km_left.toLocaleString('pt-BR')} km` : `passou ${Math.abs(r.km_left).toLocaleString('pt-BR')} km`)
  }
  if (r.days_left !== null) {
    if (r.days_left > 0) parts.push(`vence em ${r.days_left} ${r.days_left === 1 ? 'dia' : 'dias'}`)
    else if (r.days_left === 0) parts.push('vence hoje')
    else parts.push(`venceu há ${Math.abs(r.days_left)} ${Math.abs(r.days_left) === 1 ? 'dia' : 'dias'}`)
  }
  return parts.join(' · ')
}

export function describeRule(r: Pick<Reminder, 'every_km' | 'every_months' | 'due_date'>): string {
  const parts: string[] = []
  if (r.every_km) parts.push(`a cada ${r.every_km.toLocaleString('pt-BR')} km`)
  if (r.every_months) parts.push(`a cada ${r.every_months} ${r.every_months === 1 ? 'mês' : 'meses'}`)
  if (r.due_date) parts.push(`em ${new Date(`${r.due_date}T12:00:00`).toLocaleDateString('pt-BR')}`)
  return parts.join(' ou ')
}

/** Valida o formulário; devolve mensagem do primeiro problema ou o objeto pronto. */
export function parseReminderForm(f: {
  title: string; category: string; everyKm: string; everyMonths: string; dueDate: string; notes: string; lastDate: string; lastKm: string
}): ReminderInput | string {
  const title = f.title.trim()
  if (title.length < 2 || title.length > 80) return 'Dê um nome ao lembrete (2 a 80 caracteres).'
  const num = (v: string) => (v.trim() === '' ? null : /^\d+$/.test(v.replace(/\./g, '').trim()) ? Number(v.replace(/\./g, '').trim()) : Number.NaN)
  const everyKm = num(f.everyKm)
  const everyMonths = num(f.everyMonths)
  const lastKm = num(f.lastKm)
  if (Number.isNaN(everyKm) || Number.isNaN(everyMonths) || Number.isNaN(lastKm)) return 'Use apenas números inteiros.'
  if (everyKm === null && everyMonths === null && !f.dueDate) return 'Escolha pelo menos um gatilho: quilometragem, intervalo em meses ou data.'
  if (f.dueDate && everyMonths !== null) return 'Use data específica ou intervalo em meses, não os dois.'
  if (everyKm !== null && (everyKm < 100 || everyKm > 100000)) return 'Intervalo de quilometragem entre 100 e 100.000 km.'
  if (everyMonths !== null && (everyMonths < 1 || everyMonths > 60)) return 'Intervalo entre 1 e 60 meses.'
  if (f.notes.length > 300) return 'Observação com até 300 caracteres.'
  return {
    title,
    category: (f.category || null) as MaintenanceCategory | null,
    everyKm,
    everyMonths,
    dueDate: f.dueDate || null,
    notes: f.notes.trim(),
    lastDate: f.lastDate || null,
    lastKm,
  }
}
