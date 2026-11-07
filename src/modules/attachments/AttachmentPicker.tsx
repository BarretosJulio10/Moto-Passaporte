import { useId, useRef, useState, type ChangeEvent } from 'react'
import { Button } from '@/components/Button'
import { AttachmentError, prepareFile, type PreparedFile } from './api'
import { checkLimits, formatBytes, guessKind, KIND_LABEL, KINDS, MAX_FILES_PER_RECORD, type AttachmentKind, type StorageUsage } from './files'

export type PendingAttachment = { key: number; file: PreparedFile; kind: AttachmentKind }

let pendingKey = 0

type Props = {
  value: PendingAttachment[]
  onChange: (next: PendingAttachment[]) => void
  usage?: StorageUsage
  /** Anexos já salvos no registro (contam no limite por registro). */
  existingCount?: number
  disabled?: boolean
}

export function AttachmentPicker({ value, onChange, usage, existingCount = 0, disabled }: Props) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [preparing, setPreparing] = useState(false)
  const room = MAX_FILES_PER_RECORD - existingCount - value.length

  async function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return
    setPreparing(true)
    const added: PendingAttachment[] = []
    const errs: string[] = []
    let pendingBytes = value.reduce((s, p) => s + p.file.blob.size, 0)
    for (const [i, f] of files.entries()) {
      if (i >= room) {
        errs.push(`Limite de ${MAX_FILES_PER_RECORD} arquivos por registro.`)
        break
      }
      try {
        const prepared = await prepareFile(f)
        const limit = checkLimits(prepared.blob.size, usage, pendingBytes)
        if (limit) {
          errs.push(`${prepared.name}: ${limit}`)
          continue
        }
        pendingBytes += prepared.blob.size
        added.push({ key: ++pendingKey, file: prepared, kind: guessKind(prepared.name, prepared.mime) })
      } catch (err) {
        errs.push(`${f.name}: ${err instanceof AttachmentError ? err.message : 'não foi possível ler o arquivo.'}`)
      }
    }
    setErrors(errs)
    setPreparing(false)
    if (added.length) onChange([...value, ...added])
  }

  return (
    <div className="flex flex-col gap-3">
      {value.length > 0 && (
        <ul className="flex flex-col gap-2">
          {value.map((p) => (
            <li key={p.key} className="flex flex-wrap items-center gap-3 rounded-doc border border-rule bg-sheet px-3 py-2">
              <span className="min-w-0 basis-full truncate text-sm text-graphite sm:basis-0 sm:flex-1" title={p.file.name}>
                {p.file.name} <span className="text-muted">({formatBytes(p.file.blob.size)})</span>
              </span>
              <label className="sr-only" htmlFor={`${inputId}-${p.key}`}>Tipo de {p.file.name}</label>
              <select
                id={`${inputId}-${p.key}`}
                value={p.kind}
                disabled={disabled}
                onChange={(e) => onChange(value.map((x) => (x.key === p.key ? { ...x, kind: e.target.value as AttachmentKind } : x)))}
                className="rounded-doc border border-rule bg-sheet px-2 py-1.5 text-sm text-graphite focus:border-ink focus:outline-none"
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>{KIND_LABEL[k]}</option>
                ))}
              </select>
              <Button type="button" variant="quiet" size="sm" disabled={disabled} onClick={() => onChange(value.filter((x) => x.key !== p.key))}>
                Remover
              </Button>
            </li>
          ))}
        </ul>
      )}

      {errors.length > 0 && (
        <ul className="text-sm text-danger" role="alert">
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}

      {room > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="sr-only"
            onChange={onFiles}
            disabled={disabled || preparing}
          />
          <Button type="button" variant="secondary" size="sm" loading={preparing} disabled={disabled} onClick={() => inputRef.current?.click()}>
            {preparing ? 'Preparando…' : 'Escolher arquivos'}
          </Button>
          <span className="text-sm text-muted">Foto ou PDF, até {usage ? formatBytes(usage.max_file_bytes) : '10 MB'} cada. Fotos grandes são reduzidas.</span>
        </div>
      )}
      {usage && <StorageMeter usage={usage} />}
    </div>
  )
}

export function StorageMeter({ usage }: { usage: StorageUsage }) {
  const pct = usage.quota_bytes > 0 ? Math.min(100, (usage.used_bytes / usage.quota_bytes) * 100) : 0
  return (
    <div className="max-w-xs">
      <div className="h-1.5 overflow-hidden rounded-full bg-rule" aria-hidden="true">
        <div className={`h-full ${pct >= 90 ? 'bg-danger' : 'bg-ink'}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted">
        {formatBytes(usage.used_bytes)} de {formatBytes(usage.quota_bytes)} usados
      </p>
    </div>
  )
}
