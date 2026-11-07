import { useQuery } from '@tanstack/react-query'
import { getSupabase } from '@/lib/supabase'
import { useAuth } from '@/core/auth/AuthProvider'
import { Notice } from '@/components/Notice'

export function DashboardPage() {
  const { user } = useAuth()
  const firstName = ((user?.user_metadata?.full_name as string | undefined) ?? '').split(' ')[0]

  const motorcycles = useQuery({
    queryKey: ['my-motorcycles', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('my_motorcycles')
        .select('id, public_id, brand, model, version, manufacturing_year, model_year, current_plate, latest_mileage')
        .order('passport_created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })

  return (
    <div>
      <h1 className="heading text-3xl text-ink">{firstName ? `Olá, ${firstName}` : 'Seu painel'}</h1>
      <h2 className="mt-10 font-semibold text-ink">Minhas motos</h2>

      <div className="mt-4">
        {motorcycles.isLoading && <p className="text-muted" role="status">Carregando suas motos…</p>}
        {motorcycles.isError && (
          <Notice tone="error">Não foi possível carregar suas motos. Recarregue a página para tentar de novo.</Notice>
        )}
        {motorcycles.data && motorcycles.data.length === 0 && (
          <div className="rounded-sheet border border-dashed border-rule bg-sheet p-8">
            <p className="font-semibold text-ink">Você ainda não cadastrou nenhuma moto.</p>
            <p className="mt-1 text-muted">Cadastre sua moto para criar o passaporte e começar o histórico.</p>
          </div>
        )}
        {motorcycles.data && motorcycles.data.length > 0 && (
          <ul className="divide-y divide-rule border-y border-rule">
            {motorcycles.data.map((m) => (
              <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-2 py-4">
                <div>
                  <p className="font-semibold text-ink">
                    {m.brand} {m.model} {m.version ?? ''}
                  </p>
                  <p className="text-sm text-muted">
                    {m.manufacturing_year}
                    {m.model_year ? `/${m.model_year}` : ''} · Placa {m.current_plate}
                  </p>
                </div>
                {m.latest_mileage !== null && (
                  <p className="text-sm text-graphite">{m.latest_mileage.toLocaleString('pt-BR')} km</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
