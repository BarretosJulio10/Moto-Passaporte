import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { CheckboxField, SelectField, TextAreaField, TextField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { PageHeader } from '@/components/AppLayout'
import { translateDbError } from '@/core/shared/dbErrors'
import { formatPlate, normalizePlate } from '@/core/shared/format'
import { listCustomers, listVehicles, saveCustomer, saveVehicle, type CustomerRow, type VehicleRow } from '../customers/api'
import { createEntry, ENTRY_ITEMS, FUEL_LEVELS, saveInspection, type InspectionItems } from '../service-orders/api'
import { ChecklistItemsEditor } from '../service-orders/InspectionAndPhotos'
import { onlyDigits } from '../shared/rpc'
import { entryPhoneProblem, entryPlateProblem } from './entryValidation'
import { WorkshopShell, type WorkshopContext } from '../shared/WorkshopShell'

const errText = (e: unknown) => (e instanceof Error && !(e as { code?: string }).code ? e.message : translateDbError(e as { code?: string; message?: string }))

/** /oficina/:orgId/entrada/nova — primeiro passo do atendimento: a moto entra (ADR-060). */
export function NewEntryPage() {
  return <WorkshopShell>{(ctx) => <NewEntry {...ctx} />}</WorkshopShell>
}

type Picked = { customerId: string; customerName: string; vehicleId: string; label: string; plate: string | null; km: number | null }

function NewEntry({ orgId, perms }: WorkshopContext) {
  const navigate = useNavigate()
  const [picked, setPicked] = useState<Picked | null>(null)
  const base = `/oficina/${orgId}`

  if (!perms.manage_quotes) {
    return <Notice tone="info">Seu acesso não inclui dar entrada em motos. Fale com o responsável da oficina.</Notice>
  }
  return (
    <div className="max-w-3xl">
      <Link to={base} className="text-sm text-muted underline underline-offset-4">Esteira</Link>
      <div className="mt-2">
        <PageHeader title="Nova entrada" intro="O cliente está deixando a moto: ache pela placa (ou cadastre na hora), anote km, o problema e faça o checklist de entrada na frente dele." />
      </div>
      <ol className="mt-4 flex flex-wrap gap-2 text-sm font-semibold" aria-label="Passos">
        <li className={`rounded-full border px-3 py-1 ${picked ? 'border-ok bg-ok/10 text-ok' : 'border-ink bg-ink text-sheet'}`}>1. Moto e cliente{picked ? ' ✓' : ''}</li>
        <li className={`rounded-full border px-3 py-1 ${picked ? 'border-ink bg-ink text-sheet' : 'border-rule text-muted'}`}>2. Km, problema e checklist de entrada</li>
        <li className="rounded-full border border-rule px-3 py-1 text-muted">3. Fotos e ciência do cliente</li>
      </ol>
      <div className="mt-6">
        {picked
          ? <EntryDetails orgId={orgId} picked={picked} onBack={() => setPicked(null)} onDone={(id) => navigate(`${base}/os/${id}`, { state: { entryCreated: true } })} />
          : <PickVehicle orgId={orgId} onPick={setPicked} />}
      </div>
    </div>
  )
}

function PickVehicle({ orgId, onPick }: { orgId: string; onPick: (p: Picked) => void }) {
  const [term, setTerm] = useState('')
  const [creating, setCreating] = useState(false)
  const search = term.trim()
  const found = useQuery({ queryKey: ['entry-vehicles', orgId, search], queryFn: () => listVehicles(orgId, search), enabled: search.length >= 2 })
  const pick = (v: VehicleRow) => onPick({
    customerId: v.customer_id, customerName: v.customer_name, vehicleId: v.id,
    label: [v.brand, v.model, v.year].filter(Boolean).join(' '), plate: v.plate, km: v.km ?? null,
  })
  if (creating) return <QuickCreate orgId={orgId} initialPlate={normalizePlate(search).length >= 7 ? normalizePlate(search) : ''} onCancel={() => setCreating(false)} onCreated={onPick} />
  return (
    <section aria-labelledby="pick-title">
      <h2 id="pick-title" className="heading text-xl text-ink">Qual moto?</h2>
      <TextField label="Placa, modelo ou nome do cliente" value={term} onChange={(e) => setTerm(e.target.value)} autoFocus
        autoCapitalize="characters" autoComplete="off" className="text-lg" />
      {found.isFetching && <p className="mt-2 text-sm text-muted" role="status">Buscando…</p>}
      {search.length >= 2 && found.data && (
        <ul className="mt-3 divide-y divide-rule rounded-doc border border-rule bg-sheet">
          {found.data.filter((v) => v.status === 'active').slice(0, 8).map((v) => (
            <li key={v.id}>
              <button type="button" onClick={() => pick(v)} className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-paper">
                <span className="w-28 shrink-0 font-mono text-lg font-bold tracking-wider text-ink">{v.plate ? formatPlate(v.plate) : '—'}</span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-ink">{[v.brand, v.model, v.year].filter(Boolean).join(' ')}</span>
                  <span className="block truncate text-sm text-muted">{v.customer_name}</span>
                </span>
                <span aria-hidden="true" className="ml-auto text-muted">›</span>
              </button>
            </li>
          ))}
          {found.data.length === 0 && <li className="px-4 py-3 text-sm text-muted">Nenhuma moto encontrada.</li>}
        </ul>
      )}
      <div className="mt-4">
        <Button variant="secondary" onClick={() => setCreating(true)}>Moto ou cliente novo: cadastrar agora</Button>
      </div>
    </section>
  )
}

function QuickCreate({ orgId, initialPlate, onCancel, onCreated }: { orgId: string; initialPlate: string; onCancel: () => void; onCreated: (p: Picked) => void }) {
  const [customer, setCustomer] = useState<CustomerRow | null>(null)
  const [custTerm, setCustTerm] = useState('')
  const [name, setName] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [plate, setPlate] = useState(initialPlate)
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [year, setYear] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // Cliente já criado numa tentativa anterior (a moto falhou): não cadastra de novo.
  const [createdCustomerId, setCreatedCustomerId] = useState<string | null>(null)
  const custs = useQuery({ queryKey: ['entry-customers', orgId, custTerm], queryFn: () => listCustomers(orgId, custTerm), enabled: !customer && custTerm.trim().length >= 2 })

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!customer && name.trim().length < 3) return setError('Informe o nome do cliente.')
    const phoneProblem = customer ? null : entryPhoneProblem(whatsapp)
    if (phoneProblem) return setError(phoneProblem)
    if (!brand.trim() || !model.trim()) return setError('Informe marca e modelo da moto.')
    const plateProblem = entryPlateProblem(plate)
    if (plateProblem) return setError(plateProblem)
    const y = onlyDigits(year)
    if (y && (Number(y) < 1900 || Number(y) > new Date().getFullYear() + 1)) return setError('Confira o ano da moto.')
    setBusy(true)
    try {
      let customerId = customer?.id ?? createdCustomerId
      if (!customerId) {
        customerId = await saveCustomer(orgId, null, { full_name: name.trim(), whatsapp: onlyDigits(whatsapp), source: 'balcao' })
        setCreatedCustomerId(customerId)
      }
      const vehicleId = await saveVehicle(orgId, null, customerId, { brand: brand.trim(), model: model.trim(), year: onlyDigits(year), plate: normalizePlate(plate) })
      onCreated({ customerId, customerName: customer?.full_name ?? name.trim(), vehicleId, label: [brand, model, year].filter(Boolean).join(' '), plate: normalizePlate(plate) || null, km: null })
    } catch (err) {
      setError(errText(err))
      setBusy(false)
    }
  }

  return (
    <form noValidate onSubmit={submit} className="space-y-5">
      <section className="rounded-doc border border-rule bg-sheet p-4">
        <h2 className="heading text-lg text-ink">Cliente</h2>
        {customer ? (
          <p className="mt-2 flex flex-wrap items-center gap-3 text-graphite">
            <strong className="text-ink">{customer.full_name}</strong> (já cadastrado)
            <button type="button" className="text-sm font-semibold underline" onClick={() => setCustomer(null)}>trocar</button>
          </p>
        ) : (
          <div className="mt-2 space-y-3">
            <TextField label="Já é cliente? Busque pelo nome ou telefone" value={custTerm} onChange={(e) => setCustTerm(e.target.value)} autoComplete="off" />
            {custs.data && custs.data.length > 0 && (
              <ul className="divide-y divide-rule rounded-doc border border-rule">
                {custs.data.slice(0, 5).map((c) => (
                  <li key={c.id}><button type="button" onClick={() => setCustomer(c)} className="w-full px-3 py-2 text-left hover:bg-paper">
                    <span className="font-semibold text-ink">{c.full_name}</span> <span className="text-sm text-muted">{c.whatsapp ?? c.phone ?? ''}</span>
                  </button></li>
                ))}
              </ul>
            )}
            <p className="text-sm text-muted">Ou cadastre agora:</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Nome do cliente" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
              <TextField label="WhatsApp" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} inputMode="tel" autoComplete="off" />
            </div>
          </div>
        )}
      </section>
      <section className="rounded-doc border border-rule bg-sheet p-4">
        <h2 className="heading text-lg text-ink">Moto</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <TextField label="Placa" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" />
          <TextField label="Ano" value={year} onChange={(e) => setYear(onlyDigits(e.target.value).slice(0, 4))} inputMode="numeric" />
          <TextField label="Marca" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Ex.: Honda" />
          <TextField label="Modelo" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Ex.: CG 160 Fan" />
        </div>
      </section>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={busy}>Continuar</Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>Voltar para a busca</Button>
      </div>
    </form>
  )
}

function EntryDetails({ orgId, picked, onBack, onDone }: { orgId: string; picked: Picked; onBack: () => void; onDone: (orderId: string) => void }) {
  const [km, setKm] = useState('')
  const [problem, setProblem] = useState('')
  const [due, setDue] = useState('')
  const [toDiagnosis, setToDiagnosis] = useState(true)
  const [items, setItems] = useState<InspectionItems>({})
  const [fuel, setFuel] = useState('')
  const [keys, setKeys] = useState('')
  const [checkNotes, setCheckNotes] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const kmNum = km ? Number(onlyDigits(km)) : null
    if (kmNum !== null && picked.km !== null && kmNum < picked.km) return setError(`A km informada é menor que a última registrada (${picked.km.toLocaleString('pt-BR')}).`)
    if (problem.trim().length < 3) return setError('Escreva o problema que o cliente relatou.')
    const missing = ENTRY_ITEMS.filter((it) => !items[it.key]).length
    if (missing > 0) return setError(`Faltam ${missing} item${missing === 1 ? '' : 's'} do checklist de entrada. Use "Tudo OK" e marque só o que tiver problema.`)
    setBusy(true)
    try {
      const id = await createEntry(orgId, { customer: picked.customerId, vehicle: picked.vehicleId, km: kmNum, problem: problem.trim(), due: due || null, toDiagnosis })
      try {
        await saveInspection(orgId, id, 'entry', { items, fuel_level: fuel, keys_count: keys, km: kmNum !== null ? String(kmNum) : '', notes: checkNotes })
      } catch {
        // A entrada já existe: o checklist pode ser refeito na OS.
      }
      onDone(id)
    } catch (err) {
      setError(errText(err))
      setBusy(false)
    }
  }

  return (
    <form noValidate onSubmit={submit} className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-doc border border-rule bg-sheet p-4">
        <div>
          <p className="font-mono text-2xl font-bold tracking-wider text-ink">{picked.plate ? formatPlate(picked.plate) : 'SEM PLACA'}</p>
          <p className="text-graphite">{picked.label} · <strong className="text-ink">{picked.customerName}</strong></p>
        </div>
        <button type="button" onClick={onBack} className="text-sm font-semibold underline underline-offset-4">trocar moto</button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Km de entrada" value={km} onChange={(e) => setKm(onlyDigits(e.target.value).slice(0, 7))} inputMode="numeric"
          hint={picked.km !== null ? `Última registrada: ${picked.km.toLocaleString('pt-BR')} km` : undefined} />
        <TextField label="Previsão de entrega (opcional)" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      </div>
      <TextAreaField label="Problema relatado pelo cliente" value={problem} onChange={(e) => setProblem(e.target.value.slice(0, 2000))} rows={4}
        placeholder="Ex.: barulho na suspensão dianteira, freio puxando para o lado" />
      <section aria-labelledby="checklist-title" className="rounded-doc border border-rule bg-sheet p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="checklist-title" className="heading text-lg text-ink">Checklist de entrada</h2>
          <Button type="button" size="sm" variant="secondary"
            onClick={() => setItems(Object.fromEntries(ENTRY_ITEMS.map((it) => [it.key, items[it.key] ?? { state: 'ok' as const }])))}>Tudo OK</Button>
        </div>
        <p className="mt-1 text-sm text-muted">Confira a moto com o cliente: o estado em que ela chegou fica registrado e vai junto no orçamento.</p>
        <div className="mt-3"><ChecklistItemsEditor base={ENTRY_ITEMS} items={items} onChange={setItems} /></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <SelectField label="Combustível" value={fuel} options={FUEL_LEVELS} placeholder="Não informado" onChange={(e) => setFuel(e.target.value)} />
          <TextField label="Quantidade de chaves" value={keys} onChange={(e) => setKeys(onlyDigits(e.target.value).slice(0, 1))} inputMode="numeric" placeholder="Ex.: 1" />
          <TextAreaField label="Observações da entrada (objetos deixados, avarias…)" value={checkNotes} onChange={(e) => setCheckNotes(e.target.value.slice(0, 1000))} rows={2} className="sm:col-span-2" />
        </div>
      </section>
      <CheckboxField label="Mandar agora para o mecânico fazer o diagnóstico (aparece no App da Pista)" checked={toDiagnosis} onChange={(e) => setToDiagnosis(e.target.checked)} />
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={busy}>Dar entrada</Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={onBack}>Voltar</Button>
      </div>
      <p className="text-sm text-muted">Depois de dar entrada você vai para a OS: tire as fotos de entrada e, se quiser, mande o link para o cliente confirmar o checklist.</p>
    </form>
  )
}
