import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { CheckboxField } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { translateDbError } from '@/core/shared/dbErrors'
import { claimCustomer, fetchLinkPreview, kindFromSlug } from './api'

/**
 * /painel/vincular/:tipo/:token — o próprio cliente liga o cadastro da oficina à sua conta (PRD 2.1 §4.3).
 * Só com um link que a oficina enviou a ele e com confirmação; nunca por coincidência de placa ou telefone.
 */
export function ClaimPage() {
  const { kind: slug, token = '' } = useParams()
  const kind = kindFromSlug(slug)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['link-preview', slug, token], queryFn: () => fetchLinkPreview(kind!, token), enabled: Boolean(kind), retry: false })
  const [ok, setOk] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!kind) return <Notice tone="error" title="Link inválido">Confira o endereço que a oficina enviou.</Notice>
  if (q.isLoading) return <p className="text-muted" role="status">Conferindo o link…</p>
  if (q.isError || !q.data) return <Notice tone="error">{translateDbError(q.error as { code?: string; message?: string })}</Notice>
  const p = q.data

  async function confirm() {
    if (!ok) return setError('Marque a confirmação.')
    setBusy(true)
    setError(null)
    try {
      await claimCustomer(kind!, token)
      await qc.invalidateQueries({ queryKey: ['my-workshop-records'] })
      navigate('/painel/atendimentos', { replace: true, state: { linked: true } })
    } catch (err) {
      setError(translateDbError(err as { code?: string; message?: string }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="heading text-3xl text-ink">Ligar atendimento à sua conta</h1>
      {p.state === 'invalid' && <div className="mt-6"><Notice tone="error" title="Link inválido ou vencido">Peça um novo link à oficina.</Notice></div>}
      {p.state === 'mine' && (
        <div className="mt-6"><Notice tone="success" title="Já está ligado">Os atendimentos da {p.workshop} já aparecem no seu painel.</Notice>
          <Link to="/painel/atendimentos" className="mt-4 inline-block font-semibold text-ink underline underline-offset-4">Ver meus atendimentos</Link></div>
      )}
      {p.state === 'taken' && (
        <div className="mt-6"><Notice tone="error" title="Cadastro ligado a outra conta">Este cadastro da {p.workshop} já foi ligado a outra conta. Se for você, entre com ela; se não, fale com a oficina.</Notice></div>
      )}
      {p.state === 'open' && (
        <div className="mt-6 rounded-sheet border border-rule bg-sheet p-4 sm:p-6">
          <p className="text-graphite">A <span className="font-semibold text-ink">{p.workshop}</span> tem um cadastro de cliente em nome de <span className="font-semibold text-ink">{p.customer_first_name}</span>
            {p.vehicles.length > 0 ? <> com {p.vehicles.length === 1 ? 'a moto' : 'as motos'} <span className="font-semibold text-ink">{p.vehicles.join(', ')}</span></> : null}.</p>
          <p className="mt-2 text-sm text-muted">{p.quotes} orçamento{p.quotes === 1 ? '' : 's'} e {p.orders} {p.orders === 1 ? 'ordem' : 'ordens'} de serviço.</p>
          <p className="mt-4 text-sm text-graphite">Ao confirmar, você passa a ver esses atendimentos no seu painel e a receber avisos da oficina. A oficina fica sabendo que você tem conta, mas não vê seu e-mail nem suas outras motos.</p>
          <div className="mt-4"><CheckboxField checked={ok} onChange={(e) => setOk(e.target.checked)} label={`Sou eu, ${p.customer_first_name}, cliente da ${p.workshop}.`} /></div>
          {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={confirm} loading={busy}>Confirmar</Button>
            <Button variant="secondary" onClick={() => navigate('/painel')}>Agora não</Button>
          </div>
          <p className="mt-3 text-xs text-muted">Você pode desfazer depois em Meus atendimentos.</p>
        </div>
      )}
    </div>
  )
}
