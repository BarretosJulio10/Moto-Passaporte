import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { translateDbError } from '@/core/shared/dbErrors'
import { currentSubscription, disablePush, enablePush, fetchMyDevices, pushSupport, removeDevice, sendTestPush, type PushSupport } from './push'

const err = (e: unknown) => (e instanceof Error && !('code' in e) ? e.message : translateDbError(e as { code?: string; message?: string }))
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : 'ainda não')

/** Ativar avisos neste aparelho e ver os aparelhos da conta (ADR-040). */
export function PushCard() {
  const qc = useQueryClient()
  const [support, setSupport] = useState<PushSupport>('unsupported')
  const [here, setHere] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const devices = useQuery({ queryKey: ['push-devices'], queryFn: fetchMyDevices })

  const refresh = async () => {
    setSupport(pushSupport())
    setHere((await currentSubscription().catch(() => null))?.endpoint ?? null)
    await qc.invalidateQueries({ queryKey: ['push-devices'] })
    await qc.invalidateQueries({ queryKey: ['notification-prefs'] })
  }
  useEffect(() => {
    void refresh()
  }, [])

  const on = useMutation({
    mutationFn: async () => {
      await enablePush()
      await sendTestPush().catch(() => undefined)
    },
    onSuccess: async () => {
      setMsg({ tone: 'success', text: 'Notificações ativadas neste aparelho. Enviamos um aviso de teste.' })
      await refresh()
    },
    onError: async (e) => {
      setMsg({ tone: 'error', text: err(e) })
      await refresh()
    },
  })
  const off = useMutation({
    mutationFn: disablePush,
    onSuccess: async () => {
      setMsg({ tone: 'success', text: 'Este aparelho não recebe mais avisos no celular.' })
      await refresh()
    },
    onError: (e) => setMsg({ tone: 'error', text: err(e) }),
  })
  const test = useMutation({
    mutationFn: sendTestPush,
    onSuccess: () => setMsg({ tone: 'success', text: 'Aviso de teste enviado. Deve chegar em alguns segundos.' }),
    onError: (e) => setMsg({ tone: 'error', text: err(e) }),
  })
  const remove = useMutation({ mutationFn: removeDevice, onSuccess: refresh })

  const active = Boolean(here)
  const list = devices.data ?? []
  return (
    <section className="rounded-sheet border border-rule bg-sheet p-5" aria-labelledby="push-title">
      <h2 id="push-title" className="font-semibold text-ink">Avisos no celular</h2>
      <p className="mt-1 text-sm text-muted">
        Receba os avisos como notificação, mesmo com o app fechado. Entre 22h e 8h eles esperam até de manhã, exceto pedidos de acesso de oficina.
      </p>
      {msg && <div className="mt-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}

      {support === 'ios-needs-install' && (
        <div className="mt-4 text-sm text-graphite">
          <p className="font-semibold text-ink">No iPhone, instale o app primeiro.</p>
          <p className="mt-1">Safari → Compartilhar → <strong>Adicionar à Tela de Início</strong>. Depois abra pelo ícone e volte aqui.</p>
          <Link to="/instalar" className="mt-2 inline-block font-semibold text-ink underline underline-offset-4">Ver o passo a passo</Link>
        </div>
      )}
      {support === 'unsupported' && (
        <p className="mt-4 text-sm text-graphite">Este navegador não recebe notificações. No Android use o Chrome; no iPhone, o app instalado.</p>
      )}
      {support === 'blocked' && (
        <p className="mt-4 text-sm text-danger">
          As notificações estão bloqueadas para o Moto Passaporte neste aparelho. Libere nas configurações do celular (Notificações) ou do navegador e volte aqui.
        </p>
      )}
      {support === 'ok' && (
        <div className="mt-4 flex flex-wrap gap-2">
          {active ? (
            <>
              <span className="inline-flex items-center rounded-doc bg-paper px-3 py-1.5 text-sm font-semibold text-ink">✓ Ativadas neste aparelho</span>
              <Button size="sm" variant="secondary" loading={test.isPending} onClick={() => test.mutate()}>Enviar teste</Button>
              <Button size="sm" variant="quiet" loading={off.isPending} onClick={() => off.mutate()}>Desativar neste aparelho</Button>
            </>
          ) : (
            <Button size="sm" loading={on.isPending} onClick={() => on.mutate()}>Ativar notificações neste aparelho</Button>
          )}
        </div>
      )}

      {list.length > 0 && (
        <div className="mt-5">
          <p className="text-sm font-semibold text-graphite">Aparelhos que recebem avisos</p>
          <ul className="mt-2 divide-y divide-rule border-y border-rule text-sm">
            {list.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-graphite">
                  {d.label ?? 'Aparelho'}
                  {here && here.endsWith(d.endpoint_hint) ? ' (este)' : ''}
                  <span className="block text-xs text-muted">Ativado em {day(d.created_at)} · último aviso: {day(d.last_used_at)}</span>
                </span>
                <Button size="sm" variant="quiet" loading={remove.isPending && remove.variables === d.id} onClick={() => remove.mutate(d.id)}
                  aria-label={`Remover ${d.label ?? 'aparelho'}`}>
                  Remover
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
