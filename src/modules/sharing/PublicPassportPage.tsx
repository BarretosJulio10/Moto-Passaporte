import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Notice } from '@/components/Notice'
import { formatDate } from '@/core/shared/format'
import { getPublicPassport } from '@/modules/motorcycles/api'
import { isRateLimited } from '@/core/shared/rateLimit'

/** Página pública: só os campos padrão (ADR-008). Sem placa, chassi ou dados do dono. */
export function PublicPassportPage() {
  const { publicId = '' } = useParams()
  const valid = /^[0-9a-f]{32}$/.test(publicId)

  // Passaportes não devem aparecer em buscadores (privacidade).
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])

  const passport = useQuery({
    queryKey: ['public-passport', publicId],
    queryFn: () => getPublicPassport(publicId),
    enabled: valid,
    retry: false,
  })

  if (valid && passport.isLoading) {
    return <p className="mx-auto max-w-2xl px-5 py-16 text-muted" role="status">Abrindo passaporte…</p>
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
        <h1 className="heading text-3xl text-ink">Passaporte não encontrado ou indisponível</h1>
        <p className="mt-3 text-muted">Confira o link ou peça um novo QR Code ao proprietário da moto.</p>
        <Link to="/" className="mt-6 inline-block font-semibold text-ink underline underline-offset-4">Conhecer o Moto Passaporte</Link>
      </div>
    )
  }

  const p = passport.data
  const title = [p.brand, p.model, p.version].filter(Boolean).join(' ')
  const year = p.model_year ? `${p.manufacturing_year}/${p.model_year}` : String(p.manufacturing_year)

  return (
    <div className="mx-auto max-w-2xl px-5 py-12">
      <article className="guilloche overflow-hidden rounded-sheet border border-rule shadow-[0_24px_48px_-28px_rgba(28,43,74,0.45)]">
        <div className="flex items-center justify-between bg-ink px-6 py-3 text-sheet">
          <span className="heading text-sm">Moto Passaporte</span>
          <span className="text-xs text-sheet/80">Passaporte público</span>
        </div>
        <div className="p-6 sm:p-8">
          <h1 className="display text-3xl text-ink sm:text-4xl">{title}</h1>
          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-rule pt-5 sm:grid-cols-3">
            <div>
              <dt className="text-sm text-muted">Ano</dt>
              <dd className="font-semibold text-ink">{year}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Cilindrada</dt>
              <dd className="font-semibold text-ink">{p.displacement_cc ? `${p.displacement_cc} cm³` : '—'}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Cor</dt>
              <dd className="font-semibold text-ink">{p.color ?? '—'}</dd>
            </div>
            <div className="col-span-2 sm:col-span-3">
              <dt className="text-sm text-muted">Passaporte criado em</dt>
              <dd className="font-semibold text-ink">{formatDate(p.passport_created_at)}</dd>
            </div>
          </dl>
        </div>
      </article>

      <div className="mt-6 flex flex-col gap-3 text-sm text-muted">
        <Notice tone="info">
          Esta página mostra apenas as informações que o proprietário deixou públicas. O histórico detalhado só aparece quando ele escolhe compartilhar.
        </Notice>
        <p>
          O Moto Passaporte organiza a história documentada da moto. Não é laudo, vistoria nem documento oficial, e não substitui a consulta ao DETRAN.
        </p>
      </div>
    </div>
  )
}
