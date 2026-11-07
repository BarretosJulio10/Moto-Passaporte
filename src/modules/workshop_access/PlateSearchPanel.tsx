import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { CheckboxField, TextAreaField, TextField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { translateDbError } from '@/core/shared/dbErrors'
import { formatPlate, isValidPlate, normalizePlate } from '@/core/shared/format'
import { cancelRequest, requestAccess, searchPlate, type PlateSearchResult } from './api'

/** Pesquisa protegida por placa (PRD 6.4). Antes da autorização mostra só marca, modelo e ano. */
export function PlateSearchPanel({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient()
  const [plate, setPlate] = useState('')
  const [searched, setSearched] = useState('')
  const [result, setResult] = useState<PlateSearchResult | null>(null)
  const [fieldError, setFieldError] = useState<string>()
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [origin, setOrigin] = useState(false)
  const [busy, setBusy] = useState<'search' | 'request' | 'cancel' | null>(null)

  async function refreshList() {
    await queryClient.invalidateQueries({ queryKey: ['workshop-access', organizationId] })
  }

  async function onSearch(event: FormEvent) {
    event.preventDefault()
    const normalized = normalizePlate(plate)
    if (!isValidPlate(normalized)) {
      setFieldError('Placa inválida. Use o formato ABC1D23 ou ABC1234.')
      return
    }
    setFieldError(undefined)
    setError('')
    setBusy('search')
    try {
      setResult(await searchPlate(organizationId, normalized))
      setSearched(normalized)
      setMessage('')
      setOrigin(false)
    } catch (err) {
      setResult(null)
      setError(translateDbError(err as { code?: string; message?: string }))
    }
    setBusy(null)
  }

  async function onRequest() {
    if (!result?.found) return
    setBusy('request')
    setError('')
    try {
      const r = await requestAccess(organizationId, searched, message, origin && result.origin_available)
      setResult({ ...result, access_id: r.id, access_status: r.status, access_type: r.access_type })
      await refreshList()
    } catch (err) {
      setError(translateDbError(err as { code?: string; message?: string }))
    }
    setBusy(null)
  }

  async function onCancel() {
    if (!result?.found || !result.access_id) return
    setBusy('cancel')
    setError('')
    try {
      await cancelRequest(result.access_id)
      setResult({ ...result, access_status: 'canceled' })
      await refreshList()
    } catch (err) {
      setError(translateDbError(err as { code?: string; message?: string }))
    }
    setBusy(null)
  }

  const status = result?.found ? result.access_status : null
  const canRequest = result?.found && (status === null || status === 'canceled' || status === 'revoked' || status === 'ended' || status === 'rejected')

  return (
    <section aria-labelledby="plate-search-title" className="rounded-doc border border-rule bg-sheet p-5">
      <h2 id="plate-search-title" className="heading text-xl text-ink">Pesquisar moto pela placa</h2>
      <p className="mt-1 max-w-prose text-sm text-muted">
        Você vê só marca, modelo e ano. O restante depende da autorização do titular do passaporte.
      </p>

      <form noValidate onSubmit={onSearch} className="mt-4 flex flex-wrap items-start gap-3">
        <div className="w-full max-w-[14rem]">
          <TextField
            label="Placa"
            name="plate"
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="ABC1D23"
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            error={fieldError}
          />
        </div>
        <Button type="submit" loading={busy === 'search'} className="sm:mt-7">
          {busy === 'search' ? 'Pesquisando…' : 'Pesquisar'}
        </Button>
      </form>

      {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}

      {result && !result.found && (
        <div className="mt-4">
          <Notice tone="info" title={`Nenhuma moto com a placa ${formatPlate(searched)}`}>
            O dono ainda não criou o passaporte. Ele pode criar de graça em poucos minutos.
          </Notice>
        </div>
      )}

      {result?.found && (
        <div className="mt-4 rounded-doc border border-rule bg-paper p-4" aria-live="polite">
          <p className="text-sm text-muted">Placa {formatPlate(searched)}</p>
          <p className="heading text-lg text-ink">
            {result.brand} {result.model}, {result.manufacturing_year}
          </p>

          {status === 'pending' && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <p className="text-graphite">
                Pedido enviado{result.access_type === 'origin' ? ', com reconhecimento como Oficina de Origem' : ''}. Aguardando a resposta do titular.
              </p>
              <Button type="button" variant="quiet" size="sm" loading={busy === 'cancel'} onClick={onCancel}>Cancelar pedido</Button>
            </div>
          )}
          {status === 'approved' && (
            <p className="mt-3 font-semibold text-ink">
              Acesso autorizado{result.access_type === 'origin' ? ' como Oficina de Origem' : ''}. A moto está na lista abaixo.
            </p>
          )}
          {status === 'rejected' && <p className="mt-3 text-graphite">O titular recusou o último pedido.</p>}

          {canRequest && (
            <div className="mt-3 flex flex-col gap-3">
              <TextAreaField
                label="Mensagem para o titular (opcional)"
                rows={2}
                maxLength={280}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                hint="Ex.: revisão agendada para sábado."
              />
              {result.origin_available && (
                <CheckboxField
                  label={
                    <>
                      <strong className="text-ink">Ajudamos a criar este passaporte.</strong> Pedir reconhecimento como
                      Oficina de Origem. O titular decide; o título não dá propriedade sobre a moto.
                    </>
                  }
                  checked={origin}
                  onChange={(e) => setOrigin(e.target.checked)}
                />
              )}
              <div>
                <Button type="button" loading={busy === 'request'} onClick={onRequest}>
                  {busy === 'request' ? 'Enviando…' : status === 'rejected' ? 'Pedir de novo' : 'Pedir acesso'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
