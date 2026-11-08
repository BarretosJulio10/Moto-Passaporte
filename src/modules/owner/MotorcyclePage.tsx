import { Link, useLocation, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Notice } from '@/components/Notice'
import { ButtonLink } from '@/components/Button'
import { formatDate, formatKm } from '@/core/shared/format'
import { fetchMotorcycle } from '@/modules/motorcycles/api'
import { PlateSection } from '@/modules/motorcycles/PlateSection'
import { ChassisSection } from '@/modules/motorcycles/ChassisSection'
import { MileageSection } from '@/modules/motorcycles/MileageSection'
import { QrCodePanel } from '@/modules/sharing/QrCodePanel'
import { MotoHeader } from '@/modules/motorcycles/MotoHeader'
import { RecentRecords } from '@/modules/maintenance/RecentRecords'
import { OwnerAccessSection } from '@/modules/workshop_access/OwnerAccessSection'
import { TransferSection } from '@/modules/transfers/TransferSection'
import { ShareSection } from '@/modules/sharing/ShareSection'
import { RemindersSection } from '@/modules/reminders/RemindersSection'

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="font-semibold text-ink">{value}</dd>
    </div>
  )
}

export function MotorcyclePage() {
  const { id = '' } = useParams()
  const location = useLocation()
  const justCreated = (location.state as { created?: boolean } | null)?.created === true
  const justTransferred = (location.state as { transferred?: boolean } | null)?.transferred === true

  const moto = useQuery({ queryKey: ['motorcycle', id], queryFn: () => fetchMotorcycle(id), enabled: Boolean(id) })

  if (moto.isLoading) return <p className="text-muted" role="status">Carregando…</p>
  if (moto.isError) return <Notice tone="error">Não foi possível carregar esta moto. Recarregue a página.</Notice>
  if (!moto.data || !moto.data.id || !moto.data.public_id) {
    return (
      <div>
        <h1 className="heading text-3xl text-ink">Moto não encontrada</h1>
        <p className="mt-2 text-muted">Ela não existe ou não está na sua conta.</p>
        <Link to="/painel" className="mt-5 inline-block font-semibold text-ink underline underline-offset-4">Voltar ao painel</Link>
      </div>
    )
  }

  const m = moto.data
  const motoId: string = moto.data.id
  const publicId: string = moto.data.public_id
  const year = m.model_year ? `${m.manufacturing_year}/${m.model_year}` : String(m.manufacturing_year)

  return (
    <div>
      <MotoHeader motorcycleId={motoId} />
      {justTransferred && (
        <div className="mt-6">
          <Notice tone="success" title="Agora o passaporte é seu">
            Todo o histórico veio junto. Oficinas do dono anterior não têm mais acesso; quando você levar a moto a uma oficina, ela pede acesso e você autoriza.
          </Notice>
        </div>
      )}
      {justCreated && (
        <div className="mt-6">
          <Notice tone="success" title="Passaporte criado">
            A moto já tem identidade própria. Use o QR Code para mostrar o passaporte a quem você quiser.
          </Notice>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-doc border border-rule bg-sheet p-4">
        <p className="text-sm text-graphite">
          <span className="font-semibold text-ink">Check-up da moto:</span> km, troca de óleo e corrente numa tela só. Avisamos todo sábado às 10h.
        </p>
        <ButtonLink to={`/painel/motos/${motoId}/checkup`} size="sm">Abrir check-up</ButtonLink>
      </div>

      {/* Celular: tudo em sequência. Notebook: 2 colunas. Monitor: dados | cuidados e compartilhamento | QR Code. */}
      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_19rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-sheet border border-rule bg-sheet p-5 sm:grid-cols-3">
            <Field label="Ano" value={year} />
            <Field label="Cilindrada" value={m.displacement_cc ? `${m.displacement_cc} cm³` : '—'} />
            <Field label="Cor" value={m.color ?? '—'} />
            <Field label="Última leitura" value={formatKm(m.latest_mileage)} />
            <Field label="Na sua conta desde" value={formatDate(m.owned_since, 'short')} />
            <Field label="Comprada em" value={formatDate(m.acquisition_date, 'short')} />
          </dl>
          <div className="grid gap-8 sm:grid-cols-2">
            <PlateSection motorcycleId={motoId} />
            <ChassisSection motorcycleId={motoId} />
          </div>
          <RecentRecords motorcycleId={motoId} />
          <p className="-mt-4 text-sm">
            <Link to={`/painel/motos/${motoId}/relatorio`} className="font-semibold text-ink underline underline-offset-4">
              Relatório do histórico em PDF
            </Link>
          </p>
          <MileageSection motorcycleId={motoId} />
        </div>
        <aside className="flex min-w-0 flex-col gap-8 lg:col-start-2 lg:row-start-1 2xl:col-start-3">
          <QrCodePanel publicId={publicId} label={`${m.brand}-${m.model}`} motorcycleId={motoId} />
        </aside>
        <div className="flex min-w-0 flex-col gap-8 lg:col-span-2 2xl:col-span-1 2xl:col-start-2 2xl:row-start-1">
          <RemindersSection motorcycleId={motoId} />
          <ShareSection motorcycleId={motoId} />
          <OwnerAccessSection motorcycleId={motoId} />
          <TransferSection motorcycleId={motoId} />
        </div>
      </div>
    </div>
  )
}
