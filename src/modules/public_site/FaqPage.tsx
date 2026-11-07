import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { usePublicSettings } from './usePublicSettings'

// Respostas fiéis ao que existe hoje. Recursos ainda não lançados são indicados como "em breve" (PRD 3.4).

type Item = { q: string; a: ReactNode }

export function FaqPage() {
  const { data } = usePublicSettings()
  const limit = data?.freePlanMaxMotorcycles ?? null
  const limitText = limit !== null ? `${limit} ${limit === 1 ? 'moto' : 'motos'}` : 'uma quantidade limitada de motos'

  const groups: Array<{ title: string; items: Item[] }> = [
    {
      title: 'Sobre o passaporte',
      items: [
        {
          q: 'O que é o Moto Passaporte?',
          a: 'É um passaporte digital da sua moto: reúne quilometragem, manutenções, comprovantes e acontecimentos num histórico que continua com a moto quando ela muda de dono.',
        },
        {
          q: 'O passaporte é um laudo ou substitui o DETRAN?',
          a: 'Não. Ele organiza a história documentada da moto, mas não é laudo mecânico, vistoria nem documento oficial. Também não consulta bases do governo e não transfere a propriedade legal do veículo.',
        },
        {
          q: 'Como sei se uma informação é confiável?',
          a: 'Cada registro mostra de onde veio: informado pelo dono, com comprovante anexado ou confirmado por uma oficina participante. A plataforma não garante que tudo seja verdadeiro; ela mostra a origem para você avaliar.',
        },
        {
          q: 'E se a placa da moto mudar?',
          a: 'Basta trocar a placa na página da moto. O passaporte continua o mesmo, com o mesmo código, e a placa anterior fica no histórico.',
        },
        {
          q: 'Errei a quilometragem. Posso apagar?',
          a: 'Leituras não são apagadas, para o histórico continuar confiável. Use "Corrigir" na leitura errada e informe o motivo: a correção fica registrada e a leitura original aparece marcada como corrigida.',
        },
        {
          q: 'Tentei cadastrar minha moto e disse que a placa já existe. E agora?',
          a: 'Abrimos uma solicitação de verificação para a nossa equipe analisar. Se você comprou a moto há pouco tempo, o caminho mais rápido é pedir ao dono anterior que transfira o passaporte para você.',
        },
      ],
    },
    {
      title: 'Privacidade e compartilhamento',
      items: [
        {
          q: 'Quem pode ver os dados da minha moto?',
          a: 'Só você. A página pública do passaporte mostra apenas marca, modelo, ano, cilindrada, cor e a data de criação. Placa, chassi e seus dados pessoais nunca aparecem nela.',
        },
        {
          q: 'O que aparece quando alguém escaneia o QR Code?',
          a: 'A página pública do passaporte, com os dados básicos acima. Ela não aparece em buscadores. A opção de escolher o que mostrar ao comprador, com links que você pode desativar, chega em breve.',
        },
        {
          q: 'Como meus dados são protegidos?',
          a: (
            <>
              O acesso é controlado no próprio banco de dados, cada ação importante fica registrada e arquivos privados não ficam em links públicos.
              Veja a <Link to="/privacidade" className="font-semibold text-ink underline underline-offset-4">política de privacidade</Link>.
            </>
          ),
        },
      ],
    },
    {
      title: 'Venda da moto',
      items: [
        {
          q: 'Como funciona quando eu vender a moto?',
          a: 'Em breve você poderá transferir o passaporte para a conta do comprador. Todo o histórico continua, com a autoria de cada registro preservada, e as oficinas autorizadas por você perdem o acesso.',
        },
        {
          q: 'O comprador precisa pagar ou criar conta para ver o histórico?',
          a: 'Não. Consultar um passaporte compartilhado pelo vendedor é sempre grátis e não exige cadastro.',
        },
      ],
    },
    {
      title: 'Oficinas',
      items: [
        {
          q: 'Quanto custa para uma oficina?',
          a: 'Nada. Não há mensalidade, cobrança por registro nem por moto atendida.',
        },
        {
          q: 'Como a oficina acessa a moto de um cliente?',
          a: 'Em breve a oficina poderá pedir acesso pela placa; o dono aprova ou recusa, e pode tirar o acesso quando quiser. Hoje a oficina já pode criar o cadastro gratuito e o perfil público.',
        },
      ],
    },
    {
      title: 'Planos e pagamento',
      items: [
        {
          q: 'Preciso pagar para usar?',
          a: `Não. O plano gratuito permite ${limitText}, com histórico básico e compartilhamento com compradores. O Premium, com mais espaço para anexos, relatórios em PDF e lembretes, chega em breve.`,
        },
        {
          q: 'Como será o pagamento do Premium?',
          a: 'Pelo Mercado Pago, em ambiente seguro do próprio Mercado Pago. O Moto Passaporte não guarda número de cartão.',
        },
        {
          q: 'Se eu cancelar, perco o histórico?',
          a: 'Não. O cancelamento encerra os benefícios Premium, mas a identidade da moto e o histórico continuam. Antes de qualquer mudança nos anexos, você será avisado e poderá exportar seus dados.',
        },
      ],
    },
  ]

  return (
    <div className="mx-auto max-w-3xl px-5 py-14">
      <h1 className="heading text-4xl text-ink">Perguntas frequentes</h1>
      <p className="mt-3 text-muted">
        Não achou sua dúvida? <Link to="/contato" className="font-semibold text-ink underline underline-offset-4">Fale com a gente</Link>.
      </p>
      <div className="mt-10 space-y-12">
        {groups.map((g) => (
          <section key={g.title} aria-labelledby={`faq-${g.title}`}>
            <h2 id={`faq-${g.title}`} className="heading text-2xl text-ink">{g.title}</h2>
            <div className="mt-4 divide-y divide-rule border-y border-rule">
              {g.items.map((item) => (
                <details key={item.q} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-semibold text-ink">
                    <span>{item.q}</span>
                    <span aria-hidden="true" className="mt-0.5 text-xl leading-none text-muted transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <div className="mt-3 max-w-[68ch] text-graphite">{item.a}</div>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
