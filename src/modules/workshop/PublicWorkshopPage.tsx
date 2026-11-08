import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { CheckboxField, TextAreaField, TextField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { translateDbError } from '@/core/shared/dbErrors'
import { CATEGORY_LABEL, type ServiceCategory } from './service-catalog/api'
import { formatCents, formatPhone, onlyDigits } from './shared/rpc'
import {
  WEEKDAYS, fetchBookingSlots, fetchPublicWorkshop, nextDays, publicPhotoUrls, requestAppointment, stars, summarizeHours, type PublicWorkshop,
} from './growth/api'

type Err = { code?: string; message?: string }
const waLink = (digits: string) => `https://wa.me/${digits.startsWith('55') ? digits : `55${digits}`}`

/**
 * Perfil público da oficina (PRD 6.1 e PRD 2.1 §18). Mostra só dados comerciais: nunca CNPJ, razão social,
 * responsável, funcionários nem clientes. Participação na rede não é certificação técnica (PRD 6.7).
 */
export function PublicWorkshopPage() {
  const { slug = '' } = useParams()
  const shop = useQuery({ queryKey: ['public-workshop', slug], queryFn: () => fetchPublicWorkshop(slug), retry: false, staleTime: 5 * 60_000 })
  const paths = shop.data ? [shop.data.logo_path, ...shop.data.photos.map((p) => p.path)].filter((x): x is string => Boolean(x)) : []
  const urls = useQuery({ queryKey: ['public-workshop-photos', slug, paths.join('|')], queryFn: () => publicPhotoUrls(paths), enabled: paths.length > 0, staleTime: 50 * 60_000 })

  if (shop.isLoading) return <p className="mx-auto max-w-5xl px-5 py-16 text-muted" role="status">Carregando…</p>
  if (shop.isError || !shop.data) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16">
        <h1 className="heading text-3xl text-ink">Oficina não encontrada</h1>
        <p className="mt-3 text-muted">{shop.isError ? translateDbError(shop.error as Err) : 'O endereço pode estar errado ou o perfil não está público.'}</p>
        <Link to="/" className="mt-6 inline-block font-semibold text-ink underline underline-offset-4">Ir para o início</Link>
      </div>
    )
  }

  const w = shop.data
  const u = urls.data ?? {}
  const whats = w.whatsapp ? onlyDigits(w.whatsapp) : null
  const hours = summarizeHours(w.weekly_hours) || w.opening_hours

  return (
    <div className="mx-auto max-w-5xl px-5 py-10 sm:py-12">
      <div className="flex flex-wrap items-start gap-5">
        {w.logo_path && u[w.logo_path] && (
          <img src={u[w.logo_path]} alt={`Logotipo da ${w.business_name}`} className="h-20 w-20 shrink-0 rounded-sheet border border-rule bg-white object-contain sm:h-24 sm:w-24" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-stamp">Oficina participante Moto Passaporte{w.verification_status === 'verified' ? ' · cadastro verificado' : ''}</p>
          <h1 className="display mt-1 text-3xl text-ink sm:text-4xl">{w.business_name}</h1>
          {(w.city || w.state) && <p className="mt-1 text-lg text-muted">{[w.city, w.state].filter(Boolean).join(', ')}</p>}
          {w.rating.count > 0 && (
            <a href="#avaliacoes" className="mt-2 inline-flex items-center gap-2 text-ink">
              <span className="text-lg tracking-wide text-amber-600" aria-hidden>{stars(w.rating.average ?? 0)}</span>
              <span className="font-semibold">{String(w.rating.average).replace('.', ',')}</span>
              <span className="text-muted underline underline-offset-4">{w.rating.count} avaliaç{w.rating.count === 1 ? 'ão' : 'ões'}</span>
            </a>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {w.booking && <a href="#agendar" className="inline-flex items-center rounded-doc bg-ink px-5 py-3 font-semibold text-sheet hover:bg-ink-soft">Agendar horário</a>}
        {whats && <a href={waLink(whats)} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-doc border border-ink/30 px-5 py-3 font-semibold text-ink hover:border-ink">WhatsApp</a>}
        {w.phone && <a href={`tel:${onlyDigits(w.phone)}`} className="inline-flex items-center rounded-doc border border-ink/30 px-5 py-3 font-semibold text-ink hover:border-ink">Ligar</a>}
      </div>

      {w.photos.length > 0 && (
        <ul className="-mx-5 mt-8 flex snap-x gap-3 overflow-x-auto px-5 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-4" aria-label="Fotos da oficina">
          {w.photos.map((p) => (
            <li key={p.path} className="w-64 shrink-0 snap-start sm:w-auto">
              {u[p.path] ? <img src={u[p.path]} alt={p.caption ?? `Foto da ${w.business_name}`} loading="lazy" className="aspect-[4/3] w-full rounded-sheet border border-rule object-cover" />
                : <div className="aspect-[4/3] w-full rounded-sheet border border-rule bg-paper" />}
              {p.caption && <p className="mt-1 text-sm text-muted">{p.caption}</p>}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          {w.description && <p className="max-w-[68ch] whitespace-pre-line text-graphite">{w.description}</p>}

          {(w.specialties.length > 0 || w.brands_served.length > 0) && (
            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              {w.specialties.length > 0 && <Chips title="Especialidades" items={w.specialties} />}
              {w.brands_served.length > 0 && <Chips title="Marcas atendidas" items={w.brands_served} />}
            </div>
          )}

          {w.services.length > 0 && <Services w={w} />}

          {w.booking && <div id="agendar" className="mt-10 scroll-mt-6"><Booking slug={w.public_slug} w={w} /></div>}

          <section id="avaliacoes" className="mt-10 scroll-mt-6">
            <h2 className="heading text-2xl text-ink">Avaliações</h2>
            <p className="mt-1 text-sm text-muted">Só clientes com serviço concluído nesta oficina podem avaliar, pelo comprovante que recebem.</p>
            {w.reviews.length === 0 ? <p className="mt-4 text-muted">Ainda sem avaliações.</p> : (
              <ul className="mt-4 flex flex-col gap-4">
                {w.reviews.map((r, i) => (
                  <li key={i} className="rounded-sheet border border-rule bg-sheet p-4">
                    <p className="flex flex-wrap items-center gap-x-3"><span className="tracking-wide text-amber-600" aria-label={`${r.rating} de 5`}>{stars(r.rating)}</span>
                      <span className="font-semibold text-ink">{r.display_name}</span>
                      <span className="text-sm text-muted">{new Date(r.created_at).toLocaleDateString('pt-BR')}</span></p>
                    {r.comment && <p className="mt-2 whitespace-pre-line text-graphite">{r.comment}</p>}
                    {r.reply && <div className="mt-3 border-l-2 border-rule pl-3 text-sm"><p className="font-semibold text-ink">Resposta da oficina</p><p className="whitespace-pre-line text-graphite">{r.reply}</p></div>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <dl className="divide-y divide-rule rounded-sheet border border-rule bg-sheet px-4">
            {w.address && <Row label="Endereço"><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([w.address, w.city, w.state].filter(Boolean).join(', '))}`} target="_blank" rel="noreferrer" className="underline underline-offset-4">{w.address}</a></Row>}
            {w.weekly_hours ? (
              <Row label="Horário">
                <ul className="text-sm">
                  {WEEKDAYS.map((d) => { const v = w.weekly_hours?.[d.key]; return <li key={d.key} className="flex justify-between gap-3"><span>{d.long}</span><span className="tabular-nums">{v ? `${v[0]}–${v[1]}` : 'fechado'}</span></li> })}
                </ul>
              </Row>
            ) : hours && <Row label="Horário">{hours}</Row>}
            {w.phone && <Row label="Telefone"><a href={`tel:${onlyDigits(w.phone)}`} className="underline underline-offset-4">{formatPhone(w.phone.replace(/^55(?=\d{10,11}$)/, ''))}</a></Row>}
            {whats && <Row label="WhatsApp"><a href={waLink(whats)} target="_blank" rel="noreferrer" className="underline underline-offset-4">{formatPhone(whats.replace(/^55(?=\d{10,11}$)/, ''))}</a></Row>}
            {w.email && <Row label="E-mail"><a href={`mailto:${w.email}`} className="break-all underline underline-offset-4">{w.email}</a></Row>}
            {w.website_url && <Row label="Site"><a href={w.website_url} target="_blank" rel="noreferrer nofollow" className="break-all underline underline-offset-4">{w.website_url.replace(/^https:\/\//, '')}</a></Row>}
          </dl>
          <p className="mt-4 text-sm text-muted">
            "Oficina participante" indica que a oficina usa o Moto Passaporte. Não é certificação técnica nem garantia dos serviços.
          </p>
        </aside>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="py-3"><dt className="text-sm text-muted">{label}</dt><dd className="mt-0.5 font-semibold text-ink">{children}</dd></div>
}

function Chips({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">{title}</h2>
      <ul className="mt-2 flex flex-wrap gap-2">
        {items.map((s) => <li key={s} className="rounded-doc border border-ink/30 bg-sheet px-2.5 py-1 text-sm font-semibold text-ink">{s}</li>)}
      </ul>
    </div>
  )
}

function Services({ w }: { w: PublicWorkshop }) {
  const anyPrice = w.services.some((s) => s.price_cents != null)
  return (
    <section className="mt-10">
      <h2 className="heading text-2xl text-ink">Serviços</h2>
      <ul className="mt-3 divide-y divide-rule border-y border-rule">
        {w.services.map((s) => (
          <li key={s.name} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
            <span><span className="font-semibold text-ink">{s.name}</span>
              <span className="text-sm text-muted"> · {CATEGORY_LABEL[s.category as ServiceCategory] ?? s.category}{s.estimated_minutes ? ` · ~${s.estimated_minutes} min` : ''}</span></span>
            {s.price_cents != null && <span className="tabular-nums text-graphite">{formatCents(s.price_cents)}</span>}
          </li>
        ))}
      </ul>
      {anyPrice && <p className="mt-2 text-xs text-muted">Valores de referência; o preço final depende da moto e é confirmado no orçamento.</p>}
    </section>
  )
}

function Booking({ slug, w }: { slug: string; w: PublicWorkshop }) {
  const days = nextDays(w.booking?.days_ahead ?? 30)
  const [date, setDate] = useState(days[0] ?? '')
  const [time, setTime] = useState('')
  const [v, setV] = useState({ name: '', whatsapp: '', vehicle: '', service: '', consent: false })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ starts_at: string } | null>(null)
  const slots = useQuery({ queryKey: ['public-slots', slug, date], queryFn: () => fetchBookingSlots(slug, date), enabled: Boolean(date) && !done, staleTime: 30_000 })

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!time) return setError('Escolha um horário.')
    if (v.name.trim().length < 2) return setError('Informe seu nome.')
    if (!/^\d{10,13}$/.test(onlyDigits(v.whatsapp))) return setError('Informe seu WhatsApp com DDD.')
    if (v.service.trim().length < 3) return setError('Conte o que a moto precisa.')
    if (!v.consent) return setError('Marque a autorização para a oficina falar com você.')
    setBusy(true)
    setError(null)
    try {
      const r = await requestAppointment(slug, { date, time, ...v })
      setDone({ starts_at: r.starts_at })
    } catch (err) {
      setError(translateDbError(err as Err))
      setTime('')
      await slots.refetch()
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <Notice tone="success" title="Pedido enviado">
        Você pediu {new Date(done.starts_at).toLocaleString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.
        A {w.business_name} vai confirmar pelo WhatsApp. O horário só está garantido depois da confirmação.
      </Notice>
    )
  }

  const label = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
  return (
    <section className="rounded-sheet border border-rule bg-sheet p-4 sm:p-6">
      <h2 className="heading text-2xl text-ink">Agendar horário</h2>
      <p className="mt-1 text-sm text-muted">Escolha o dia e o horário. A oficina confirma pelo WhatsApp.</p>
      <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-4">
        <div>
          <p className="text-sm font-semibold text-graphite">Dia</p>
          <div className="-mx-1 mt-1.5 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Dia">
            {days.map((d) => (
              <button key={d} type="button" aria-pressed={date === d} onClick={() => { setDate(d); setTime('') }}
                className={`shrink-0 rounded-doc border px-3 py-2 text-sm font-semibold capitalize ${date === d ? 'border-ink bg-ink text-sheet' : 'border-rule text-ink hover:border-ink'}`}>
                {label(d)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold text-graphite">Horário</p>
          {slots.isLoading ? <p className="mt-1.5 text-sm text-muted" role="status">Buscando horários…</p>
            : (slots.data ?? []).length === 0 ? <p className="mt-1.5 text-sm text-muted">Sem horários livres neste dia. Escolha outro.</p> : (
              <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="Horário">
                {(slots.data ?? []).map((t) => (
                  <button key={t} type="button" aria-pressed={time === t} onClick={() => setTime(t)}
                    className={`rounded-doc border px-3 py-2 text-sm font-semibold tabular-nums ${time === t ? 'border-ink bg-ink text-sheet' : 'border-rule text-ink hover:border-ink'}`}>{t}</button>
                ))}
              </div>
            )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Seu nome" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} autoComplete="name" />
          <TextField label="WhatsApp" value={v.whatsapp} onChange={(e) => setV({ ...v, whatsapp: e.target.value })} inputMode="tel" autoComplete="tel" placeholder="(17) 99999-1234" />
          <TextField label="Moto (opcional)" value={v.vehicle} onChange={(e) => setV({ ...v, vehicle: e.target.value })} placeholder="Honda CG 160 2022" className="sm:col-span-2" />
          <TextAreaField label="O que a moto precisa" value={v.service} onChange={(e) => setV({ ...v, service: e.target.value })} rows={2} maxLength={300} className="sm:col-span-2" />
        </div>
        <CheckboxField checked={v.consent} onChange={(e) => setV({ ...v, consent: e.target.checked })}
          label={`Autorizo a ${w.business_name} a usar meu nome e WhatsApp para confirmar este horário.`} />
        {error && <Notice tone="error">{error}</Notice>}
        <div><Button type="submit" loading={busy}>Pedir horário</Button></div>
        <p className="text-xs text-muted">Seus dados vão só para a oficina, para tratar este agendamento. Não precisa criar conta.</p>
      </form>
    </section>
  )
}
