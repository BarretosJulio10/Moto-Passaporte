import { Link, useLocation, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Notice } from '@/components/Notice'
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

      {/* Celular: dados → QR Code → quilometragem. Computador: QR Code na coluna da direita. */}
      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_17rem]">
        <div className="flex flex-col gap-8 lg:col-start-1 lg:row-start-1">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-rule py-5 sm:grid-cols-4">
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
          <RemindersSection motorcycleId={motoId} />
          <ShareSection motorcycleId={motoId} />
          <OwnerAccessSection motorcycleId={motoId} />
          <TransferSection motorcycleId={motoId} />
        </div>
        <aside className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <QrCodePanel publicId={publicId} label={`${m.brand}-${m.model}`} motorcycleId={motoId} />
        </aside>
        <div className="lg:col-start-1 lg:row-start-2">
          <MileageSection motorcycleId={motoId} />
        </div>
      </div>
    </div>
  )
}
