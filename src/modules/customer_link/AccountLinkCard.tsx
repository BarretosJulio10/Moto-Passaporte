import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { translateDbError } from '@/core/shared/dbErrors'
import { Card } from '@/modules/workshop/shared/WorkshopShell'
import { formatDateTime } from '@/modules/workshop/shared/rpc'
import { whatsappUrl } from '@/modules/workshop/quotes/api'
import { claimPath, createInvite, inviteText, unlinkByWorkshop } from './api'

const SOURCE: Record<string, string> = { invite: 'pelo convite', quote: 'pelo link do orçamento', order: 'pelo link da OS' }

/** Na ficha do cliente: convite para a conta Moto Passaporte e situação do vínculo (PRD 2.1 §4.3). */
export function AccountLinkCard({ orgId, workshopName, customer, canInvite, isResponsible }: {
  orgId: string; workshopName: string
  customer: { id: string; full_name: string; whatsapp: string | null; phone: string | null; status: string; user_id?: string | null; linked_at?: string | null; link_source?: string | null }
  canInvite: boolean; isResponsible: boolean
}) {
  const qc = useQueryClient()
  const [link, setLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const phone = customer.whatsapp ?? customer.phone

  async function invite() {
    setBusy(true)
    setError(null)
    try {
      const r = await createInvite(orgId, customer.id)
      setLink(`${window.location.origin}${claimPath('invite', r.token)}`)
    } catch (err) {
      setError(translateDbError(err as { code?: string; message?: string }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Conta Moto Passaporte">
      {customer.user_id ? (
        <>
          <p className="text-sm text-graphite">Ligada em {formatDateTime(customer.linked_at)} {SOURCE[customer.link_source ?? ''] ?? ''}. O cliente vê orçamentos e serviços desta oficina no painel dele e recebe os avisos de andamento.</p>
          {isResponsible && <Button className="mt-2" size="sm" variant="quiet" onClick={async () => {
            if (!window.confirm('Desfazer o vínculo? O cliente deixa de ver os atendimentos desta oficina no painel.')) return
            try { await unlinkByWorkshop(orgId, customer.id); await qc.invalidateQueries({ queryKey: ['ws-customer', orgId, customer.id] }) } catch (err) { setError(translateDbError(err as { code?: string; message?: string })) }
          }}>Desfazer vínculo</Button>}
        </>
      ) : (
        <>
          <p className="text-sm text-graphite">Ainda sem conta ligada. O cliente não precisa de conta para receber e aprovar orçamentos; com ela, acompanha tudo pelo painel. O vínculo só acontece quando ele mesmo abre o link e confirma.</p>
          {canInvite && customer.status === 'active' && !link && <Button className="mt-3" size="sm" variant="secondary" loading={busy} onClick={invite}>Convidar para o Moto Passaporte</Button>}
          {link && (
            <div className="mt-3 flex flex-col items-start gap-2">
              {phone ? <a href={whatsappUrl(phone, inviteText({ customerName: customer.full_name, workshopName, link }))} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center rounded-doc bg-ink px-4 py-2 text-sm font-semibold text-sheet hover:bg-ink-soft">Enviar convite pelo WhatsApp</a> : null}
              <Button size="sm" variant="quiet" onClick={() => navigator.clipboard?.writeText(link)}>Copiar link</Button>
              <p className="text-xs text-muted">Vale 30 dias e serve uma vez. Gerar outro desativa este.</p>
            </div>
          )}
        </>
      )}
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
    </Card>
  )
}
