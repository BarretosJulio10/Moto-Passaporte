import { useQuery } from '@tanstack/react-query'
import { signedUrls } from './api'
import { formatBytes, KIND_LABEL, type AttachmentKind } from './files'

export type AttachmentSummary = {
  id: string
  storage_path: string
  file_name: string
  mime_type: string
  file_size: number
  kind: AttachmentKind
  created_at: string
}

/** Comprovantes de um registro. Arquivos privados, abertos por link temporário. */
export function AttachmentList({ attachments }: { attachments: AttachmentSummary[] }) {
  const paths = attachments.map((a) => a.storage_path)
  const urls = useQuery({
    queryKey: ['attachment-urls', ...paths],
    queryFn: () => signedUrls(paths),
    enabled: paths.length > 0,
    staleTime: 8 * 60 * 1000,
  })

  if (attachments.length === 0) return null
  return (
    <ul className="mt-3 flex flex-wrap gap-3" aria-label="Comprovantes">
      {attachments.map((a) => {
        const url = urls.data?.[a.storage_path]
        const isImage = a.mime_type.startsWith('image/')
        const label = `${KIND_LABEL[a.kind]}: ${a.file_name}`
        const inner = (
          <>
            <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[0.4rem] border border-rule bg-paper">
              {isImage && url ? (
                <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <span className="text-xs font-semibold text-muted">{isImage ? 'Foto' : 'PDF'}</span>
              )}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">{KIND_LABEL[a.kind]}</span>
              <span className="block max-w-[11rem] truncate text-xs text-muted" title={a.file_name}>{a.file_name}</span>
              <span className="block text-xs text-muted">{formatBytes(a.file_size)}</span>
            </span>
          </>
        )
        return (
          <li key={a.id}>
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Abrir ${label}`}
                className="flex items-center gap-2.5 rounded-doc border border-rule bg-sheet p-2 pr-3 hover:border-ink"
              >
                {inner}
              </a>
            ) : (
              <span className="flex items-center gap-2.5 rounded-doc border border-rule bg-sheet p-2 pr-3" aria-label={label}>
                {inner}
              </span>
            )}
          </li>
        )
      })}
      {urls.isError && <li className="text-sm text-danger">Não foi possível abrir os arquivos agora.</li>}
    </ul>
  )
}
