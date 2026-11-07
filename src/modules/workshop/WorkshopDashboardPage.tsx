import { Link, useLocation, useParams } from 'react-router-dom'
import { ButtonLink } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { useMyWorkshops } from './WorkshopIndexPage'
import { PlateSearchPanel } from '@/modules/workshop_access/PlateSearchPanel'
import { WorkshopAccessList } from '@/modules/workshop_access/WorkshopAccessList'

const COMING = [
  ['Registro de serviços', 'Lançar serviço, peças, quilometragem e fotos da nota no histórico da moto.'],
]

export function WorkshopDashboardPage() {
  const { orgId = '' } = useParams()
  const location = useLocation()
  const created = (location.state as { created?: boolean } | null)?.created === true
  const workshops = useMyWorkshops()

  if (workshops.isLoading) return <p className="text-muted" role="status">Carregando…</p>
  const shop = workshops.data?.find((w) => w.organization_id === orgId)
  if (!shop) {
    return (
      <div>
        <h1 className="heading text-3xl text-ink">Oficina não encontrada</h1>
        <p className="mt-2 text-muted">Ela não existe ou você não faz parte da equipe.</p>
        <Link to="/oficina" className="mt-5 inline-block font-semibold text-ink underline underline-offset-4">Voltar</Link>
      </div>
    )
  }

  const publicUrl = `/oficinas/${shop.public_slug}`

  return (
    <div>
      {created && (
        <div className="mb-6">
          <Notice tone="success" title="Oficina cadastrada">
            Complete o perfil com especialidades, horário e descrição para os motociclistas encontrarem você.
          </Notice>
        </div>
      )}
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="heading text-3xl text-ink">{shop.business_name}</h1>
          <p className="mt-1 text-muted">
            {[shop.city, shop.state].filter(Boolean).join(', ') || 'Cidade não informada'}
            {shop.role === 'responsible' ? ', você é o responsável' : ', você é da equipe'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink to={`/oficina/${shop.organization_id}/equipe`} variant="secondary" size="sm">Equipe</ButtonLink>
          {shop.role === 'responsible' && (
            <ButtonLink to={`/oficina/${shop.organization_id}/perfil`} variant="secondary" size="sm">Editar perfil</ButtonLink>
          )}
        </div>
      </div>

      <dl className="mt-8 grid gap-x-8 gap-y-4 border-y border-rule py-5 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-muted">Perfil público</dt>
          <dd>
            <a href={publicUrl} target="_blank" rel="noreferrer" className="font-semibold text-ink underline underline-offset-4">
              {window.location.host}{publicUrl}
            </a>
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Cadastro</dt>
          <dd className="font-semibold text-ink">
            {shop.verification_status === 'verified' ? 'Verificado pela equipe Moto Passaporte' : 'Oficina participante'}
          </dd>
        </div>
      </dl>

      <div className="mt-8 flex flex-col gap-8">
        {shop.can_request_access ? (
          <PlateSearchPanel organizationId={shop.organization_id} />
        ) : (
          <Notice tone="info" title="Pesquisa por placa">
            Seu acesso nesta oficina não inclui pesquisar placas e pedir acesso. Fale com o responsável se precisar.
          </Notice>
        )}
        <WorkshopAccessList organizationId={shop.organization_id} />
      </div>

      <section className="mt-10" aria-labelledby="coming-title">
        <h2 id="coming-title" className="heading text-2xl text-ink">Chegando em breve</h2>
        <p className="mt-1 text-muted">Estas ferramentas estão em desenvolvimento e aparecerão aqui.</p>
        <ul className="mt-4 divide-y divide-rule border-y border-rule">
          {COMING.map(([title, text]) => (
            <li key={title} className="grid gap-1 py-4 sm:grid-cols-[13rem_1fr] sm:gap-6">
              <p className="font-semibold text-graphite">{title}</p>
              <p className="text-muted">{text}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
