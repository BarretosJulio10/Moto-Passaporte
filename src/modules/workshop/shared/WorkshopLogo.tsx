import { useQuery } from '@tanstack/react-query'
import { getSupabase } from '@/lib/supabase'

/**
 * Logotipo da oficina nos documentos. "storage:workshop-files/<caminho>" é o logo enviado no perfil (link temporário);
 * outro valor é um endereço comum. Sem logo ou sem permissão de leitura, não mostra nada.
 */
export function WorkshopLogo({ src, className = 'h-14 w-14 rounded-doc object-contain' }: { src: string | null | undefined; className?: string }) {
  const stored = src?.startsWith('storage:workshop-files/') ? src.slice('storage:workshop-files/'.length) : null
  const signed = useQuery({
    queryKey: ['workshop-logo', stored],
    enabled: Boolean(stored),
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await getSupabase().storage.from('workshop-files').createSignedUrl(stored!, 3600)
      if (error) return null
      return data.signedUrl
    },
  })
  const url = stored ? signed.data : src && /^https:\/\//.test(src) ? src : null
  if (!url) return null
  return <img src={url} alt="" className={className} />
}
