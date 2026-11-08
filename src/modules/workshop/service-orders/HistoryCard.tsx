import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckboxField, SelectField, TextField } from '@/components/Field'
import { Button } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { translateDbError } from '@/core/shared/dbErrors'
import { formatDate, formatKm } from '@/core/shared/format'
import { CATEGORIES, CATEGORY_LABEL } from '@/modules/maintenance/labels'
import type { MaintenanceCategory } from '@/modules/maintenance/labels'
import { Card } from '../shared/WorkshopShell'
import { formatDateTime } from '../shared/rpc'
import { HISTORY_STATE_TEXT, PHOTO_PHASE_LABEL, publishOrder, sendPhotosToHistory, type HistoryOptions, type Order, type OrderHistory } from './api'

type Err = { code?: string; message?: string }

/** Opções de registro no histórico (usadas na conclusão e no "registrar depois"). */
export function HistoryOptionsFields({ history, value, onChange, showPublishToggle }: {
  history: OrderHistory; value: HistoryOptions; onChange: (v: HistoryOptions) => void; showPublishToggle: boolean
}) {
  return (
    <div className="flex flex-col gap-3 rounded-doc border border-stamp/30 bg-stamp/5 p-3">
      {showPublishToggle && (
        <CheckboxField checked={value.publish} onChange={(e) => onChange({ ...value, publish: e.target.checked })}
          label={<>Registrar no histórico do passaporte{history.vehicle_label ? ` da ${history.vehicle_label}` : ''} (o titular é avisado)</>} />
      )}
      {value.publish && (
        <>
          <SelectField label="Categoria no histórico" value={value.category ?? history.suggested_category} options={CATEGORIES}
            optionLabel={(c) => CATEGORY_LABEL[c as MaintenanceCategory]} onChange={(e) => onChange({ ...value, category: e.target.value })} />
          <TextField label="Título no histórico" value={value.title ?? history.suggested_title} maxLength={120}
            onChange={(e) => onChange({ ...value, title: e.target.value })} />
          <CheckboxField checked={value.include_value ?? true} onChange={(e) => onChange({ ...value, include_value: e.target.checked })}
            label="Mostrar o valor do serviço ao titular" />
          <p className="text-xs text-muted">Vão só os serviços executados, as peças (fabricante e código), o km final e o código do comprovante. Itens não executados ficam de fora.</p>
        </>
      )}
    </div>
  )
}

/** PRD 2.1 §17: OS concluída gera registro "confirmado por prestador" no histórico da moto autorizada. */
export function HistoryCard({ orgId, order, history, canManage, onChanged }: {
  orgId: string; order: Order; history: OrderHistory; canManage: boolean; onChanged: () => Promise<unknown>
}) {
  const [opts, setOpts] = useState<HistoryOptions>({ publish: true })
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const inHistory = new Set(history.photo_ids_in_history ?? [])
  const available = order.photos.filter((p) => !inHistory.has(p.id))

  async function run(name: string, fn: () => Promise<unknown>) {
    setBusy(name)
    setError(null)
    setDone(null)
    try { await fn(); await onChanged() } catch (err) {
      setError(err instanceof Error && !(err as Err).code ? err.message : translateDbError(err as Err))
      await onChanged()
    } finally { setBusy('') }
  }

  const motoId = history.motorcycle_id
  return (
    <Card title="Histórico da moto (passaporte)">
      <p className={`text-sm ${history.state === 'published' ? 'text-ok' : 'text-graphite'}`}>{HISTORY_STATE_TEXT[history.state]}</p>

      {history.state === 'ready' && canManage && (
        <div className="mt-3">
          <HistoryOptionsFields history={history} value={opts} onChange={setOpts} showPublishToggle={false} />
          <Button className="mt-3" size="sm" loading={busy === 'publish'}
            onClick={() => run('publish', () => publishOrder(orgId, order.id, opts.category ?? history.suggested_category, opts.title ?? history.suggested_title, opts.include_value ?? true))}>
            Registrar no histórico
          </Button>
        </div>
      )}

      {history.state === 'published' && history.record && motoId && (
        <div className="mt-3 text-sm">
          <p className="text-graphite">
            <span className="font-semibold">{history.record.title}</span> · {CATEGORY_LABEL[history.record.category as MaintenanceCategory] ?? history.record.category} ·{' '}
            {formatDate(history.record.service_date, 'short')}{history.record.mileage !== null ? ` · ${formatKm(history.record.mileage)}` : ''}
          </p>
          <p className="text-xs text-muted">Registrado em {formatDateTime(history.published_at)}. {history.record.superseded ? 'Este registro já tem uma correção.' : ''}</p>
          <div className="mt-2 flex flex-wrap gap-3">
            <Link to={`/oficina/${orgId}/motos/${motoId}`} className="font-semibold text-ink underline underline-offset-4">Ver no histórico</Link>
            {canManage && !history.record.superseded && (
              <Link to={`/oficina/${orgId}/motos/${motoId}/servico?corrigir=${history.record.id}`} className="text-ink underline underline-offset-4">Corrigir registro</Link>
            )}
          </div>
          <p className="mt-1 text-xs text-muted">Correção cria um registro novo com o motivo; o original fica preservado.</p>

          {canManage && order.photos.length > 0 && (
            <div className="mt-4">
              <p className="font-semibold text-ink">Fotos no histórico ({history.photos_in_history} de {order.photos.length})</p>
              {available.length > 0 ? (
                <>
                  <p className="text-xs text-muted">Escolha as fotos que o titular vai ver no histórico da moto (usa o espaço da oficina).</p>
                  <ul className="mt-2 flex flex-col gap-1">
                    {(['entry', 'work', 'exit'] as const).map((ph) => {
                      const list = available.filter((p) => p.phase === ph)
                      if (!list.length) return null
                      const all = list.every((p) => selected.includes(p.id))
                      return (
                        <li key={ph}>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" className="h-4 w-4 accent-ink" checked={all}
                              onChange={(e) => setSelected(e.target.checked ? [...new Set([...selected, ...list.map((p) => p.id)])] : selected.filter((id) => !list.some((p) => p.id === id)))} />
                            {PHOTO_PHASE_LABEL[ph]} ({list.length})
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                  <Button className="mt-2" size="sm" variant="secondary" disabled={selected.length === 0} loading={busy === 'photos'}
                    onClick={() => run('photos', async () => {
                      const n = await sendPhotosToHistory(orgId, order, motoId, history.record!.id, selected)
                      setSelected([])
                      setDone(`${n} foto${n === 1 ? '' : 's'} enviada${n === 1 ? '' : 's'} ao histórico.`)
                    })}>
                    Enviar {selected.length || ''} foto{selected.length === 1 ? '' : 's'} ao histórico
                  </Button>
                </>
              ) : <p className="text-xs text-muted">Todas as fotos já estão no histórico.</p>}
            </div>
          )}
        </div>
      )}
      {done && <div className="mt-3"><Notice tone="success">{done}</Notice></div>}
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
    </Card>
  )
}
