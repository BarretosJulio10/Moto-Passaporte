// Diário da moto (PRD 5.7). Contrato em docs/API_DOCUMENTATION.md (Diário).
import { getSupabase } from '@/lib/supabase'
import { removeFiles } from '@/modules/attachments/api'
import type { AttachmentSummary } from '@/modules/attachments/AttachmentList'
import type { DiaryCategory, DiaryInput, DiaryVisibility } from './schemas'

export type DiaryEntry = {
  id: string
  motorcycle_id: string
  category: DiaryCategory
  title: string
  body: string | null
  entry_date: string
  location: string | null
  visibility: DiaryVisibility
  created_at: string
  updated_at: string
  /** false = escrita por um dono anterior (entrada compartilhável). */
  is_mine: boolean
  photos: AttachmentSummary[]
}

export async function fetchDiary(motorcycleId: string): Promise<DiaryEntry[]> {
  const { data, error } = await getSupabase()
    .from('motorcycle_diary_feed')
    .select('*')
    .eq('motorcycle_id', motorcycleId)
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as DiaryEntry[]
}

function args(input: DiaryInput) {
  return {
    p_category: input.category as DiaryCategory,
    p_title: input.title,
    p_entry_date: input.entryDate,
    p_body: input.body,
    p_location: input.location,
    p_visibility: input.visibility,
  }
}

export async function createDiaryEntry(motorcycleId: string, input: DiaryInput): Promise<string> {
  const { data, error } = await getSupabase().rpc('create_diary_entry', { p_motorcycle_id: motorcycleId, ...args(input) })
  if (error) throw error
  return data as string
}

export async function updateDiaryEntry(entryId: string, input: DiaryInput): Promise<void> {
  const { error } = await getSupabase().rpc('update_diary_entry', { p_entry_id: entryId, ...args(input) })
  if (error) throw error
}

/** Exclui a entrada e apaga os arquivos das fotos. */
export async function deleteDiaryEntry(entryId: string): Promise<void> {
  const { data, error } = await getSupabase().rpc('delete_diary_entry', { p_entry_id: entryId })
  if (error) throw error
  await removeFiles((data as string[] | null) ?? [])
}

export async function deleteDiaryPhoto(attachmentId: string): Promise<void> {
  const { data, error } = await getSupabase().rpc('delete_diary_photo', { p_attachment_id: attachmentId })
  if (error) throw error
  await removeFiles(data ? [data as string] : [])
}

/** Agrupa por ano, mantendo a ordem (mais recente primeiro). */
export function groupByYear(entries: DiaryEntry[]): Array<{ year: string; entries: DiaryEntry[] }> {
  const groups: Array<{ year: string; entries: DiaryEntry[] }> = []
  for (const e of entries) {
    const year = e.entry_date.slice(0, 4)
    const last = groups[groups.length - 1]
    if (last && last.year === year) last.entries.push(e)
    else groups.push({ year, entries: [e] })
  }
  return groups
}
