// Crescimento comercial da oficina (PRD 2.1 Fase 5): perfil público avançado, avaliações, agendamento público e campanhas.
// Contrato em docs/modules/WORKSHOP_GROWTH.md.
import { getSupabase } from '@/lib/supabase'
import { buildStoragePath } from '@/modules/attachments/files'
import { AttachmentError, prepareFile } from '@/modules/attachments/api'
import { rpc } from '../shared/rpc'
import { WORKSHOP_BUCKET } from '../service-orders/api'

// ---------- Horário estruturado ----------
export type WeeklyHours = Partial<Record<'0' | '1' | '2' | '3' | '4' | '5' | '6', [string, string] | null>>
export const WEEKDAYS: { key: keyof WeeklyHours; short: string; long: string }[] = [
  { key: '1', short: 'Seg', long: 'Segunda' }, { key: '2', short: 'Ter', long: 'Terça' }, { key: '3', short: 'Qua', long: 'Quarta' },
  { key: '4', short: 'Qui', long: 'Quinta' }, { key: '5', short: 'Sex', long: 'Sexta' }, { key: '6', short: 'Sáb', long: 'Sábado' },
  { key: '0', short: 'Dom', long: 'Domingo' },
]
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

/** Erro em português ou null. Fechamento depois da abertura, formato HH:MM. */
export function validateHours(h: WeeklyHours): string | null {
  for (const d of WEEKDAYS) {
    const v = h[d.key]
    if (!v) continue
    if (!HHMM.test(v[0]) || !HHMM.test(v[1])) return `${d.long}: use horas no formato 08:00.`
    if (v[0] >= v[1]) return `${d.long}: o fechamento precisa ser depois da abertura.`
  }
  return null
}

/** "Seg a sex: 08:00–18:00 · Sáb: 08:00–12:00 · Dom: fechado", agrupando dias seguidos iguais. */
export function summarizeHours(h: WeeklyHours | null | undefined): string {
  if (!h) return ''
  const parts: string[] = []
  let i = 0
  while (i < WEEKDAYS.length) {
    const cur = h[WEEKDAYS[i]!.key] ?? null
    let j = i
    while (j + 1 < WEEKDAYS.length && JSON.stringify(h[WEEKDAYS[j + 1]!.key] ?? null) === JSON.stringify(cur)) j++
    const days = i === j ? WEEKDAYS[i]!.short : `${WEEKDAYS[i]!.short} a ${WEEKDAYS[j]!.short.toLowerCase()}`
    parts.push(`${days}: ${cur ? `${cur[0]}–${cur[1]}` : 'fechado'}`)
    i = j + 1
  }
  return parts.join(' · ')
}

// ---------- Perfil público avançado ----------
export type ProfileExtras = {
  brands_served: string[]
  website_url: string | null
  weekly_hours: WeeklyHours | null
  show_services: boolean
  show_prices: boolean
  booking_enabled: boolean
  booking_slot_minutes: number
  booking_capacity: number
  booking_days_ahead: number
  booking_min_hours: number
}
export async function updateProfileExtras(orgId: string, patch: Partial<ProfileExtras>) {
  const { error } = await getSupabase().from('workshops').update(patch).eq('organization_id', orgId)
  if (error) throw error
}
export function parseBrands(text: string): string[] {
  const seen = new Set<string>()
  return text.split(/[,;\n]/).map((b) => b.trim()).filter((b) => b.length >= 2 && b.length <= 40)
    .filter((b) => { const k = b.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true }).slice(0, 30)
}

export type PublicPhoto = { id: string; kind: 'logo' | 'photo'; path: string; caption: string | null }
export const listPublicPhotos = (org: string) => rpc<PublicPhoto[]>('workshop_list_public_photos', { p_org: org })
export const removePublicPhoto = (org: string, id: string) => rpc<void>('workshop_remove_public_photo', { p_org: org, p_id: id })
export async function uploadPublicPhoto(org: string, file: File, kind: 'logo' | 'photo', caption = ''): Promise<string> {
  const prepared = await prepareFile(file)
  if (prepared.mime === 'application/pdf') throw new AttachmentError('Envie uma imagem (JPG, PNG ou WebP).')
  const supabase = getSupabase()
  const path = buildStoragePath(org, prepared.mime)
  const up = await supabase.storage.from(WORKSHOP_BUCKET).upload(path, prepared.blob, { contentType: prepared.mime, upsert: false, cacheControl: '3600' })
  if (up.error) {
    if (/exceed|too large|maximum allowed size/i.test(up.error.message ?? '')) throw new AttachmentError('Imagem grande demais (máximo 10 MB).')
    throw new AttachmentError('Não foi possível enviar a imagem. Tente de novo.')
  }
  const { error } = await supabase.functions.invoke('attachment-check', { body: { path, bucket: WORKSHOP_BUCKET } })
  if (error) throw new AttachmentError('A imagem não passou na conferência. Envie outra.')
  return rpc<string>('workshop_register_public_photo', { p_org: org, p_path: path, p_kind: kind, p_caption: caption })
}
/** Links temporários (1 h) das imagens do perfil; funciona sem conta porque o banco libera só arquivos do perfil público. */
export async function publicPhotoUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {}
  const { data, error } = await getSupabase().storage.from(WORKSHOP_BUCKET).createSignedUrls(paths, 3600)
  if (error) throw error
  const out: Record<string, string> = {}
  for (const item of data ?? []) if (item.path && item.signedUrl) out[item.path] = item.signedUrl
  return out
}

export type PublicWorkshop = {
  business_name: string
  public_slug: string
  city: string | null
  state: string | null
  address: string | null
  phone: string | null
  whatsapp: string | null
  email: string | null
  website_url: string | null
  description: string | null
  specialties: string[]
  brands_served: string[]
  opening_hours: string | null
  weekly_hours: WeeklyHours | null
  verification_status: 'unverified' | 'verified' | 'rejected'
  logo_path: string | null
  photos: { path: string; caption: string | null }[]
  services: { name: string; category: string; estimated_minutes: number | null; price_cents: number | null }[]
  rating: { count: number; average: number | null }
  reviews: { rating: number; comment: string | null; display_name: string; reply: string | null; created_at: string }[]
  booking: { slot_minutes: number; days_ahead: number; min_hours: number } | null
}
export const fetchPublicWorkshop = (slug: string) => rpc<PublicWorkshop | null>('get_public_workshop', { p_slug: slug })
export const fetchBookingSlots = (slug: string, date: string) => rpc<string[]>('get_public_booking_slots', { p_slug: slug, p_date: date })
export type BookingInput = { date: string; time: string; name: string; whatsapp: string; vehicle: string; service: string; consent: boolean }
export const requestAppointment = (slug: string, b: BookingInput) =>
  rpc<{ ok: true; starts_at: string; workshop: string; whatsapp: string | null }>('request_public_appointment', {
    p_slug: slug, p_date: b.date, p_time: b.time, p_name: b.name, p_whatsapp: b.whatsapp, p_vehicle: b.vehicle || null, p_service: b.service, p_consent: b.consent,
  })

/** Próximos dias (ISO local) para o agendamento, até o limite da oficina. */
export function nextDays(daysAhead: number, from = new Date()): string[] {
  const out: string[] = []
  for (let i = 0; i <= Math.min(daysAhead, 60); i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i)
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  }
  return out
}

// ---------- Avaliações ----------
export type Review = {
  id: string
  order_id: string
  order_number: number
  rating: number
  comment: string | null
  display_name: string
  customer_name: string
  status: 'published' | 'hidden'
  reply: string | null
  replied_at: string | null
  reported_at: string | null
  report_reason: string | null
  moderated_at: string | null
  moderation_note: string | null
  created_at: string
}
export type ReviewList = { summary: { count: number; average: number | null; by_star: Record<'1' | '2' | '3' | '4' | '5', number> }; reviews: Review[] }
export const listReviews = (org: string) => rpc<ReviewList>('workshop_list_reviews', { p_org: org })
export const replyReview = (org: string, id: string, reply: string) => rpc<void>('workshop_reply_review', { p_org: org, p_id: id, p_reply: reply })
export const reportReview = (org: string, id: string, reason: string) => rpc<void>('workshop_report_review', { p_org: org, p_id: id, p_reason: reason })
export const submitReview = (token: string, rating: number, comment: string, name: string, consent: boolean) =>
  rpc<{ ok: true; display_name: string; workshop: string }>('submit_workshop_review', { p_token: token, p_rating: rating, p_comment: comment || null, p_name: name || null, p_consent: consent })

export type AdminReview = { id: string; workshop: string; workshop_slug: string; rating: number; comment: string | null; display_name: string; status: 'published' | 'hidden'; reply: string | null; reported_at: string | null; report_reason: string | null; moderated_at: string | null; moderation_note: string | null; created_at: string }
export const adminListReviews = (onlyReported: boolean) => rpc<AdminReview[]>('admin_list_reviews', { p_only_reported: onlyReported })
export const adminModerateReview = (id: string, action: 'hide' | 'keep' | 'restore', reason: string) =>
  rpc<void>('admin_moderate_review', { p_id: id, p_action: action, p_reason: reason })

export function stars(n: number): string {
  const r = Math.max(0, Math.min(5, Math.round(n)))
  return '★'.repeat(r) + '☆'.repeat(5 - r)
}

// ---------- Campanhas ----------
export type Audience = 'inactive' | 'reminders' | 'brand' | 'all'
export const AUDIENCE_LABEL: Record<Audience, string> = {
  inactive: 'Clientes sem voltar há um tempo', reminders: 'Clientes com lembrete aberto', brand: 'Donos de uma marca de moto', all: 'Todos os clientes',
}
export type Campaign = {
  id: string
  name: string
  audience: Audience
  audience_days: number | null
  audience_brand: string | null
  message: string
  status: 'active' | 'closed'
  created_at: string
  closed_at: string | null
  audience_count?: number
  contacted_count?: number
}
export type CampaignInput = { name: string; audience: Audience; audience_days?: number; audience_brand?: string; message: string }
export type Recipient = { customer_id: string; customer_name: string; whatsapp: string; vehicle_label: string | null; last_visit: string | null; contacted_at: string | null }
export const listCampaigns = (org: string) => rpc<Campaign[]>('workshop_list_campaigns', { p_org: org })
export const saveCampaign = (org: string, id: string | null, data: CampaignInput) => rpc<string>('workshop_save_campaign', { p_org: org, p_id: id, p_data: data })
export const closeCampaign = (org: string, id: string) => rpc<void>('workshop_close_campaign', { p_org: org, p_id: id })
export const campaignRecipients = (org: string, id: string) =>
  rpc<{ campaign: Campaign; opted_out: number; recipients: Recipient[] }>('workshop_campaign_recipients', { p_org: org, p_id: id })
export const setMarketingOptOut = (org: string, customer: string, optOut: boolean) =>
  rpc<void>('workshop_set_marketing_opt_out', { p_org: org, p_customer: customer, p_opt_out: optOut })

export const OPT_OUT_FOOTER = 'Se não quiser receber estas mensagens, responda SAIR.'
/** Troca {nome}, {oficina} e {moto} e acrescenta a opção de sair (LGPD: a pessoa sempre pode recusar). */
export function campaignText(message: string, p: { customerName: string; workshopName: string; vehicle?: string | null }): string {
  const first = p.customerName.trim().split(/\s+/)[0] ?? ''
  const body = message
    .replace(/\{nome\}/gi, first)
    .replace(/\{oficina\}/gi, p.workshopName)
    .replace(/\{moto\}/gi, p.vehicle?.split(',')[0]?.trim() || 'sua moto')
    .trim()
  return `${body}\n\n${OPT_OUT_FOOTER}`
}
