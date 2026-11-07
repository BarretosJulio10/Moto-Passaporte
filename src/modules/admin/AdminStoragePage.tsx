import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { formatBytes } from '@/modules/attachments/files'
import { ReasonForm } from './ReasonForm'
import {
  CLEANUP_STATUS_LABEL,
  CONTEXT_LABEL,
  KIND_LABEL,
  fetchStorageOverview,
  listStorageCleanups,
  listStorageMotorcycles,
  listStorageUsers,
  listStorageWorkshops,
  listUnlinkedFiles,
  runStorageCleanup,
  type CleanupResult,
} from './storageApi'

const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—')
const n = (v: number) => v.toLocaleString('pt-BR')
const pct = (v: number | null) => (v == null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`)

function Section({ title, id, children }: { title: string; id: string; children: ReactNode }) {
  return (
    <section className="mt-10" aria-labelledby={id}>
      <h2 id={id} className="heading text-2xl text-ink">{title}</h2>
      {children}
    </section>
  )
}

function Bar({ value, max, alert }: { value: number; max: number; alert?: boolean }) {
  const w = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="mt-1 h-1.5 w-full max-w-40 rounded-full bg-rule" aria-hidden="true">
      <div className={`h-1.5 rounded-full ${alert ? 'bg-danger' : 'bg-ink'}`} style={{ width: `${w}%` }} />
    </div>
  )
}

/** Gestão de armazenamento (PRD 7.6, ADR-026). */
export function AdminStoragePage() {
  const qc = useQueryClient()
  const overview = useQuery({ queryKey: ['admin-storage'], queryFn: fetchStorageOverview })
  const users = useQuery({ queryKey: ['admin-storage-users'], queryFn: listStorageUsers })
  const motos = useQuery({ queryKey: ['admin-storage-motos'], queryFn: listStorageMotorcycles })
  const workshops = useQuery({ queryKey: ['admin-storage-workshops'], queryFn: listStorageWorkshops })
  const files = useQuery({ queryKey: ['admin-storage-unlinked'], queryFn: listUnlinkedFiles })
  const cleanups = useQuery({ queryKey: ['admin-storage-cleanups'], queryFn: listStorageCleanups })
  const [asking, setAsking] = useState(false)
  const [result, setResult] = useState<CleanupResult | null>(null)
  const clean = useMutation({
    mutationFn: runStorageCleanup,
    onSuccess: (r) => {
      setResult(r)
      setAsking(false)
      for (const k of ['admin-storage', 'admin-storage-unlinked', 'admin-storage-cleanups', 'admin-metrics']) qc.invalidateQueries({ queryKey: [k] })
    },
  })
  const o = overview.data

  return (
    <div>
      <Link to="/admin" className="text-sm text-muted underline underline-offset-4">Administração</Link>
      <h1 className="heading mt-2 text-3xl text-ink">Armazenamento</h1>
      <p className="mt-1 max-w-2xl text-muted">
        Consumo dos arquivos privados (fotos, notas e comprovantes). Nenhum arquivo ligado a um registro pode ser apagado por aqui: a limpeza só remove
        envios que nunca foram registrados e já passaram do prazo de retenção.
      </p>

      {overview.isError && <div className="mt-6"><Notice tone="error">Não foi possível carregar o consumo.</Notice></div>}

      <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-rule py-5 sm:grid-cols-3 lg:grid-cols-6" aria-label="Resumo">
        {[
          ['Espaço total', o ? formatBytes(o.bucket_bytes) : '…', false],
          ['Arquivos', o ? n(o.bucket_files) : '…', false],
          ['Em registros', o ? formatBytes(o.linked_bytes) : '…', false],
          ['Envios em andamento', o ? `${n(o.temporary_files)} · ${formatBytes(o.temporary_bytes)}` : '…', false],
          ['Sem vínculo', o ? `${n(o.orphan_files)} · ${formatBytes(o.orphan_bytes)}` : '…', !!o && o.orphan_files > 0],
          ['Contas em alerta', o ? n(o.users_in_alert + o.workshops_in_alert) : '…', !!o && o.users_in_alert + o.workshops_in_alert > 0],
        ].map(([label, value, alert]) => (
          <div key={label as string}>
            <dt className="text-sm text-muted">{label}</dt>
            <dd className={`heading mt-1 text-2xl ${alert ? 'text-danger' : 'text-ink'}`}>{value}</dd>
          </div>
        ))}
      </dl>
      {o && (
        <p className="mt-3 text-sm text-muted">
          Alerta a partir de {o.alert_percent}% do espaço da conta. Envio sem registro vira "sem vínculo" após {o.retention_hours} h. Arquivo máximo:{' '}
          {formatBytes(o.max_file_bytes)}; espaço de cada oficina: {formatBytes(o.workshop_quota_bytes)}.{' '}
          <Link to="/admin/configuracoes" className="underline underline-offset-4">Alterar em Configurações</Link>.
        </p>
      )}

      {o && (
        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <section aria-labelledby="kind-title">
            <h2 id="kind-title" className="text-sm font-semibold uppercase tracking-wider text-muted">Por categoria</h2>
            {o.by_kind.length === 0 ? <p className="mt-3 text-muted">Nenhum arquivo ainda.</p> : (
              <table className="mt-3 w-full text-sm">
                <tbody className="divide-y divide-rule border-y border-rule">
                  {o.by_kind.map((k) => (
                    <tr key={k.kind}>
                      <td className="py-2 pr-3 text-graphite">{KIND_LABEL[k.kind] ?? k.kind}</td>
                      <td className="py-2 pr-3 text-right text-muted">{n(k.files)}</td>
                      <td className="py-2 text-right text-ink">{formatBytes(k.bytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <section aria-labelledby="ctx-title">
            <h2 id="ctx-title" className="text-sm font-semibold uppercase tracking-wider text-muted">Por origem</h2>
            {o.by_context.length === 0 ? <p className="mt-3 text-muted">Nenhum arquivo ainda.</p> : (
              <table className="mt-3 w-full text-sm">
                <tbody className="divide-y divide-rule border-y border-rule">
                  {o.by_context.map((k) => (
                    <tr key={k.context}>
                      <td className="py-2 pr-3 text-graphite">{CONTEXT_LABEL[k.context] ?? k.context}</td>
                      <td className="py-2 pr-3 text-right text-muted">{n(k.files)}</td>
                      <td className="py-2 text-right text-ink">{formatBytes(k.bytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}

      <Section title="Contas que mais usam espaço" id="users-title">
        <p className="mt-1 text-sm text-muted">Espaço do titular: arquivos das motos atuais, sem contar os enviados por oficinas. E-mail mascarado.</p>
        {users.isError && <div className="mt-3"><Notice tone="error">Não foi possível carregar.</Notice></div>}
        {users.data?.length === 0 && <p className="mt-3 text-muted">Nenhuma conta com arquivos.</p>}
        {!!users.data?.length && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="text-left text-muted">
                <tr><th className="py-2 pr-3 font-normal">Conta</th><th className="py-2 pr-3 font-normal">Motos</th><th className="py-2 pr-3 font-normal">Usado</th><th className="py-2 font-normal">Do espaço</th></tr>
              </thead>
              <tbody className="divide-y divide-rule border-y border-rule">
                {users.data.map((u) => (
                  <tr key={u.user_id}>
                    <td className="py-2 pr-3"><span className="text-ink">{u.full_name ?? 'Sem nome'}</span><span className="block text-muted">{u.email_masked}</span></td>
                    <td className="py-2 pr-3 text-graphite">{n(u.motorcycles)}</td>
                    <td className="py-2 pr-3 text-graphite">{formatBytes(Number(u.used_bytes))} de {formatBytes(Number(u.quota_bytes))}</td>
                    <td className={`py-2 ${u.in_alert ? 'font-semibold text-danger' : 'text-graphite'}`}>
                      {pct(u.used_percent)}{u.in_alert && ' · alerta'}
                      <Bar value={Number(u.used_bytes)} max={Number(u.quota_bytes)} alert={u.in_alert} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Motos com mais arquivos" id="motos-title">
        {motos.data?.length === 0 && <p className="mt-3 text-muted">Nenhuma moto com arquivos.</p>}
        {!!motos.data?.length && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="text-left text-muted">
                <tr><th className="py-2 pr-3 font-normal">Moto</th><th className="py-2 pr-3 font-normal">Arquivos</th><th className="py-2 pr-3 font-normal">Total</th><th className="py-2 font-normal">Oficinas · diário</th></tr>
              </thead>
              <tbody className="divide-y divide-rule border-y border-rule">
                {motos.data.map((m) => (
                  <tr key={m.motorcycle_id}>
                    <td className="py-2 pr-3"><span className="text-ink">{m.motorcycle_name}</span><span className="block text-muted">{m.owner_name ?? 'Sem titular'}</span></td>
                    <td className="py-2 pr-3 text-graphite">{n(m.files)}</td>
                    <td className="py-2 pr-3 text-graphite">{formatBytes(Number(m.bytes))}</td>
                    <td className="py-2 text-graphite">{formatBytes(Number(m.workshop_bytes))} · {formatBytes(Number(m.diary_bytes))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Oficinas" id="ws-title">
        {workshops.data?.length === 0 && <p className="mt-3 text-muted">Nenhuma oficina com arquivos.</p>}
        {!!workshops.data?.length && (
          <ul className="mt-3 divide-y divide-rule border-y border-rule text-sm">
            {workshops.data.map((w) => (
              <li key={w.organization_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-ink">{w.organization_name}</span>
                <span className={w.in_alert ? 'font-semibold text-danger' : 'text-graphite'}>
                  {n(w.files)} arquivos · {formatBytes(Number(w.used_bytes))} ({pct(w.used_percent)}){w.in_alert && ' · alerta'}
                  <Bar value={Number(w.used_bytes)} max={Number(w.quota_bytes)} alert={w.in_alert} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Arquivos sem registro" id="unlinked-title">
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Envios que chegaram ao armazenamento mas não foram ligados a nenhum registro (por exemplo, quando a internet caiu no meio). Ninguém vê esses
          arquivos e eles não contam no espaço das contas. "Em andamento" ainda está no prazo e nunca é apagado.
        </p>
        {files.data?.length === 0 && <p className="mt-3 text-muted">Nenhum arquivo sem registro.</p>}
        {!!files.data?.length && (
          <ul className="mt-3 divide-y divide-rule border-y border-rule text-sm">
            {files.data.map((f) => (
              <li key={f.storage_path} className="grid gap-1 py-2 sm:grid-cols-[1fr_auto_auto] sm:gap-4">
                <span className="break-all font-mono text-xs text-graphite">{f.storage_path}</span>
                <span className="text-muted">{formatBytes(Number(f.size_bytes))} · {dt(f.created_at)}</span>
                <span className={f.is_orphan ? 'font-semibold text-danger' : 'text-muted'}>{f.is_orphan ? 'Sem vínculo' : 'Em andamento'}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4">
          {result && (
            <Notice tone={result.ok ? 'success' : 'error'}>
              {result.deleted_files === 0 && result.failed_files === 0
                ? 'Nada para limpar.'
                : `${n(result.deleted_files)} arquivo(s) apagado(s), ${formatBytes(Number(result.deleted_bytes))} liberados.`}
              {result.failed_files > 0 && ` ${n(result.failed_files)} não puderam ser apagados; tente de novo mais tarde.`}
            </Notice>
          )}
          {!asking ? (
            <div className="mt-3">
              <Button size="sm" variant="secondary" disabled={!o || o.orphan_files === 0} onClick={() => { setResult(null); clean.reset(); setAsking(true) }}>
                Limpar arquivos sem vínculo
              </Button>
            </div>
          ) : (
            <ReasonForm
              title={`Apagar ${o ? n(o.orphan_files) : ''} arquivo(s) sem vínculo? Não dá para desfazer.`}
              confirmLabel="Apagar arquivos"
              onConfirm={(reason) => clean.mutate(reason)}
              onCancel={() => setAsking(false)}
              pending={clean.isPending}
              error={clean.error ? (clean.error as Error).message : null}
            />
          )}
        </div>
      </Section>

      <Section title="Limpezas anteriores" id="cleanups-title">
        {cleanups.data?.length === 0 && <p className="mt-3 text-muted">Nenhuma limpeza feita.</p>}
        {!!cleanups.data?.length && (
          <ol className="mt-3 divide-y divide-rule border-y border-rule text-sm">
            {cleanups.data.map((c) => (
              <li key={c.id} className="grid gap-1 py-2 sm:grid-cols-[10rem_1fr_auto] sm:gap-4">
                <span className="text-muted">{dt(c.created_at)}</span>
                <span className="text-graphite">{c.requested_by_name ?? 'Administrador'}: {c.reason}</span>
                <span className="text-graphite">
                  {CLEANUP_STATUS_LABEL[c.status] ?? c.status} · {n(c.deleted_files ?? 0)} de {n(c.planned_files)} · {formatBytes(Number(c.deleted_bytes ?? 0))}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  )
}
