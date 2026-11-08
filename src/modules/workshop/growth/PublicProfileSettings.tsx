import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { CheckboxField, SelectField, TextAreaField, TextField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { translateDbError } from '@/core/shared/dbErrors'
import {
  WEEKDAYS, listPublicPhotos, parseBrands, publicPhotoUrls, removePublicPhoto, summarizeHours, updateProfileExtras, uploadPublicPhoto,
  validateHours, type WeeklyHours,
} from './api'

type Err = { code?: string; message?: string }
type Shop = {
  organization_id: string
  public_slug: string
  brands_served: string[]
  website_url: string | null
  weekly_hours: unknown
  show_services: boolean
  show_prices: boolean
  booking_enabled: boolean
  booking_slot_minutes: number
  booking_capacity: number
  booking_days_ahead: number
  booking_min_hours: number
}

const errText = (e: unknown) => (e instanceof Error && !(e as Err).code ? e.message : translateDbError(e as Err))

/** Perfil público avançado e agendamento pelo site (PRD 2.1 §18). Só o responsável vê esta página. */
export function PublicProfileSettings({ shop }: { shop: Shop }) {
  const qc = useQueryClient()
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['workshop', shop.organization_id] }), qc.invalidateQueries({ queryKey: ['public-workshop', shop.public_slug] })])
  return (
    <div className="mt-10 flex flex-col gap-8 border-t border-rule pt-8">
      <div>
        <h2 className="heading text-2xl text-ink">Perfil público</h2>
        <p className="mt-1 text-muted">O que o motociclista vê em <a href={`/oficinas/${shop.public_slug}`} target="_blank" rel="noreferrer" className="underline underline-offset-4">{window.location.host}/oficinas/{shop.public_slug}</a>.</p>
      </div>
      <Photos orgId={shop.organization_id} onChanged={refresh} />
      <ShowcaseForm shop={shop} onSaved={refresh} />
      <HoursAndBooking shop={shop} onSaved={refresh} />
    </div>
  )
}

function Photos({ orgId, onChanged }: { orgId: string; onChanged: () => Promise<unknown> }) {
  const qc = useQueryClient()
  const key = ['ws-public-photos', orgId]
  const q = useQuery({ queryKey: key, queryFn: () => listPublicPhotos(orgId) })
  const paths = (q.data ?? []).map((p) => p.path)
  const urls = useQuery({ queryKey: ['ws-public-photo-urls', paths.join('|')], queryFn: () => publicPhotoUrls(paths), enabled: paths.length > 0 })
  const [busy, setBusy] = useState<'logo' | 'photo' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const logoInput = useRef<HTMLInputElement>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const logo = (q.data ?? []).find((p) => p.kind === 'logo')
  const photos = (q.data ?? []).filter((p) => p.kind === 'photo')

  async function upload(files: FileList | null, kind: 'logo' | 'photo') {
    if (!files?.length) return
    setBusy(kind)
    setError(null)
    try {
      for (const f of Array.from(files).slice(0, kind === 'logo' ? 1 : 12)) await uploadPublicPhoto(orgId, f, kind)
    } catch (err) {
      setError(errText(err))
    } finally {
      setBusy(null)
      await Promise.all([qc.invalidateQueries({ queryKey: key }), onChanged()])
    }
  }
  async function remove(id: string) {
    setError(null)
    try { await removePublicPhoto(orgId, id); await Promise.all([qc.invalidateQueries({ queryKey: key }), onChanged()]) } catch (err) { setError(errText(err)) }
  }
  const u = urls.data ?? {}

  return (
    <section className="rounded-sheet border border-rule bg-sheet p-4 sm:p-5">
      <h3 className="heading text-lg text-ink">Logotipo e fotos</h3>
      <p className="mt-1 text-sm text-muted">Fachada, bancada, equipe trabalhando. Até 12 fotos (JPG, PNG ou WebP). Não use fotos com placas ou rostos de clientes sem autorização.</p>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-sheet border border-rule bg-white">
          {logo && u[logo.path] ? <img src={u[logo.path]} alt="Logotipo" className="h-full w-full object-contain" /> : <span className="text-xs text-muted">sem logo</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={logoInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { void upload(e.target.files, 'logo'); e.target.value = '' }} aria-label="Escolher logotipo" />
          <Button size="sm" variant="secondary" loading={busy === 'logo'} onClick={() => logoInput.current?.click()}>{logo ? 'Trocar logotipo' : 'Enviar logotipo'}</Button>
          {logo && <Button size="sm" variant="quiet" onClick={() => remove(logo.id)}>Remover</Button>}
        </div>
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {photos.map((p) => (
          <li key={p.id}>
            {u[p.path] ? <img src={u[p.path]} alt={p.caption ?? 'Foto da oficina'} className="aspect-[4/3] w-full rounded-doc border border-rule object-cover" /> : <div className="aspect-[4/3] rounded-doc border border-rule bg-paper" />}
            <Button size="sm" variant="quiet" onClick={() => remove(p.id)}>Remover</Button>
          </li>
        ))}
      </ul>
      <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => { void upload(e.target.files, 'photo'); e.target.value = '' }} aria-label="Escolher fotos" />
      {photos.length < 12 && <Button className="mt-3" size="sm" variant="secondary" loading={busy === 'photo'} onClick={() => photoInput.current?.click()}>Adicionar fotos</Button>}
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
    </section>
  )
}

function ShowcaseForm({ shop, onSaved }: { shop: Shop; onSaved: () => Promise<unknown> }) {
  const [brands, setBrands] = useState(shop.brands_served.join(', '))
  const [site, setSite] = useState(shop.website_url ?? '')
  const [services, setServices] = useState(shop.show_services)
  const [prices, setPrices] = useState(shop.show_prices)
  const [msg, setMsg] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  async function save() {
    const url = site.trim()
    if (url && !/^https:\/\/[^\s<>"]+$/.test(url)) return setMsg({ tone: 'error', text: 'O site precisa começar com https://' })
    setBusy(true)
    setMsg(null)
    try {
      await updateProfileExtras(shop.organization_id, { brands_served: parseBrands(brands), website_url: url || null, show_services: services, show_prices: services && prices })
      await onSaved()
      setMsg({ tone: 'success', text: 'Salvo.' })
    } catch (err) {
      setMsg({ tone: 'error', text: errText(err) })
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="rounded-sheet border border-rule bg-sheet p-4 sm:p-5">
      <h3 className="heading text-lg text-ink">Marcas, serviços e site</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <TextAreaField label="Marcas atendidas" value={brands} onChange={(e) => setBrands(e.target.value)} rows={2} hint="Separe por vírgula. Ex.: Honda, Yamaha, Suzuki" />
        <TextField label="Site ou Instagram (opcional)" value={site} onChange={(e) => setSite(e.target.value)} placeholder="https://instagram.com/suaoficina" />
        <CheckboxField label="Mostrar os serviços do catálogo no perfil" checked={services} onChange={(e) => setServices(e.target.checked)} />
        <CheckboxField label="Mostrar o valor padrão dos serviços de preço fixo" checked={services && prices} disabled={!services} onChange={(e) => setPrices(e.target.checked)} />
      </div>
      {msg && <div className="mt-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
      <Button className="mt-4" size="sm" loading={busy} onClick={save}>Salvar</Button>
    </section>
  )
}

const DEFAULT_HOURS: WeeklyHours = { '1': ['08:00', '18:00'], '2': ['08:00', '18:00'], '3': ['08:00', '18:00'], '4': ['08:00', '18:00'], '5': ['08:00', '18:00'], '6': ['08:00', '12:00'], '0': null }

function HoursAndBooking({ shop, onSaved }: { shop: Shop; onSaved: () => Promise<unknown> }) {
  const [hours, setHours] = useState<WeeklyHours>((shop.weekly_hours as WeeklyHours | null) ?? DEFAULT_HOURS)
  const [hasHours, setHasHours] = useState(Boolean(shop.weekly_hours))
  const [b, setB] = useState({ enabled: shop.booking_enabled, slot: String(shop.booking_slot_minutes), capacity: String(shop.booking_capacity),
    days: String(shop.booking_days_ahead), min: String(shop.booking_min_hours) })
  const [msg, setMsg] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  function setDay(k: keyof WeeklyHours, v: [string, string] | null) {
    setHasHours(true)
    setHours({ ...hours, [k]: v })
  }
  async function save() {
    const bad = hasHours ? validateHours(hours) : null
    if (bad) return setMsg({ tone: 'error', text: bad })
    if (b.enabled && !hasHours) return setMsg({ tone: 'error', text: 'Para receber agendamentos, preencha o horário de funcionamento.' })
    const n = (s: string, lo: number, hi: number) => /^\d+$/.test(s) && Number(s) >= lo && Number(s) <= hi
    if (!n(b.capacity, 1, 10)) return setMsg({ tone: 'error', text: 'Motos por horário: de 1 a 10.' })
    if (!n(b.days, 1, 90)) return setMsg({ tone: 'error', text: 'Antecedência máxima: de 1 a 90 dias.' })
    if (!n(b.min, 0, 72)) return setMsg({ tone: 'error', text: 'Antecedência mínima: de 0 a 72 horas.' })
    setBusy(true)
    setMsg(null)
    try {
      await updateProfileExtras(shop.organization_id, {
        weekly_hours: hasHours ? hours : null, booking_enabled: b.enabled, booking_slot_minutes: Number(b.slot), booking_capacity: Number(b.capacity),
        booking_days_ahead: Number(b.days), booking_min_hours: Number(b.min),
      })
      await onSaved()
      setMsg({ tone: 'success', text: b.enabled ? 'Salvo. O botão "Agendar horário" já aparece no perfil.' : 'Salvo.' })
    } catch (err) {
      setMsg({ tone: 'error', text: errText(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-sheet border border-rule bg-sheet p-4 sm:p-5">
      <h3 className="heading text-lg text-ink">Horário e agendamento pelo site</h3>
      <p className="mt-1 text-sm text-muted">O horário aparece no perfil e define os horários livres para o cliente pedir.</p>
      <ul className="mt-4 flex flex-col gap-2">
        {WEEKDAYS.map((d) => {
          const v = hours[d.key] ?? null
          return (
            <li key={d.key} className="grid grid-cols-[6.5rem_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[7rem_8rem_auto]">
              <label className="flex items-center gap-2 text-sm font-semibold text-ink">
                <input type="checkbox" className="h-4 w-4 accent-ink" checked={Boolean(v)} onChange={(e) => setDay(d.key, e.target.checked ? ['08:00', '18:00'] : null)} />
                {d.long}
              </label>
              {v ? (
                <span className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input type="time" aria-label={`${d.long}: abre`} value={v[0]} onChange={(e) => setDay(d.key, [e.target.value, v[1]])} className="rounded-doc border border-rule bg-white px-2 py-1.5" />
                  até
                  <input type="time" aria-label={`${d.long}: fecha`} value={v[1]} onChange={(e) => setDay(d.key, [v[0], e.target.value])} className="rounded-doc border border-rule bg-white px-2 py-1.5" />
                </span>
              ) : <span className="text-sm text-muted sm:col-span-2">fechado</span>}
            </li>
          )
        })}
      </ul>
      {hasHours && <p className="mt-2 text-xs text-muted">No perfil: {summarizeHours(hours)}</p>}

      <div className="mt-6 border-t border-rule pt-4">
        <CheckboxField label="Receber pedidos de agendamento pelo perfil público" checked={b.enabled} onChange={(e) => setB({ ...b, enabled: e.target.checked })} />
        {b.enabled && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SelectField label="Duração de cada horário" value={b.slot} options={['30', '60', '90', '120']} optionLabel={(o) => `${o} min`} onChange={(e) => setB({ ...b, slot: e.target.value })} />
            <TextField label="Motos por horário" value={b.capacity} onChange={(e) => setB({ ...b, capacity: e.target.value })} inputMode="numeric" />
            <TextField label="Até quantos dias à frente" value={b.days} onChange={(e) => setB({ ...b, days: e.target.value })} inputMode="numeric" />
            <TextField label="Antecedência mínima (horas)" value={b.min} onChange={(e) => setB({ ...b, min: e.target.value })} inputMode="numeric" />
          </div>
        )}
        <p className="mt-3 text-xs text-muted">O pedido entra na Agenda como "Solicitado" e a equipe recebe um aviso. Confirme com o cliente pelo WhatsApp.</p>
      </div>
      {msg && <div className="mt-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
      <Button className="mt-4" size="sm" loading={busy} onClick={save}>Salvar horário e agendamento</Button>
    </section>
  )
}
