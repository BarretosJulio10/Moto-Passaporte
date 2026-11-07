import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { TextField } from '@/components/Field'
import { Button } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { translateDbError } from '@/core/shared/dbErrors'
import { maskChassis, normalizePlate } from '@/core/shared/format'
import { fetchChassis, updateChassis } from './api'

export function ChassisSection({ motorcycleId }: { motorcycleId: string }) {
  const queryClient = useQueryClient()
  const [revealed, setRevealed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [fieldError, setFieldError] = useState<string | undefined>()

  const chassis = useQuery({ queryKey: ['chassis', motorcycleId], queryFn: () => fetchChassis(motorcycleId) })

  const mutation = useMutation({
    mutationFn: (value: string | null) => updateChassis(motorcycleId, value),
    onSuccess: async () => {
      setEditing(false)
      await queryClient.invalidateQueries({ queryKey: ['chassis', motorcycleId] })
    },
  })

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = normalizePlate(String(new FormData(event.currentTarget).get('chassis') ?? ''))
    if (value !== '' && !/^[A-Z0-9]{5,30}$/.test(value)) {
      setFieldError('Chassi inválido. Use só letras e números.')
      return
    }
    setFieldError(undefined)
    mutation.mutate(value === '' ? null : value)
  }

  return (
    <section aria-labelledby="chassis-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="chassis-title" className="font-semibold text-ink">Chassi</h2>
        {!editing && (
          <Button variant="quiet" type="button" onClick={() => setEditing(true)}>
            {chassis.data ? 'Editar' : 'Adicionar'}
          </Button>
        )}
      </div>
      <p className="text-sm text-muted">Visível só para você.</p>

      {chassis.isError && <Notice tone="error">Não foi possível carregar o chassi.</Notice>}
      {!editing && chassis.data !== undefined && (
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <p className="font-mono text-lg tracking-wider text-graphite">
            {chassis.data ? (revealed ? chassis.data : maskChassis(chassis.data)) : 'Não informado'}
          </p>
          {chassis.data && (
            <Button variant="quiet" type="button" onClick={() => setRevealed((v) => !v)} aria-pressed={revealed}>
              {revealed ? 'Ocultar' : 'Mostrar'}
            </Button>
          )}
        </div>
      )}

      {editing && (
        <form onSubmit={onSubmit} noValidate className="mt-3 flex flex-col gap-3 rounded-doc border border-rule bg-sheet p-4">
          {mutation.isError && <Notice tone="error">{translateDbError(mutation.error as { code?: string; message?: string })}</Notice>}
          <TextField
            label="Chassi"
            name="chassis"
            defaultValue={chassis.data ?? ''}
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={30}
            hint="Deixe em branco para remover."
            error={fieldError}
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={mutation.isPending}>Salvar</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>
          </div>
        </form>
      )}
    </section>
  )
}
