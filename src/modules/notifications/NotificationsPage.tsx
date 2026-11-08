import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { translateDbError } from '@/core/shared/dbErrors'
import { PushCard } from './PushCard'
import { PageHeader } from '@/components/AppLayout'
import { KIND_LABEL, fetchNotifications, fetchPreferences, markRead, setPreference, type NotificationPreference } from './api'

const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

function Preferences() {
  const qc = useQueryClient()
  const prefs = useQuery({ queryKey: ['notification-prefs'], queryFn: fetchPreferences })
  const [error, setError] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: (p: NotificationPreference) => setPreference(p.kind, p.in_app, p.email, p.push),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notification-prefs'] }),
    onError: (e) => setError(translateDbError(e as { code?: string; message?: string })),
  })
  if (!prefs.data) return null
  return (
    <section className="rounded-sheet border border-rule bg-sheet p-5" aria-labelledby="prefs-title">
      <h2 id="prefs-title" className="font-semibold text-ink">O que receber</h2>
      <p className="mt-1 text-sm text-muted">
        Avisos sobre pagamentos, oficinas e transferências são essenciais e sempre aparecem aqui. "No celular" vale para os aparelhos com
        notificação ativada. O envio por e-mail ainda não está ativo: se marcar, você passa a receber quando for ligado.
      </p>
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[22rem] text-sm">
          <thead className="text-left text-muted">
            <tr><th className="py-2 pr-3 font-normal">Aviso</th><th className="py-2 pr-3 font-normal">No site</th><th className="py-2 pr-3 font-normal">No celular</th><th className="py-2 font-normal">Por e-mail</th></tr>
          </thead>
          <tbody className="divide-y divide-rule border-y border-rule">
            {prefs.data.map((p) => (
              <tr key={p.kind}>
                <td className="py-2 pr-3 text-graphite">{KIND_LABEL[p.kind] ?? p.kind}</td>
                <td className="py-2 pr-3">
                  <input type="checkbox" className="h-4 w-4 accent-ink" checked={p.in_app} disabled={!p.optional || save.isPending}
                    aria-label={`${KIND_LABEL[p.kind] ?? p.kind} no site${p.optional ? '' : ' (essencial)'}`}
                    onChange={(e) => save.mutate({ ...p, in_app: e.target.checked })} />
                </td>
                <td className="py-2 pr-3">
                  <input type="checkbox" className="h-4 w-4 accent-ink" checked={p.push} disabled={save.isPending}
                    aria-label={`${KIND_LABEL[p.kind] ?? p.kind} no celular`}
                    onChange={(e) => save.mutate({ ...p, push: e.target.checked })} />
                </td>
                <td className="py-2">
                  <input type="checkbox" className="h-4 w-4 accent-ink" checked={p.email} disabled={save.isPending}
                    aria-label={`${KIND_LABEL[p.kind] ?? p.kind} por e-mail`}
                    onChange={(e) => save.mutate({ ...p, email: e.target.checked })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** Central de notificações (PRD 12, ADR-031). Ao abrir, marca os avisos como lidos. */
export function NotificationsPage() {
  const qc = useQueryClient()
  const list = useInfiniteQuery({
    queryKey: ['notifications'],
    queryFn: ({ pageParam }) => fetchNotifications(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.length === 30 ? last.at(-1)?.created_at : undefined),
  })
  const items = list.data?.pages.flat() ?? []
  const hasUnread = items.some((n) => !n.read_at)

  useEffect(() => {
    if (!hasUnread) return
    const t = setTimeout(() => {
      markRead().then(() => qc.invalidateQueries({ queryKey: ['notifications-unread'] })).catch(() => undefined)
    }, 1500)
    return () => clearTimeout(t)
  }, [hasUnread, qc])

  return (
    <div>
      <PageHeader title="Notificações" intro="Avisos sobre suas motos, sua oficina e sua assinatura." />
      <div className="mt-8 grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_30rem] 2xl:grid-cols-[minmax(0,1fr)_34rem]">
      <section aria-label="Avisos" className="min-w-0">
      {list.isError && <div className="mt-6"><Notice tone="error">Não foi possível carregar as notificações.</Notice></div>}
      {list.isSuccess && items.length === 0 && <p className="rounded-sheet border border-dashed border-rule bg-sheet p-8 text-muted">Nenhuma notificação por enquanto.</p>}
      {items.length > 0 && (
        <ol className="divide-y divide-rule overflow-hidden rounded-sheet border border-rule bg-sheet">
          {items.map((n) => (
            <li key={n.id} className={`px-5 py-4 ${n.read_at ? '' : 'border-l-4 border-l-ink pl-4'}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="font-semibold text-ink">
                  {!n.read_at && <span className="sr-only">Nova: </span>}
                  {n.link ? <Link to={n.link} className="underline-offset-4 hover:underline">{n.title}</Link> : n.title}
                </p>
                <span className="text-sm text-muted">{when(n.created_at)}</span>
              </div>
              {n.body && <p className="mt-1 break-words text-graphite">{n.body}</p>}
            </li>
          ))}
        </ol>
      )}
      {list.hasNextPage && (
        <Button className="mt-4" size="sm" variant="secondary" loading={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>
          Ver mais antigas
        </Button>
      )}
      </section>
      <aside className="flex min-w-0 flex-col gap-6" aria-label="Configurações dos avisos">
        <PushCard />
        <Preferences />
      </aside>
      </div>
    </div>
  )
}
