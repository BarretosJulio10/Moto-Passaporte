import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { TextField } from '@/components/Field'
import { Button } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { validate } from '@/core/auth/schemas'
import { translateDbError } from '@/core/shared/dbErrors'
import { formatDate, formatPlate } from '@/core/shared/format'
import { changePlate, fetchPlates } from './api'
import { plateSchema } from './schemas'

export function PlateSection({ motorcycleId }: { motorcycleId: string }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [fieldError, setFieldError] = useState<string | undefined>()
  const [done, setDone] = useState(false)

  const plates = useQuery({ queryKey: ['plates', motorcycleId], queryFn: () => fetchPlates(motorcycleId) })

  const mutation = useMutation({
    mutationFn: (plate: string) => changePlate(motorcycleId, plate),
    onSuccess: async () => {
      setEditing(false)
      setDone(true)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['plates', motorcycleId] }),
        queryClient.invalidateQueries({ queryKey: ['motorcycle', motorcycleId] }),
        queryClient.invalidateQueries({ queryKey: ['my-motorcycles'] }),
      ])
    },
  })

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = validate(plateSchema, { plate: new FormData(event.currentTarget).get('plate') })
    if (!result.ok) {
      setFieldError(result.errors.plate)
      return
    }
    setFieldError(undefined)
    mutation.mutate(result.data.plate)
  }

  const current = plates.data?.find((p) => p.valid_until === null)
  const previous = plates.data?.filter((p) => p.valid_until !== null) ?? []

  return (
    <section aria-labelledby="plate-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="plate-title" className="font-semibold text-ink">Placa</h2>
        {!editing && (
          <Button variant="quiet" type="button" onClick={() => { setEditing(true); setDone(false) }}>
            Trocar placa
          </Button>
        )}
      </div>

      {plates.isError && <Notice tone="error">Não foi possível carregar a placa.</Notice>}
      {current && <p className="heading mt-1 text-2xl tracking-wide text-ink">{formatPlate(current.plate)}</p>}
      {done && <div className="mt-3"><Notice tone="success">Placa atualizada. A anterior continua no histórico.</Notice></div>}

      {editing && (
        <form onSubmit={onSubmit} noValidate className="mt-4 flex flex-col gap-3 rounded-doc border border-rule bg-sheet p-4">
          <p className="text-sm text-muted">Use quando a placa da moto mudar (por exemplo, na troca para o padrão Mercosul). O passaporte continua o mesmo.</p>
          {mutation.isError && <Notice tone="error">{translateDbError(mutation.error as { code?: string; message?: string })}</Notice>}
          <TextField label="Nova placa" name="plate" autoCapitalize="characters" autoComplete="off" placeholder="Ex.: ABC1D23" error={fieldError} />
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={mutation.isPending}>Salvar nova placa</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>
          </div>
        </form>
      )}

      {previous.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-ink">Placas anteriores ({previous.length})</summary>
          <ul className="mt-2 divide-y divide-rule border-y border-rule">
            {previous.map((p) => (
              <li key={p.id} className="flex justify-between gap-3 py-2">
                <span className="font-semibold text-graphite">{formatPlate(p.plate)}</span>
                <span className="text-muted">até {formatDate(p.valid_until, 'short')}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
