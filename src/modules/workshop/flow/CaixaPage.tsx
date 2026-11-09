import { PageHeader } from '@/components/AppLayout'
import { Notice } from '@/components/Notice'
import { WorkshopShell, type WorkshopContext } from '../shared/WorkshopShell'
import { formatCents } from '../shared/rpc'
import { FlowCardView, useFlow } from './EsteiraPage'
import type { FlowCard } from './stages'

/** /oficina/:orgId/caixa — o que está pronto: conferir, cobrar, mandar recibo e entregar. */
export function CaixaPage() {
  return <WorkshopShell>{(ctx) => <Caixa {...ctx} />}</WorkshopShell>
}

const GROUPS: { title: string; hint: string; pick: (c: FlowCard) => boolean }[] = [
  { title: 'Prontas pelo mecânico', hint: 'Confira os itens e a km de saída e conclua a OS.', pick: (c) => c.badges.some((b) => b.label === 'Mecânico marcou pronto') },
  { title: 'Concluídas', hint: 'Registre o pagamento, faça o checklist de saída e avise o cliente.', pick: (c) => !c.badges.some((b) => b.label === 'Mecânico marcou pronto' || b.label === 'Aguardando retirada') },
  { title: 'Aguardando retirada', hint: 'Cliente avisado. Entregue a moto quando ele chegar.', pick: (c) => c.badges.some((b) => b.label === 'Aguardando retirada') },
]

function Caixa({ orgId, perms, shop }: WorkshopContext) {
  const flow = useFlow({ orgId, perms })
  const cards = flow.cards.filter((c) => c.stage === 'caixa')
  return (
    <div>
      <PageHeader title="Caixa" intro="Motos prontas: conferir, cobrar, mandar o recibo e entregar. Cada cartão abre a OS com o pagamento e a entrega." />
      {flow.pendingTotal !== null && (
        <p className="mt-4 text-graphite">Total a receber neste mês: <strong className="text-ink">{formatCents(flow.pendingTotal)}</strong></p>
      )}
      {!perms.manage_finance && (
        <div className="mt-4 max-w-2xl"><Notice tone="info">Seu acesso não inclui o financeiro: os valores ficam com o responsável.</Notice></div>
      )}
      {flow.loading ? <p className="mt-6 text-muted" role="status">Carregando…</p> : cards.length === 0 ? (
        <p className="mt-6 rounded-doc border border-dashed border-rule p-8 text-center text-muted">Nenhuma moto pronta no momento.</p>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {GROUPS.map((g) => {
            const list = cards.filter(g.pick)
            return (
              <section key={g.title} aria-label={g.title}>
                <h2 className="heading text-lg text-ink">{g.title} <span className="text-muted">({list.length})</span></h2>
                <p className="text-sm text-muted">{g.hint}</p>
                <ul className="mt-3 space-y-2">
                  {list.map((c) => <li key={c.id}><FlowCardView card={c} touch={false} orgId={orgId} workshopName={shop.business_name} /></li>)}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
