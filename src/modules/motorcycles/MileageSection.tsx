import { useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { TextField } from '@/components/Field'
import { Button } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { validate, type FieldErrors } from '@/core/auth/schemas'
import { translateDbError } from '@/core/shared/dbErrors'
import { formatDate, formatKm, todayISO } from '@/core/shared/format'
import { fetchMileage, recordMileage } from './api'
import { mileageSchema, type MileageInput } from './schemas'

const SOURCE_LABEL = {
  owner: 'Informado pelo dono',
  document: 'Com comprovante',
  workshop: 'Confirmado por oficina',
} as const

const SOURCE_COLOR = {
  owner: 'var(--color-origin-owner)',
  document: 'var(--color-origin-document)',
  workshop: 'var(--color-origin-workshop)',
} as const

type Correcting = { id: string; mileage: number; recordedAt: string } | null

export function MileageSection({ motorcycleId }: { motorcycleId: string }) {
  const queryClient = useQueryClient()
  const formRef = useRef<HTMLFormElement>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [correcting, setCorrecting] = useState<Correcting>(null)
  const [result, setResult] = useState<{ below: boolean } | null>(null)

  const records = useQuery({ queryKey: ['mileage', motorcycleId], queryFn: () => fetchMileage(motorcycleId) })

  const mutation = useMutation({
    mutationFn: (input: MileageInput) => recordMileage(motorcycleId, input),
    onSuccess: async (data) => {
      setResult({ below: data.below_previous })
      setCorrecting(null)
      formRef.current?.reset()
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mileage', motorcycleId] }),
        queryClient.invalidateQueries({ queryKey: ['motorcycle', motorcycleId] }),
        queryClient.invalidateQueries({ queryKey: ['my-motorcycles'] }),
      ])
    },
  })

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setResult(null)
    const data = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>
    const parsed = validate(mileageSchema, { ...data, correctsRecordId: correcting?.id ?? '' })
    if (!parsed.ok) {
      setErrors(parsed.errors)
      return
    }
    setErrors({})
    mutation.mutate(parsed.data)
  }

  function startCorrection(record: { id: string; mileage: number; recorded_at: string }) {
    setResult(null)
    setCorrecting({ id: record.id, mileage: record.mileage, recordedAt: record.recorded_at })
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setTimeout(() => (formRef.current?.elements.namedItem('mileage') as HTMLInputElement | null)?.focus(), 50)
  }

  const correctedIds = new Set((records.data ?? []).map((r) => r.corrects_record_id).filter(Boolean))

  return (
    <section aria-labelledby="mileage-title">
      <h2 id="mileage-title" className="heading text-2xl text-ink">Quilometragem</h2>
      <p className="mt-1 max-w-2xl text-muted">
        Registre a leitura do painel de tempos em tempos. Nenhuma leitura é apagada; se algo estiver errado, registre uma correção.
      </p>

      <form ref={formRef} onSubmit={onSubmit} noValidate className="mt-5 rounded-doc border border-rule bg-sheet p-4">
        {correcting && (
          <div className="mb-4">
            <Notice tone="info" title="Corrigindo uma leitura">
              Leitura original: {formatKm(correcting.mileage)} em {formatDate(correcting.recordedAt, 'short')}. Ela continuará visível, marcada como corrigida.
            </Notice>
          </div>
        )}
        {mutation.isError && (
          <div className="mb-4">
            <Notice tone="error">{translateDbError(mutation.error as { code?: string; message?: string })}</Notice>
          </div>
        )}
        {result && (
          <div className="mb-4">
            {result.below ? (
              <Notice tone="info" title="Leitura registrada com aviso">
                Esta leitura é menor que uma anterior. Confira o valor; se estiver errado, registre uma correção.
              </Notice>
            ) : (
              <Notice tone="success">Leitura registrada.</Notice>
            )}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_2fr]">
          <TextField label="Quilometragem" name="mileage" inputMode="numeric" placeholder="Ex.: 15200" error={errors.mileage} />
          <TextField label="Data da leitura" name="recordedAt" type="date" defaultValue={todayISO()} max={todayISO()} error={errors.recordedAt} />
          <TextField
            label={correcting ? 'Motivo da correção' : 'Observação (opcional)'}
            name="note"
            maxLength={500}
            placeholder={correcting ? 'Ex.: digitei um zero a mais' : 'Ex.: antes da viagem para a serra'}
            error={errors.note}
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="submit" size="sm" loading={mutation.isPending}>
            {correcting ? 'Registrar correção' : 'Registrar leitura'}
          </Button>
          {correcting && (
            <Button type="button" size="sm" variant="secondary" onClick={() => setCorrecting(null)}>
              Cancelar correção
            </Button>
          )}
        </div>
      </form>

      <div className="mt-6">
        {records.isLoading && <p className="text-muted" role="status">Carregando leituras…</p>}
        {records.isError && <Notice tone="error">Não foi possível carregar as leituras.</Notice>}
        {records.data && records.data.length > 0 && (
          <ol className="divide-y divide-rule border-y border-rule">
            {records.data.map((r) => {
              const wasCorrected = correctedIds.has(r.id)
              return (
                <li key={r.id} className="grid gap-1 py-3 sm:grid-cols-[9rem_8rem_1fr_auto] sm:items-baseline sm:gap-4">
                  <p className={`font-semibold ${wasCorrected ? 'text-muted line-through' : 'text-ink'}`}>{formatKm(r.mileage)}</p>
                  <p className="text-sm text-muted">{formatDate(r.recorded_at, 'short')}</p>
                  <div className="text-sm">
                    <span className="mr-2 inline-block rounded-doc border px-1.5 py-0.5 text-xs font-semibold" style={{ borderColor: SOURCE_COLOR[r.source_type], color: SOURCE_COLOR[r.source_type] }}>
                      {SOURCE_LABEL[r.source_type]}
                    </span>
                    {r.corrects_record_id && <span className="mr-2 text-xs font-semibold text-stamp">Correção</span>}
                    {r.below_previous && !r.corrects_record_id && (
                      <span className="mr-2 text-xs font-semibold text-danger">Menor que leitura anterior</span>
                    )}
                    {wasCorrected && <span className="mr-2 text-xs text-muted">Corrigida</span>}
                    {r.note && <span className="text-muted">{r.note}</span>}
                  </div>
                  {!wasCorrected && r.source_type === 'owner' && (
                    <Button variant="quiet" type="button" className="justify-self-start" onClick={() => startCorrection(r)}>
                      Corrigir
                    </Button>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </section>
  )
}
