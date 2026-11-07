import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchPublicWorkshop } from './api'

function formatPhone(digits: string): string {
  const d = digits.replace(/^55(?=\d{10,11}$)/, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return digits
}

/** Perfil público da oficina (PRD 6.1). Participação na rede não é certificação técnica (PRD 6.7). */
export function PublicWorkshopPage() {
  const { slug = '' } = useParams()
  const shop = useQuery({ queryKey: ['public-workshop', slug], queryFn: () => fetchPublicWorkshop(slug), retry: false })

  if (shop.isLoading) return <p className="mx-auto max-w-3xl px-5 py-16 text-muted" role="status">Carregando…</p>
  if (shop.isError || !shop.data) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16">
        <h1 className="heading text-3xl text-ink">Oficina não encontrada</h1>
        <p className="mt-3 text-muted">O endereço pode estar errado ou o perfil não está público.</p>
        <Link to="/" className="mt-6 inline-block font-semibold text-ink underline underline-offset-4">Ir para o início</Link>
      </div>
    )
  }

  const w = shop.data
  const whats = w.whatsapp ? w.whatsapp.replace(/\D/g, '') : null
  const whatsLink = whats ? `https://wa.me/${whats.startsWith('55') ? whats : `55${whats}`}` : null

  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <p className="text-sm font-semibold text-stamp">Oficina participante Moto Passaporte</p>
      <h1 className="display mt-2 text-3xl text-ink sm:text-4xl">{w.business_name}</h1>
      {(w.city || w.state) && <p className="mt-2 text-lg text-muted">{[w.city, w.state].filter(Boolean).join(', ')}</p>}

      {w.specialties.length > 0 && (
        <ul className="mt-6 flex flex-wrap gap-2" aria-label="Especialidades">
          {w.specialties.map((s) => (
            <li key={s} className="rounded-doc border border-ink/30 bg-sheet px-2.5 py-1 text-sm font-semibold text-ink">{s}</li>
          ))}
        </ul>
      )}

      {w.description && <p className="mt-8 max-w-[68ch] whitespace-pre-line text-graphite">{w.description}</p>}

      <dl className="mt-8 divide-y divide-rule border-y border-rule">
        {w.address && (
          <div className="grid gap-1 py-4 sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted">Endereço</dt>
            <dd className="font-semibold text-ink">{w.address}</dd>
          </div>
        )}
        {w.opening_hours && (
          <div className="grid gap-1 py-4 sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted">Horário</dt>
            <dd className="font-semibold text-ink">{w.opening_hours}</dd>
          </div>
        )}
        {w.phone && (
          <div className="grid gap-1 py-4 sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted">Telefone</dt>
            <dd><a href={`tel:${w.phone}`} className="font-semibold text-ink underline underline-offset-4">{formatPhone(w.phone)}</a></dd>
          </div>
        )}
        {whatsLink && (
          <div className="grid gap-1 py-4 sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted">WhatsApp</dt>
            <dd><a href={whatsLink} target="_blank" rel="noreferrer" className="font-semibold text-ink underline underline-offset-4">Abrir conversa</a></dd>
          </div>
        )}
        {w.email && (
          <div className="grid gap-1 py-4 sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted">E-mail</dt>
            <dd><a href={`mailto:${w.email}`} className="font-semibold text-ink underline underline-offset-4">{w.email}</a></dd>
          </div>
        )}
      </dl>

      <p className="mt-8 text-sm text-muted">
        "Oficina participante" indica que a oficina usa o Moto Passaporte. Não é certificação técnica nem garantia dos serviços.
      </p>
    </div>
  )
}
