// Formatação para exibição em português do Brasil.

/** Placa normalizada (igual ao banco): maiúsculas, só letras e números. */
export function normalizePlate(value: string | null | undefined): string {
  return (value ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}

/** Placa antiga (ABC1234) ou Mercosul (ABC1D23). Mesma regra do banco. */
export function isValidPlate(value: string): boolean {
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(normalizePlate(value))
}

/** Exibe placa antiga com hífen (ABC-1234) e Mercosul sem (ABC1D23). */
export function formatPlate(value: string | null | undefined): string {
  const plate = normalizePlate(value)
  if (/^[A-Z]{3}[0-9]{4}$/.test(plate)) return `${plate.slice(0, 3)}-${plate.slice(3)}`
  return plate
}

export function formatKm(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return `${value.toLocaleString('pt-BR')} km`
}

/** Datas "date" do banco (YYYY-MM-DD) sem deslocamento de fuso. */
export function formatDate(value: string | null | undefined, style: 'long' | 'short' = 'long'): string {
  if (!value) return '—'
  const iso = value.length === 10 ? `${value}T12:00:00` : value
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('pt-BR', style === 'long' ? { day: 'numeric', month: 'long', year: 'numeric' } : undefined)
}

/** Mostra só o início e o fim do chassi. */
export function maskChassis(value: string | null | undefined): string {
  if (!value) return '—'
  if (value.length <= 6) return '•'.repeat(value.length)
  return `${value.slice(0, 3)}${'•'.repeat(value.length - 7)}${value.slice(-4)}`
}

/** Data de hoje no fuso local, no formato YYYY-MM-DD. */
export function todayISO(): string {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}
