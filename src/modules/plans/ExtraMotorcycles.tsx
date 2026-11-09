import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { formatPlanPrice } from './api'
import { fetchMotorcycleSlots, payExtraMotorcycles, premiumEndingSoon, setSubscriptionExtras } from './billingApi'

const PERIOD_UNIT: Record<string, string> = { monthly: 'mês', semiannual: 'semestre', annual: 'ano' }

export const useMotorcycleSlots = (enabled = true) =>
  useQuery({ queryKey: ['motorcycle-slots'], queryFn: fetchMotorcycleSlots, enabled, staleTime: 30_000 })

/** Escolha de quantas motos extras levar ao contratar (ADR-062). */
export function ExtrasPicker({ value, onChange, used, included = 2 }: { value: number; onChange: (n: number) => void; used: number; included?: number }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-doc border border-rule bg-paper px-4 py-3">
      <span className="text-sm text-graphite">
        O Premium inclui <strong className="text-ink">{included} motos</strong>. Motos a mais:
      </span>
      <span className="flex items-center gap-2">
        <button type="button" aria-label="Menos uma moto extra" disabled={value <= 0} onClick={() => onChange(value - 1)}
          className="h-10 w-10 rounded-doc border border-rule bg-sheet text-lg font-bold disabled:opacity-40">−</button>
        <strong className="w-8 text-center text-lg tabular-nums text-ink" aria-live="polite">{value}</strong>
        <button type="button" aria-label="Mais uma moto extra" disabled={value >= 50} onClick={() => onChange(value + 1)}
          className="h-10 w-10 rounded-doc border border-rule bg-sheet text-lg font-bold disabled:opacity-40">+</button>
      </span>
      {used > included + value && <span className="text-sm text-danger">Você tem {used} motos: com {included + value}, {used - included - value} fica{used - included - value === 1 ? '' : 'm'} só para leitura.</span>}
    </div>
  )
}

/** Card "Motos no plano": incluir ou tirar moto extra na assinatura, ou comprar moto extra no período Pix. */
export function ExtraMotorcyclesCard() {
  const qc = useQueryClient()
  const slots = useMotorcycleSlots()
  const [n, setN] = useState(1)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const s = slots.data
  if (!s) return null
  const unit = PERIOD_UNIT[s.billing_period ?? 'monthly'] ?? 'mês'
  const refresh = () => Promise.all(['motorcycle-slots', 'my-plan', 'my-subscription', 'my-passes'].map((k) => qc.invalidateQueries({ queryKey: [k] })))

  async function changeSub(extras: number) {
    setBusy(true)
    setMsg(null)
    try {
      const r = await setSubscriptionExtras(extras)
      setMsg({ tone: 'success', text: `Pronto: ${extras} moto${extras === 1 ? '' : 's'} extra${extras === 1 ? '' : 's'}. A assinatura passa a ${formatPlanPrice(r.price_cents)} por ${unit} a partir da próxima cobrança.` })
      await refresh()
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof Error ? e.message : 'Não foi possível mudar agora.' })
    }
    setBusy(false)
  }
  async function buyAddon() {
    setBusy(true)
    setMsg(null)
    try {
      window.location.assign(await payExtraMotorcycles(n))
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof Error ? e.message : 'Não foi possível abrir o pagamento.' })
      setBusy(false)
    }
  }

  return (
    <section className="mt-6 rounded-sheet border border-rule bg-sheet p-5" aria-labelledby="extra-title">
      <h2 id="extra-title" className="font-semibold text-ink">Motos no plano</h2>
      <p className="mt-1 text-sm text-graphite">
        {s.used} de {s.max} motos em uso{s.extras > 0 ? ` (${s.extras} extra${s.extras === 1 ? '' : 's'})` : ''}.
        {s.extra_cents > 0 && (s.mode === 'subscription' || s.mode === 'pass') ? ` Cada moto a mais: ${formatPlanPrice(s.extra_cents)} por ${s.mode === 'pass' ? 'mês' : unit}.` : ''}
      </p>
      {s.over_limit.length > 0 && (
        <div className="mt-3"><Notice tone="info">{s.over_limit.length} moto{s.over_limit.length === 1 ? ' passou' : 's passaram'} do limite do plano e {s.over_limit.length === 1 ? 'está' : 'estão'} só para leitura: continua{s.over_limit.length === 1 ? '' : 'm'} guardada{s.over_limit.length === 1 ? '' : 's'}, mas sem novos registros até você incluir moto extra.</Notice></div>
      )}
      {s.mode === 'subscription' && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" loading={busy} onClick={() => void changeSub(s.extras + 1)}>+ Incluir uma moto ({formatPlanPrice(s.extra_cents)}/{unit})</Button>
          {s.extras > 0 && <Button size="sm" variant="secondary" disabled={busy} onClick={() => void changeSub(s.extras - 1)}>Tirar uma moto extra</Button>}
        </div>
      )}
      {s.mode === 'pass' && s.pass_months_left && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2">
            <button type="button" aria-label="Menos" disabled={n <= 1} onClick={() => setN(n - 1)} className="h-10 w-10 rounded-doc border border-rule bg-paper font-bold disabled:opacity-40">−</button>
            <strong className="w-6 text-center tabular-nums">{n}</strong>
            <button type="button" aria-label="Mais" disabled={n >= 50} onClick={() => setN(n + 1)} className="h-10 w-10 rounded-doc border border-rule bg-paper font-bold">+</button>
          </span>
          <Button size="sm" loading={busy} onClick={() => void buyAddon()}>
            Incluir {n} moto{n === 1 ? '' : 's'} até o fim do período: {formatPlanPrice(n * s.extra_cents * s.pass_months_left)} no Pix
          </Button>
        </div>
      )}
      {(s.mode === 'free' || s.mode === 'grant') && (
        <p className="mt-2 text-sm text-muted">Ao contratar o Premium você escolhe quantas motos extras quer levar.</p>
      )}
      {msg && <div className="mt-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
    </section>
  )
}

/** Aviso no painel: o Premium com prazo está acabando e há motos além do plano grátis (KI-052). */
export function PremiumEndingNotice() {
  const slots = useMotorcycleSlots()
  const soon = slots.data ? premiumEndingSoon(slots.data) : null
  if (!soon) return null
  const when = soon.days === 0 ? 'hoje' : soon.days === 1 ? 'amanhã' : `em ${soon.days} dias`
  return (
    <div className="mb-6">
      <Notice tone="info">
        Seu Premium termina {when}. Depois disso, {soon.extraMotos === 1 ? '1 moto fica' : `${soon.extraMotos} motos ficam`} só para leitura
        (nada é apagado). <Link to="/painel/plano" className="font-semibold underline underline-offset-4">Ver planos</Link>
      </Notice>
    </div>
  )
}
