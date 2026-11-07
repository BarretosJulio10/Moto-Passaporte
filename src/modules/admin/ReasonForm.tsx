import { useState, type FormEvent } from 'react'
import { Button } from '@/components/Button'
import { TextAreaField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { validReason } from './adminApi'

/** Pede o motivo de uma ação administrativa (registrado na auditoria — PRD 7.7). */
export function ReasonForm({
  title,
  confirmLabel,
  onConfirm,
  onCancel,
  pending,
  error,
}: {
  title: string
  confirmLabel: string
  onConfirm: (reason: string) => void
  onCancel: () => void
  pending?: boolean
  error?: string | null
}) {
  const [reason, setReason] = useState('')
  const [local, setLocal] = useState<string | null>(null)
  function submit(e: FormEvent) {
    e.preventDefault()
    const invalid = validReason(reason)
    if (invalid) return setLocal(invalid)
    setLocal(null)
    onConfirm(reason.trim())
  }
  return (
    <form onSubmit={submit} noValidate className="mt-3 grid gap-3 rounded-doc border border-rule bg-sheet p-4" aria-label={title}>
      <p className="font-semibold text-ink">{title}</p>
      <TextAreaField label="Motivo (fica registrado na auditoria)" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} />
      {(local || error) && <Notice tone="error">{local ?? error}</Notice>}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="sm" loading={pending} variant="primary">{confirmLabel}</Button>
        <Button type="button" size="sm" variant="secondary" onClick={onCancel}>Cancelar</Button>
      </div>
    </form>
  )
}
