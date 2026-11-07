import { LEGAL_VERSIONS } from '@/core/config/env'
import { Notice } from '@/components/Notice'

// Rascunhos derivados do PRD. Precisam de revisão jurídica antes do lançamento (PRD 15.6).

const TERMS: Array<[string, string]> = [
  ['O que é o Moto Passaporte', 'Uma plataforma para organizar e compartilhar o histórico documentado de motocicletas: manutenções, quilometragem, comprovantes e acontecimentos.'],
  ['O que o serviço não faz', 'Não emite laudo, vistoria ou certificado. Não consulta bases oficiais, não substitui o DETRAN e a transferência do passaporte não transfere a propriedade legal do veículo.'],
  ['Responsabilidade pelas informações', 'Quem registra uma informação responde por ela. A plataforma indica a origem de cada registro (dono, comprovante ou oficina), mas não garante sua veracidade.'],
  ['Histórico da motocicleta', 'Registros confirmados não são apagados nem alterados sem deixar rastro. Correções geram um novo registro, preservando o original.'],
  ['Oficinas participantes', 'Oficinas usam a plataforma gratuitamente e só acessam motocicletas com autorização ativa do proprietário. O selo de participante não é certificação técnica.'],
  ['Transferência', 'Ao concluir a transferência, o novo titular passa a controlar o passaporte, o anterior perde a edição e as autorizações de oficinas são encerradas.'],
  ['Planos e cobrança', 'Recursos Premium dependem de assinatura. Valores, renovação e cancelamento serão informados antes da contratação.'],
]

const PRIVACY: Array<[string, string]> = [
  ['Quais dados tratamos', 'Nome, e-mail e telefone da conta; dados da motocicleta; registros, fotos e documentos enviados por você ou por oficinas autorizadas.'],
  ['Para que usamos', 'Para prestar o serviço: manter o histórico, controlar acessos, enviar avisos e cumprir obrigações legais.'],
  ['O que nunca fica público', 'CPF, endereço, telefone e e-mail pessoais, dados de pagamento, chassi completo, documentos pessoais, dados de proprietários anteriores e o diário privado.'],
  ['Compartilhamento', 'Só com quem você autorizar (oficinas e compradores) e com fornecedores necessários à operação, como hospedagem e pagamento.'],
  ['Seus direitos (LGPD)', 'Você pode pedir acesso, correção, portabilidade e exclusão dos seus dados pessoais, nos limites da lei e da preservação do histórico de terceiros.'],
  ['Segurança', 'Acesso controlado no banco de dados, registros de auditoria e arquivos privados sem links públicos permanentes.'],
]

export function LegalPage({ kind }: { kind: 'terms' | 'privacy' }) {
  const isTerms = kind === 'terms'
  const items = isTerms ? TERMS : PRIVACY
  const version = isTerms ? LEGAL_VERSIONS.terms : LEGAL_VERSIONS.privacy
  return (
    <article className="mx-auto max-w-3xl px-5 py-14">
      <h1 className="heading text-4xl text-ink">{isTerms ? 'Termos de uso' : 'Política de privacidade'}</h1>
      <p className="mt-2 text-sm text-muted">Versão {version}</p>
      <div className="mt-6">
        <Notice tone="info" title="Versão preliminar">
          Este texto resume as regras do serviço e ainda passará por revisão jurídica antes do lançamento.
        </Notice>
      </div>
      <dl className="mt-10 space-y-8">
        {items.map(([title, text]) => (
          <div key={title}>
            <dt className="heading text-xl text-ink">{title}</dt>
            <dd className="mt-2 max-w-[68ch] text-graphite">{text}</dd>
          </div>
        ))}
      </dl>
    </article>
  )
}
