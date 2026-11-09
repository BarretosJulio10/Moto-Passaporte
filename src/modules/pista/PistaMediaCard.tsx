import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { rpc } from '@/modules/workshop/shared/rpc'
import { Card } from '@/modules/workshop/shared/WorkshopShell'
import { signedUrls, type PistaAudio, type PistaNote } from './api'
import { AudioPlayer } from './AudioPlayer'

/** Na OS do painel: notas e áudios registrados pelo App da Pista (ADR-057). Só a equipe vê. */
export function PistaMediaCard({ orgId, orderId }: { orgId: string; orderId: string }) {
  const media = useQuery({
    queryKey: ['order-media', orgId, orderId],
    queryFn: () => rpc<{ notes: PistaNote[]; audios: PistaAudio[] }>('workshop_order_media', { p_org: orgId, p_order: orderId }),
  })
  const paths = (media.data?.audios ?? []).map((a) => a.storage_path ?? '').filter(Boolean)
  const signed = useQuery({ queryKey: ['order-media-signed', paths.join('|')], queryFn: () => signedUrls(paths), enabled: paths.length > 0, staleTime: 20 * 60_000 })
  const notes = (media.data?.notes ?? []).filter((n) => !n.voided)
  const audios = media.data?.audios ?? []
  const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  return (
    <Card title="Notas e áudios da pista" actions={<Link to={`/pista/os/${orderId}`} className="text-sm font-semibold text-ink underline underline-offset-4">Abrir na pista</Link>}>
      {media.isLoading && <p className="text-muted">Carregando…</p>}
      {media.data && notes.length + audios.length === 0 && (
        <p className="text-muted">Nada ainda. O mecânico registra notas e áudios pelo <Link to={`/oficina/${orgId}/pista`} className="underline">App da Pista</Link>.</p>
      )}
      <ul className="space-y-3">
        {notes.map((n) => (
          <li key={n.id} className="rounded-doc border border-rule bg-paper p-3">
            <p className="whitespace-pre-wrap text-ink">{n.body}</p>
            <p className="mt-1 text-xs text-muted">{n.created_by_name ?? 'Equipe'} · {when(n.created_at)}</p>
          </li>
        ))}
        {audios.map((a) => (
          <li key={a.id} className="rounded-doc border border-rule bg-paper p-3">
            <p className="font-semibold text-ink">{a.title ?? 'Áudio'} <span className="font-normal text-muted">· {Math.floor(a.duration_seconds / 60)}:{String(a.duration_seconds % 60).padStart(2, '0')}</span></p>
            {a.expired || !a.storage_path ? <p className="text-sm text-muted">Áudio expirado (apagado 90 dias após a entrega).</p> : <AudioPlayer src={signed.data?.[a.storage_path]} />}
            <p className="mt-1 text-xs text-muted">{a.created_by_name ?? 'Equipe'} · {when(a.created_at)}</p>
          </li>
        ))}
      </ul>
    </Card>
  )
}
