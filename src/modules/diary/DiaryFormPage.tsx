import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { SelectField, TextAreaField, TextField } from '@/components/Field'
import { validate, type FieldErrors } from '@/core/auth/schemas'
import { translateDbError } from '@/core/shared/dbErrors'
import { todayISO } from '@/core/shared/format'
import { MotoHeader } from '@/modules/motorcycles/MotoHeader'
import { getStorageUsage, uploadAll } from '@/modules/attachments/api'
import { AttachmentPicker, type PendingAttachment } from '@/modules/attachments/AttachmentPicker'
import { formatBytes } from '@/modules/attachments/files'
import { createDiaryEntry, deleteDiaryPhoto, fetchDiary, updateDiaryEntry, type DiaryEntry } from './api'
import {
  DIARY_CATEGORIES,
  DIARY_CATEGORY_LABEL,
  diarySchema,
  MAX_DIARY_PHOTOS,
  VISIBILITY_HINT,
  VISIBILITY_LABEL,
  type DiaryCategory,
  type DiaryVisibility,
} from './schemas'

export function DiaryFormPage() {
  const { id = '', entryId = '' } = useParams()
  const diary = useQuery({ queryKey: ['diary', id], queryFn: () => fetchDiary(id), enabled: Boolean(entryId) })
  const entry = entryId ? diary.data?.find((e) => e.id === entryId) : undefined

  if (entryId && diary.isLoading) return <p className="text-muted" role="status">Carregando entrada…</p>
  if (entryId && (!entry || !entry.is_mine)) {
    return (
      <div className="flex flex-col gap-6">
        <MotoHeader motorcycleId={id} />
        <Notice tone="error" title="Entrada não encontrada">Ela pode ter sido excluída ou não pode ser editada por você.</Notice>
        <Link to={`/painel/motos/${id}/diario`} className="text-ink underline underline-offset-4">Voltar ao diário</Link>
      </div>
    )
  }
  return <DiaryForm key={entry?.id ?? 'new'} motorcycleId={id} entry={entry} />
}

function DiaryForm({ motorcycleId, entry }: { motorcycleId: string; entry?: DiaryEntry }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const usage = useQuery({ queryKey: ['storage-usage'], queryFn: getStorageUsage, retry: false })

  const [category, setCategory] = useState<string>(entry?.category ?? '')
  const [title, setTitle] = useState(entry?.title ?? '')
  const [entryDate, setEntryDate] = useState(entry?.entry_date ?? todayISO())
  const [location, setLocation] = useState(entry?.location ?? '')
  const [body, setBody] = useState(entry?.body ?? '')
  const [visibility, setVisibility] = useState<DiaryVisibility>(entry?.visibility ?? 'private')
  const [pending, setPending] = useState<PendingAttachment[]>([])
  const [photos, setPhotos] = useState(entry?.photos ?? [])
  const [removingPhoto, setRemovingPhoto] = useState<string | null>(null)
  const [confirmPhoto, setConfirmPhoto] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState('')
  const [loading, setLoading] = useState(false)

  async function removePhoto(attachmentId: string) {
    setRemovingPhoto(attachmentId)
    setPhotoError('')
    try {
      await deleteDiaryPhoto(attachmentId)
      setPhotos((list) => list.filter((p) => p.id !== attachmentId))
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['diary', motorcycleId] }),
        queryClient.invalidateQueries({ queryKey: ['storage-usage'] }),
      ])
    } catch (error) {
      setPhotoError(translateDbError(error as { code?: string; message?: string }))
    }
    setRemovingPhoto(null)
    setConfirmPhoto(null)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError('')
    const parsed = validate(diarySchema, { category, title, entryDate, body, location, visibility })
    if (!parsed.ok) {
      setErrors(parsed.errors)
      return
    }
    setErrors({})
    setLoading(true)
    try {
      let targetId = entry?.id
      if (entry) await updateDiaryEntry(entry.id, parsed.data)
      else targetId = await createDiaryEntry(motorcycleId, parsed.data)
      const attachFailures = pending.length && targetId ? await uploadAll(motorcycleId, { diaryEntryId: targetId }, pending) : []
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['diary', motorcycleId] }),
        queryClient.invalidateQueries({ queryKey: ['storage-usage'] }),
      ])
      navigate(`/painel/motos/${motorcycleId}/diario`, { state: { saved: entry ? 'updated' : 'created', attachFailures } })
    } catch (error) {
      setFormError(translateDbError(error as { code?: string; message?: string }))
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <MotoHeader motorcycleId={motorcycleId} />
      <div>
        <h2 className="heading text-2xl text-ink">{entry ? 'Editar entrada do diário' : 'Nova entrada do diário'}</h2>
        <p className="mt-1 max-w-prose text-muted">
          Para viagens, encontros, acessórios e outros momentos. Serviços e manutenção vão no Histórico.
        </p>
      </div>

      {formError && <Notice tone="error">{formError}</Notice>}

      <form noValidate onSubmit={onSubmit} className="flex max-w-3xl flex-col gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField
            label="Tipo"
            value={category}
            onChange={(e) => setCategory(e.target.value as DiaryCategory)}
            options={DIARY_CATEGORIES}
            optionLabel={(v) => DIARY_CATEGORY_LABEL[v as DiaryCategory]}
            placeholder="Escolha"
            error={errors.category}
          />
          <TextField label="Data" type="date" max={todayISO()} value={entryDate} onChange={(e) => setEntryDate(e.target.value)} error={errors.entryDate} />
        </div>
        <TextField label="Título" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} error={errors.title} placeholder="Ex.: Viagem para a Serra da Mantiqueira" />
        <TextField label="Local (opcional)" value={location} maxLength={120} onChange={(e) => setLocation(e.target.value)} error={errors.location} placeholder="Ex.: Campos do Jordão, SP" />
        <TextAreaField label="Conte como foi (opcional)" rows={5} value={body} maxLength={5000} onChange={(e) => setBody(e.target.value)} error={errors.body} />

        <fieldset className="border-t border-rule pt-5">
          <legend className="pr-3 font-semibold text-ink">Quem pode ver</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(['private', 'shareable'] as DiaryVisibility[]).map((v) => (
              <label
                key={v}
                className={`flex cursor-pointer items-start gap-3 rounded-doc border p-3 ${visibility === v ? 'border-ink bg-sheet' : 'border-rule bg-sheet/60'}`}
              >
                <input
                  type="radio"
                  name="visibility"
                  value={v}
                  checked={visibility === v}
                  onChange={() => setVisibility(v)}
                  className="mt-1 accent-ink"
                />
                <span>
                  <span className="block font-semibold text-ink">{VISIBILITY_LABEL[v]}</span>
                  <span className="block text-sm text-muted">{VISIBILITY_HINT[v]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="border-t border-rule pt-5">
          <legend className="pr-3 font-semibold text-ink">Fotos (opcional)</legend>
          <p className="mt-2 text-sm text-muted">Até {MAX_DIARY_PHOTOS} fotos. Seguem a mesma regra de quem pode ver.</p>
          {photos.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2" aria-label="Fotos já enviadas">
              {photos.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-doc border border-rule bg-sheet px-3 py-2">
                  <span className="min-w-0 basis-full truncate text-sm text-graphite sm:basis-0 sm:flex-1" title={p.file_name}>
                    {p.file_name} <span className="text-muted">({formatBytes(p.file_size)})</span>
                  </span>
                  {confirmPhoto === p.id ? (
                    <>
                      <span className="text-sm text-graphite">Remover de vez?</span>
                      <Button type="button" size="sm" loading={removingPhoto === p.id} disabled={loading} onClick={() => removePhoto(p.id)}>
                        {removingPhoto === p.id ? 'Removendo…' : 'Remover'}
                      </Button>
                      <Button type="button" variant="quiet" size="sm" disabled={removingPhoto !== null} onClick={() => setConfirmPhoto(null)}>
                        Manter
                      </Button>
                    </>
                  ) : (
                    <Button type="button" variant="quiet" size="sm" disabled={loading || removingPhoto !== null} onClick={() => setConfirmPhoto(p.id)}>
                      Remover foto
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {photoError && <p className="mt-2 text-sm text-danger" role="alert">{photoError}</p>}
          <div className="mt-3">
            <AttachmentPicker
              value={pending}
              onChange={setPending}
              usage={usage.data}
              existingCount={photos.length}
              disabled={loading}
              photosOnly
              maxFiles={MAX_DIARY_PHOTOS}
            />
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3 border-t border-rule pt-5">
          <Button type="submit" loading={loading}>
            {loading ? (pending.length ? 'Salvando e enviando…' : 'Salvando…') : entry ? 'Salvar alterações' : 'Salvar entrada'}
          </Button>
          <Link to={`/painel/motos/${motorcycleId}/diario`} className="px-2 py-2 font-semibold text-ink underline-offset-4 hover:underline">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  )
}
