// Chamada às funções do módulo Oficina (PRD 2.1). As funções conferem a oficina pela sessão;
// o organization_id enviado só escolhe qual das oficinas do usuário, nunca dá acesso (§19.9).
import { getSupabase } from '@/lib/supabase'

type RpcClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>
}

export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await (getSupabase() as unknown as RpcClient).rpc(fn, args)
  if (error) throw error
  return data as T
}

/** Centavos para "R$ 1.234,56". */
export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '—'
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** "1.234,56", "1234.5", "R$ 12" → centavos. Vazio ou inválido → null. */
export function parseMoney(value: string): number | null {
  const raw = value.replace(/[R$\s]/g, '')
  if (!raw) return null
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return null
  return Math.round(Number(normalized) * 100)
}

/** Centavos para o campo de edição ("1234,56"). */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return ''
  return (cents / 100).toFixed(2).replace('.', ',')
}

export function onlyDigits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '')
}

/** (17) 99999-1234 */
export function formatPhone(value: string | null | undefined): string {
  const d = onlyDigits(value)
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return value ?? ''
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
