import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Notice } from '@/components/Notice'
import { formatDate, formatKm, formatPlate } from '@/core/shared/format'
import { CATEGORY_LABEL, SOURCE_COLOR, SOURCE_LABEL } from '@/modules/maintenance/labels'
import { formatBRL } from '@/modules/maintenance/schemas'
import { KIND_LABEL } from '@/modules/attachments/files'
import { DIARY_CATEGORY_LABEL } from '@/modules/diary/schemas'
import { fetchSharedPassport, openSharedFile, type SharedPassport } from './sharesApi'
import { isRateLimited } from '@/core/shared/rateLimit'

type SharedAttachment = NonNullable<SharedPassport['history']>[number]['attachments']

/** Abre um comprovante numa nova aba por link temporário (ADR-034). */
function SharedFiles({ token, files }: { token: string; files: NonNullable<SharedAttachment> }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fallback, setFallback] = useState<{ id: string; url: string } | null>(null)

  async function open(id: string) {
    setError(null)
    setFallback(null)
    setBusy(id)
    const tab = window.open('', '_blank')
    try {
      const url = await openSharedFile(token, id)
      if (tab) {
        tab.opener = null
        tab.location.href = url
      } else setFallback({ id, url })
    } catch (e) {
      tab?.close()
      setError(e instanceof Error ? e.message : 'Não foi possível abrir o comprovante agora.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mt-2 text-sm">
      <span className="text-graphite">Comprovantes: </span>
      <span className="inline-flex flex-wrap gap-x-3 gap-y-1">
        {files.map((a, i) =>
          a.id ? (
            <button key={a.id} type="button" onClick={() => open(a.id!)} disabled={busy !== null}
              className="font-semibold text-ink underline underline-offset-4 disabled:opacity-60">
              {busy === a.id ? 'Abrindo…' : `Abrir ${KIND_LABEL[a.kind].toLowerCase()}${a.mime_type === 'application/pdf' ? ' (PDF)' : ''}`}
            </button>
          ) : (
            <span key={i} className="text-graphite">{KIND_LABEL[a.kind]}</span>
          ),
        )}
      </span>
      {fallback && (
        <a href={fallback.url} target="_blank" rel="noopener noreferrer" className="mt-1 block font-semibold text-ink underline underline-offset-4">
          Toque aqui para abrir (o link vale por 1 minuto)
        </a>
      )}
      {error && <p role="alert" className="mt-1 text-danger">{error}</p>}
    </div>
  )
}

/** /c/:token — passaporte compartilhado pelo titular (PRD 11). Sem cadastro, fora dos buscadores. */
export function SharedPassportPage() {
  const { token = '' } = useParams()
  const valid = /^[0-9a-f]{48}$/.test(token)

  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])

  const passport = useQuery({
    queryKey: ['shared-passport', token],
    queryFn: () => fetchSharedPassport(token),
    enabled: valid,
    retry: false,
    staleTime: Infinity,
  })

  if (valid && passport.isLoading) {
    return <p className="mx-auto max-w-3xl px-5 py-16 text-muted" role="status">Abrindo passaporte…</p>
  }
  if (passport.isError && isRateLimited(passport.error)) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-16">
        <h1 className="heading text-3xl text-ink">Muitas consultas seguidas</h1>
        <p className="mt-3 text-muted">Por segurança, limitamos consultas repetidas a partir da mesma conexão. Aguarde alguns minutos e abra o link de novo.</p>
      </div>
    )
  }
  if (!valid || passport.isError || !passport.data) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-16">
        <h1 className="heading text-3xl text-ink">Link indisponível</h1>
        <p className="mt-3 text-muted">
          O link pode ter sido revogado pelo proprietário, ter expirado ou estar incompleto. Peça um novo link a quem compartilhou.
        </p>
        <Link to="/" className="mt-6 inline-block font-semibold text-ink underline underline-offset-4">Conhecer o Moto Passaporte</Link>
      </div>
    )
  }
  return <SharedPassportView p={passport.data} token={token} />
}

export function SharedPassportView({ p, token }: { p: SharedPassport; token?: string }) {
  const title = [p.brand, p.model, p.version].filter(Boolean).join(' ')
  const year = p.model_year ? `${p.manufacturing_year}/${p.model_year}` : String(p.manufacturing_year)
  const history = p.history ?? []
  const counts = {
    workshop: history.filter((h) => h.evidence_level === 'workshop').length,
    document: history.filter((h) => h.evidence_level === 'document').length,
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-5 py-12">
      <article className="guilloche overflow-hidden rounded-sheet border border-rule shadow-[0_24px_48px_-28px_rgba(28,43,74,0.45)]">
        <div className="flex items-center justify-between bg-ink px-6 py-3 text-sheet">
          <span className="heading text-sm">Moto Passaporte</span>
          <span className="text-xs text-sheet/80">Compartilhado em {formatDate(p.shared_at, 'short')}</span>
        </div>
        <div className="p-6 sm:p-8">
          <h1 className="display text-3xl text-ink sm:text-4xl">{title}</h1>
          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-rule pt-5 sm:grid-cols-3">
            <Item label="Ano" value={year} />
            <Item label="Cilindrada" value={p.displacement_cc ? `${p.displacement_cc} cm³` : '—'} />
            <Item label="Cor" value={p.color ?? '—'} />
            {p.options.plate && <Item label="Placa" value={p.plate ? formatPlate(p.plate) : '—'} />}
            <Item label="Passaporte criado em" value={formatDate(p.passport_created_at, 'short')} />
            {p.origin_workshop && <Item label="Oficina de Origem" value={p.origin_workshop} />}
          </dl>
          {p.options.history && (
            <p className="mt-5 text-sm text-graphite">
              {history.length} {history.length === 1 ? 'registro' : 'registros'} no histórico
              {counts.workshop > 0 && `, ${counts.workshop} ${counts.workshop === 1 ? 'confirmado' : 'confirmados'} por oficina`}
              {counts.document > 0 && `, ${counts.document} com comprovante`}.
            </p>
          )}
        </div>
      </article>

      {p.options.mileage && p.mileage && (
        <section aria-labelledby="km-title">
          <h2 id="km-title" className="heading text-2xl text-ink">Quilometragem documentada</h2>
          {p.mileage.length === 0 ? (
            <p className="mt-2 text-muted">Nenhuma leitura registrada.</p>
          ) : (
            <ul className="mt-3 divide-y divide-rule border-y border-rule">
              {p.mileage.map((r, i) => (
                <li key={`${r.recorded_at}-${i}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="font-semibold text-ink">{formatKm(r.mileage)}</span>
                  <span className="text-sm text-muted">
                    {formatDate(r.recorded_at, 'short')}, {SOURCE_LABEL[r.source_type].toLowerCase()}
                    {r.below_previous && <span className="text-stamp">, menor que uma leitura anterior</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {p.options.history && (
        <section aria-labelledby="history-title">
          <h2 id="history-title" className="heading text-2xl text-ink">Histórico de serviços</h2>
          {history.length === 0 && <p className="mt-2 text-muted">Nenhum serviço registrado.</p>}
          <div className="mt-3 flex flex-col gap-3">
            {history.map((h, i) => {
              const color = SOURCE_COLOR[h.evidence_level]
              return (
                <article key={`${h.service_date}-${i}`} aria-label={`${CATEGORY_LABEL[h.category]}: ${h.title}`} className="rounded-sheet border border-rule bg-sheet p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-muted">{formatDate(h.service_date, 'short')}, {CATEGORY_LABEL[h.category]}</p>
                      <h3 className="mt-0.5 font-semibold text-ink">{h.title}</h3>
                    </div>
                    <span className="rounded-[0.4rem] border-2 px-2 py-0.5 text-xs font-semibold"
                      style={{ borderColor: color, color, boxShadow: `inset 0 0 0 1px var(--color-sheet), inset 0 0 0 2px ${color}` }}>
                      {SOURCE_LABEL[h.evidence_level]}
                    </span>
                  </div>
                  <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                    {h.mileage !== null && <div className="flex gap-1.5"><dt className="text-muted">Km</dt><dd className="font-semibold text-graphite">{formatKm(h.mileage)}</dd></div>}
                    {h.workshop_name && <div className="flex gap-1.5"><dt className="text-muted">Oficina</dt><dd className="font-semibold text-graphite">{h.workshop_name}</dd></div>}
                    {p.options.values && h.service_value_cents !== null && (
                      <div className="flex gap-1.5"><dt className="text-muted">Valor</dt><dd className="font-semibold text-graphite">{formatBRL(h.service_value_cents)}</dd></div>
                    )}
                  </dl>
                  {h.description && <p className="mt-3 whitespace-pre-line text-graphite">{h.description}</p>}
                  {h.items.length > 0 && (
                    <p className="mt-2 text-sm text-muted">
                      Peças: {h.items.map((it) => [it.item_name, it.brand].filter(Boolean).join(' ')).join('; ')}
                    </p>
                  )}
                  {p.options.attachments && h.attachments && h.attachments.length > 0 && <SharedFiles token={token ?? ''} files={token ? h.attachments : h.attachments.map(({ kind }) => ({ kind }))} />}
                  {h.is_correction && <p className="mt-2 text-xs text-stamp">Versão corrigida de um registro anterior.</p>}
                </article>
              )
            })}
          </div>
        </section>
      )}

      {p.options.diary && p.diary && p.diary.length > 0 && (
        <section aria-labelledby="diary-title">
          <h2 id="diary-title" className="heading text-2xl text-ink">Diário</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {p.diary.map((d, i) => (
              <li key={`${d.entry_date}-${i}`} className="rounded-doc border border-rule bg-sheet p-4">
                <p className="text-sm text-muted">{formatDate(d.entry_date, 'short')}, {DIARY_CATEGORY_LABEL[d.category]}{d.location ? `, ${d.location}` : ''}</p>
                <p className="heading mt-0.5 text-lg text-ink">{d.title}</p>
                {d.body && <p className="mt-2 whitespace-pre-line text-graphite">{d.body}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-col gap-3 text-sm text-muted">
        <Notice tone="info">
          Este link foi criado pelo proprietário, que escolheu o que mostrar{p.expires_at ? ` e vale até ${formatDate(p.expires_at, 'short')}` : ''}.
          "Informado pelo dono" indica dado declarado; "com comprovante" e "confirmado por oficina" indicam evidência registrada.
        </Notice>
        <p>
          O Moto Passaporte organiza a história documentada da moto. Não é laudo, vistoria, perícia nem documento oficial, e não substitui a consulta ao DETRAN.
        </p>
      </div>
    </div>
  )
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="font-semibold text-ink">{value}</dd>
    </div>
  )
}
