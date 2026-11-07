import { Link, useLocation, useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ButtonLink } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { formatDate, formatKm, formatPlate } from '@/core/shared/format'
import { uploadAll } from '@/modules/attachments/api'
import type { PendingAttachment } from '@/modules/attachments/AttachmentPicker'
import { TimelineEntryCard } from '@/modules/maintenance/TimelineEntryCard'
import { RecordForm } from '@/modules/maintenance/RecordFormPage'
import { useMyWorkshops } from '@/modules/workshop/WorkshopIndexPage'
import { fetchWorkshopAccess } from '@/modules/workshop_access/api'
import { OriginBadge } from '@/modules/workshop_access/WorkshopAccessList'
import { createWorkshopService, fetchWorkshopTimeline, getWorkshopStorageUsage } from './api'

/** Moto autorizada vista pela oficina; undefined enquanto carrega, null se sem acesso. */
function useAuthorizedMoto(orgId: string, motoId: string) {
  const list = useQuery({ queryKey: ['workshop-access', orgId], queryFn: () => fetchWorkshopAccess(orgId) })
  const moto = list.data?.find((a) => a.status === 'approved' && a.motorcycle_id === motoId)
  return { loading: list.isLoading, moto: list.isLoading ? undefined : (moto ?? null) }
}

function WorkshopMotoHeader({ orgId, motoId }: { orgId: string; motoId: string }) {
  const { moto } = useAuthorizedMoto(orgId, motoId)
  return (
    <div>
      <Link to={`/oficina/${orgId}`} className="text-sm text-ink underline underline-offset-4">Voltar ao painel da oficina</Link>
      {moto && (
        <div className="mt-4">
          <h1 className="heading text-3xl text-ink sm:text-4xl">{moto.brand} {moto.model}, {moto.manufacturing_year}</h1>
          {moto.access_type === 'origin' && <OriginBadge />}
          <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-1">
            <div className="flex gap-1.5"><dt className="text-muted">Placa</dt><dd className="font-semibold text-ink">{formatPlate(moto.plate)}</dd></div>
            <div className="flex gap-1.5">
              <dt className="text-muted">Última leitura</dt>
              <dd className="font-semibold text-ink">
                {formatKm(moto.latest_mileage)}
                {moto.latest_mileage_at && <span className="font-normal text-muted"> em {formatDate(moto.latest_mileage_at, 'short')}</span>}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  )
}

function NoAccess({ orgId }: { orgId: string }) {
  return (
    <div className="max-w-xl">
      <h1 className="heading text-3xl text-ink">Sem acesso a esta moto</h1>
      <p className="mt-2 text-muted">A autorização pode ter sido revogada pelo titular. Para voltar a acessar, faça um novo pedido.</p>
      <Link to={`/oficina/${orgId}`} className="mt-5 inline-block font-semibold text-ink underline underline-offset-4">Voltar ao painel da oficina</Link>
    </div>
  )
}

/** /oficina/:orgId/motos/:motoId — histórico técnico da moto autorizada (ADR-015). */
export function WorkshopMotoPage() {
  const { orgId = '', motoId = '' } = useParams()
  const location = useLocation()
  const queryClient = useQueryClient()
  const workshops = useMyWorkshops()
  const { loading, moto } = useAuthorizedMoto(orgId, motoId)
  const shop = workshops.data?.find((w) => w.organization_id === orgId)
  const timeline = useQuery({
    queryKey: ['workshop-timeline', orgId, motoId],
    queryFn: () => fetchWorkshopTimeline(orgId, motoId),
    enabled: Boolean(moto),
  })
  const usage = useQuery({ queryKey: ['workshop-storage', orgId], queryFn: () => getWorkshopStorageUsage(orgId), enabled: Boolean(moto), retry: false })
  const saved = (location.state as { saved?: 'created' | 'corrected'; below?: boolean; attachFailures?: string[] } | null) ?? null

  if (loading || workshops.isLoading) return <p className="text-muted" role="status">Carregando…</p>
  if (!moto || !shop) return <NoAccess orgId={orgId} />

  const canRegister = shop.can_register_services
  const entries = timeline.data ?? []
  const byId = new Map(entries.map((e) => [e.id, e]))
  const current = entries.filter((e) => e.status !== 'superseded')

  async function handleAttach(recordId: string, pending: PendingAttachment[]) {
    const failures = await uploadAll(motoId, { maintenanceRecordId: recordId, organizationId: orgId }, pending)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['workshop-timeline', orgId, motoId] }),
      queryClient.invalidateQueries({ queryKey: ['workshop-storage', orgId] }),
    ])
    return failures
  }

  return (
    <div className="flex flex-col gap-6">
      <WorkshopMotoHeader orgId={orgId} motoId={motoId} />

      {saved?.saved && (
        <div className="flex flex-col gap-3">
          <Notice tone="success" title={saved.saved === 'created' ? 'Serviço registrado' : 'Correção registrada'}>
            O registro aparece para o titular como "Confirmado por oficina", com o nome de quem registrou.
          </Notice>
          {saved.below && (
            <Notice tone="info" title="Quilometragem menor que uma leitura anterior">
              O sistema marcou a leitura como possível inconsistência. Confira o painel da moto.
            </Notice>
          )}
          {saved.attachFailures && saved.attachFailures.length > 0 && (
            <Notice tone="error" title="Alguns comprovantes não foram enviados">
              <ul>{saved.attachFailures.map((m) => <li key={m}>{m}</li>)}</ul>
            </Notice>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-5">
        <div>
          <h2 className="heading text-2xl text-ink">Histórico técnico</h2>
          <p className="mt-1 max-w-prose text-sm text-muted">
            Valores, observações e comprovantes aparecem só nos registros desta oficina. Os do titular e de outras oficinas ficam privados.
          </p>
        </div>
        {canRegister && <ButtonLink to={`/oficina/${orgId}/motos/${motoId}/servico`}>Registrar serviço</ButtonLink>}
      </div>
      {!canRegister && (
        <Notice tone="info">Seu acesso nesta oficina não inclui registrar serviços. Fale com o responsável se precisar.</Notice>
      )}

      {timeline.isLoading && <p className="text-muted" role="status">Carregando histórico…</p>}
      {timeline.isError && <Notice tone="error">Não foi possível carregar o histórico.</Notice>}
      {timeline.isSuccess && current.length === 0 && <p className="text-muted">Nenhum registro ainda.</p>}

      <div className="flex flex-col gap-4">
        {current.map((e) => (
          <TimelineEntryCard
            key={e.id}
            entry={e}
            original={e.corrects_record_id ? byId.get(e.corrects_record_id) : undefined}
            onVoid={async () => {}}
            onAttach={canRegister && e.is_own ? handleAttach : undefined}
            usage={usage.data}
            workshop={{ organizationId: orgId }}
          />
        ))}
      </div>
    </div>
  )
}

/** /oficina/:orgId/motos/:motoId/servico[?corrigir=id] — registro de serviço pela oficina (PRD 6.7). */
export function WorkshopServiceFormPage() {
  const { orgId = '', motoId = '' } = useParams()
  const [params] = useSearchParams()
  const correctingId = params.get('corrigir') ?? ''
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const workshops = useMyWorkshops()
  const { loading, moto } = useAuthorizedMoto(orgId, motoId)
  const timeline = useQuery({
    queryKey: ['workshop-timeline', orgId, motoId],
    queryFn: () => fetchWorkshopTimeline(orgId, motoId),
    enabled: Boolean(moto) && Boolean(correctingId),
  })
  const shop = workshops.data?.find((w) => w.organization_id === orgId)

  if (loading || workshops.isLoading || (correctingId && timeline.isLoading)) return <p className="text-muted" role="status">Carregando…</p>
  if (!moto || !shop) return <NoAccess orgId={orgId} />
  if (!shop.can_register_services) {
    return <Notice tone="error">Seu acesso nesta oficina não inclui registrar serviços.</Notice>
  }
  const original = correctingId ? timeline.data?.find((e) => e.id === correctingId && e.is_own && e.status === 'current') : undefined
  if (correctingId && !original) {
    return (
      <div className="flex flex-col gap-6">
        <WorkshopMotoHeader orgId={orgId} motoId={motoId} />
        <Notice tone="error">Registro a corrigir não encontrado. A oficina só corrige os próprios registros, na versão mais recente.</Notice>
      </div>
    )
  }

  return (
    <RecordForm
      key={correctingId || 'novo'}
      motorcycleId={motoId}
      original={original}
      header={<WorkshopMotoHeader orgId={orgId} motoId={motoId} />}
      intro={
        <p className="mt-2 text-muted">
          O serviço aparece para o titular como "Confirmado por oficina", com o nome da {shop.business_name} e de quem registrou.
        </p>
      }
      hideWorkshopName
      newTitle="Registrar serviço"
      submit={(input, items) => createWorkshopService(orgId, motoId, input, items)}
      upload={(recordId, pending) => uploadAll(motoId, { maintenanceRecordId: recordId, organizationId: orgId }, pending)}
      usage={{ key: ['workshop-storage', orgId], fn: () => getWorkshopStorageUsage(orgId) }}
      onDone={async (state) => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['workshop-timeline', orgId, motoId] }),
          queryClient.invalidateQueries({ queryKey: ['workshop-access', orgId] }),
          queryClient.invalidateQueries({ queryKey: ['workshop-storage', orgId] }),
        ])
        navigate(`/oficina/${orgId}/motos/${motoId}`, { replace: true, state })
      }}
    />
  )
}
