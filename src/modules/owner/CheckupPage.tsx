import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, ButtonLink } from '@/components/Button'
import { SelectField, TextField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { translateDbError } from '@/core/shared/dbErrors'
import { formatKm, todayISO } from '@/core/shared/format'
import { recordMileage } from '@/modules/motorcycles/api'
import { daysSince, fetchCare, markCareDone, OIL_SUGGESTED_KM, setCare, type CareStatus } from '@/modules/motorcycles/careApi'

const err = (e: unknown) => translateDbError(e as { code?: string; message?: string })
const intOf = (v: string) => (v.trim() === '' ? null : Number(v.replace(/\D/g, '')))
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—')

function Card({ title, tone = 'normal', children }: { title: string; tone?: 'normal' | 'warn' | 'danger' | 'ok'; children: React.ReactNode }) {
  const border = tone === 'danger' ? 'border-danger' : tone === 'warn' ? 'border-brass' : tone === 'ok' ? 'border-rule' : 'border-rule'
  return (
    <section className={`rounded-sheet border-2 ${border} bg-sheet p-5`} aria-label={title}>
      <h2 className="font-semibold text-ink">{title}</h2>
      <div className="mt-3 text-sm text-graphite">{children}</div>
    </section>
  )
}

function KmCard({ motoId, care, onSaved }: { motoId: string; care: CareStatus; onSaved: () => Promise<unknown> }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const days = daysSince(care.km_updated_at)
  const save = useMutation({
    mutationFn: (km: number) => recordMileage(motoId, { mileage: km, recordedAt: todayISO(), note: undefined, correctsRecordId: undefined }),
    onSuccess: async (r) => {
      setDone(true)
      setValue('')
      setError(r.below_previous ? 'Registrado, mas ficou abaixo da última leitura. Se foi engano, corrija na página da moto.' : null)
      await onSaved()
    },
    onError: (e) => setError(err(e)),
  })
  function submit(e: FormEvent) {
    e.preventDefault()
    const km = intOf(value)
    if (km === null || Number.isNaN(km) || km > 2_000_000) return setError('Informe o km que aparece no painel da moto.')
    setError(null)
    save.mutate(km)
  }
  const stale = days === null || days >= 6
  return (
    <Card title="1. Quilometragem" tone={stale && !done ? 'warn' : 'normal'}>
      <p>
        Última leitura: <strong className="text-ink">{formatKm(care.current_km)}</strong>
        {days !== null && <> · {days === 0 ? 'hoje' : days === 1 ? 'ontem' : `há ${days} dias`}</>}
      </p>
      {done && <div className="mt-3"><Notice tone="success">Km atualizado.</Notice></div>}
      <form onSubmit={submit} noValidate className="mt-3 flex flex-wrap items-end gap-3" aria-label="Atualizar quilometragem">
        <TextField label="Km agora" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Ex.: 19800" className="w-44" error={error ?? undefined} />
        <Button type="submit" loading={save.isPending}>Salvar km</Button>
      </form>
    </Card>
  )
}

function OilCard({ motoId, care, onChange }: { motoId: string; care: CareStatus; onChange: (c: CareStatus) => void }) {
  const o = care.oil
  const [editing, setEditing] = useState(!o.configured)
  const [interval, setInterval] = useState(String(o.configured ? o.interval_km : OIL_SUGGESTED_KM))
  const [lastKm, setLastKm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: () => setCare(motoId, 'oil_change', intOf(interval), true, intOf(lastKm)),
    onSuccess: (c) => {
      onChange(c)
      setEditing(false)
      setLastKm('')
      setError(null)
    },
    onError: (e) => setError(err(e)),
  })
  const done = useMutation({ mutationFn: () => markCareDone(motoId, 'oil_change'), onSuccess: onChange, onError: (e) => setError(err(e)) })
  const tone = o.status === 'due' ? 'danger' : o.status === 'soon' ? 'warn' : 'normal'
  return (
    <Card title="2. Troca de óleo" tone={o.configured ? tone : 'warn'}>
      {o.configured && o.km_left !== null && (
        <p className={`text-base font-semibold ${o.status === 'due' ? 'text-danger' : 'text-ink'}`}>
          {o.status === 'due' ? `Vencida há ${formatKm(Math.abs(o.km_left))}` : `Faltam ${formatKm(o.km_left)}`}
        </p>
      )}
      {o.configured && (
        <p className="mt-1">
          A cada {formatKm(o.interval_km)} · última troca aos {formatKm(o.last_change_km)}
          {o.last_change_from === 'history' && o.last_change_date ? ` (histórico, ${new Date(`${o.last_change_date}T12:00:00`).toLocaleDateString('pt-BR')})` : ''}
          {o.last_change_from === 'first_reading' ? ' (primeira leitura da moto; informe a real abaixo)' : ''}
          {' '}· próxima aos {formatKm(o.next_km)}. Avisamos {formatKm(o.soon_before)} antes.
        </p>
      )}
      {!o.configured && <p>Diga de quantos em quantos km você troca o óleo para avisarmos {formatKm(o.soon_before)} antes.</p>}
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      {editing ? (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <TextField label="Trocar a cada (km)" inputMode="numeric" value={interval} onChange={(e) => setInterval(e.target.value)} className="w-40"
            hint={`Sugestão: ${formatKm(OIL_SUGGESTED_KM)}. Confira o manual da moto.`} />
          <TextField label="Km da última troca (opcional)" inputMode="numeric" value={lastKm} onChange={(e) => setLastKm(e.target.value)} className="w-48" />
          <Button loading={save.isPending} onClick={() => save.mutate()}>Salvar</Button>
          {o.configured && <Button variant="quiet" onClick={() => setEditing(false)}>Cancelar</Button>}
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <ButtonLink to={`/painel/motos/${motoId}/historico/novo?categoria=oil_change`} size="sm">Registrar troca de óleo</ButtonLink>
          <Button size="sm" variant="secondary" loading={done.isPending} onClick={() => done.mutate()}>Já troquei (sem registrar)</Button>
          <Button size="sm" variant="quiet" onClick={() => setEditing(true)}>Mudar intervalo</Button>
        </div>
      )}
      <p className="mt-3 text-xs text-muted">Registrando a troca no histórico, a contagem recomeça sozinha e o serviço vale como comprovante na venda.</p>
    </Card>
  )
}

function ChainCard({ motoId, care, onChange }: { motoId: string; care: CareStatus; onChange: (c: CareStatus) => void }) {
  const c = care.chain
  const [error, setError] = useState<string | null>(null)
  const done = useMutation({ mutationFn: () => markCareDone(motoId, 'chain_check'), onSuccess: onChange, onError: (e) => setError(err(e)) })
  const freq = useMutation({
    mutationFn: (v: string) => (v === 'off' ? setCare(motoId, 'chain_check', null, false) : setCare(motoId, 'chain_check', Number(v), true)),
    onSuccess: onChange,
    onError: (e) => setError(err(e)),
  })
  return (
    <Card title="3. Corrente: folga e lubrificação" tone={c.enabled && c.due ? 'warn' : 'normal'}>
      {!c.enabled && <p>Lembrete desligado.</p>}
      {c.enabled && (
        <p>
          {c.last_done_at ? `Última conferência: ${date(c.last_done_at)}.` : 'Ainda não conferida aqui.'}
          {c.due ? ' Confira a folga e lubrifique a corrente.' : c.next_at ? ` Próxima: ${date(c.next_at)}.` : ''}
        </p>
      )}
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      <div className="mt-3 flex flex-wrap items-end gap-3">
        {c.enabled && <Button size="sm" loading={done.isPending} onClick={() => done.mutate()}>Conferi e lubrifiquei</Button>}
        <SelectField label="Lembrar" className="w-44" value={c.enabled ? String(c.interval_days) : 'off'} disabled={freq.isPending}
          onChange={(e) => freq.mutate(e.target.value)} options={['7', '15', 'off']}
          optionLabel={(v) => (v === '7' ? 'Toda semana' : v === '15' ? 'A cada 15 dias' : 'Desligado')} />
      </div>
    </Card>
  )
}

/** Check-up da moto: km, óleo e corrente numa tela só (aberta pelo aviso de sábado). */
export function CheckupPage() {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const care = useQuery({ queryKey: ['care', id], queryFn: () => fetchCare(id) })
  const set = (c: CareStatus) => qc.setQueryData(['care', id], c)
  const refetchAll = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['care', id] }),
      qc.invalidateQueries({ queryKey: ['mileage', id] }),
      qc.invalidateQueries({ queryKey: ['motorcycle', id] }),
      qc.invalidateQueries({ queryKey: ['my-motorcycles'] }),
    ])
  return (
    <div>
      <Link to={`/painel/motos/${id}`} className="text-sm text-ink underline underline-offset-4">Voltar à moto</Link>
      <h1 className="heading mt-3 text-3xl text-ink">Check-up da moto</h1>
      <p className="mt-1 max-w-2xl text-muted">Dois minutos por semana. Todo sábado às 10h avisamos no celular o que estiver pendente.</p>
      {care.isLoading && <p className="mt-6 text-muted" role="status">Carregando…</p>}
      {care.isError && <div className="mt-6"><Notice tone="error">Não foi possível carregar o check-up desta moto.</Notice></div>}
      {care.data && (
        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          <KmCard motoId={id} care={care.data} onSaved={refetchAll} />
          <OilCard motoId={id} care={care.data} onChange={set} />
          <ChainCard motoId={id} care={care.data} onChange={set} />
        </div>
      )}
    </div>
  )
}
