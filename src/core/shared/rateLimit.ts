/** Consulta anônima recusada pelo limite por conexão (ADR-035). */
export function isRateLimited(error: unknown): boolean {
  const e = error as { hint?: string; message?: string } | null
  return e?.hint === 'rate_limited' || /muitas consultas/i.test(e?.message ?? '')
}
