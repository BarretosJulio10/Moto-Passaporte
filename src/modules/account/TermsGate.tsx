import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { LEGAL_VERSIONS } from '@/core/config/env'
import { getSupabase } from '@/lib/supabase'
import { PremiumLink } from '@/modules/plans/PremiumLink'

async function fetchAcceptedVersion(userId: string): Promise<string | null> {
  const { data, error } = await getSupabase().from('profiles').select('terms_version').eq('id', userId).maybeSingle()
  if (error) throw error
  return (data?.terms_version as string | null | undefined) ?? null
}

async function acceptCurrentTerms() {
  const { error } = await getSupabase().rpc('accept_current_terms', {
    p_terms_version: LEGAL_VERSIONS.terms, p_privacy_version: LEGAL_VERSIONS.privacy,
  })
  if (error) throw error
}

/** Novo aceite dos Termos quando a versão muda (PRD 2.4: regras do plano gratuito). */
export function TermsGate({ userId }: { userId: string }) {
  const qc = useQueryClient()
  const accepted = useQuery({ queryKey: ['terms-accepted', userId], queryFn: () => fetchAcceptedVersion(userId), staleTime: 5 * 60_000, retry: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!accepted.isSuccess || accepted.data === LEGAL_VERSIONS.terms) return null

  async function accept() {
    setBusy(true)
    setError(null)
    try {
      await acceptCurrentTerms()
      qc.setQueryData(['terms-accepted', userId], LEGAL_VERSIONS.terms)
    } catch {
      setError('Não foi possível registrar o aceite. Tente de novo.')
    }
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="terms-gate-title">
      <div className="w-full max-w-lg rounded-sheet border border-rule bg-sheet p-6 shadow-xl">
        <h2 id="terms-gate-title" className="heading text-2xl text-ink">Atualizamos os Termos de uso</h2>
        <p className="mt-3 text-graphite">O que muda no plano gratuito:</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-graphite">
          <li>Seu histórico continua inteiro guardado, sem limite de registros. Nada é apagado.</li>
          <li>Os 2 registros mais recentes de cada moto mostram todos os detalhes e comprovantes. Os demais ficam no cofre, com data, serviço e oficina.</li>
          <li>O link para comprador mostra um resumo do histórico.</li>
          <li>Você pode baixar todos os seus dados e comprovantes, de graça, em Minha conta.</li>
          <li>No Premium, tudo fica aberto.</li>
        </ul>
        <p className="mt-3 text-sm text-muted">
          Leia os <Link to="/termos" target="_blank" className="underline underline-offset-4">Termos de uso</Link> e a{' '}
          <Link to="/privacidade" target="_blank" className="underline underline-offset-4">Política de privacidade</Link> (versão {LEGAL_VERSIONS.terms}).
        </p>
        {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
        <div className="mt-5 flex flex-wrap gap-2">
          <Button loading={busy} onClick={accept}>Li e aceito</Button>
          <PremiumLink className="px-3 py-2 text-sm font-semibold text-ink underline underline-offset-4">Ver planos</PremiumLink>
        </div>
      </div>
    </div>
  )
}
