import { ButtonLink } from '@/components/Button'
import { PassportSpecimen } from './PassportSpecimen'
import { usePublicSettings, welcomeLabel } from './usePublicSettings'
import { PlansGrid } from '@/modules/plans/PlansGrid'

const STEPS = [
  {
    title: 'Crie o passaporte',
    text: 'Cadastre a moto com marca, modelo, ano e placa. Ela ganha um código próprio que não muda, nem quando a placa muda.',
  },
  {
    title: 'Registre o que acontece',
    text: 'Revisões, trocas de óleo, pneus, peças e fotos, cada registro com a quilometragem do dia.',
  },
  {
    title: 'Autorize suas oficinas',
    text: 'A oficina pede acesso pela placa e você aprova. Ela registra o serviço direto no passaporte. Você pode tirar o acesso quando quiser.',
  },
  {
    title: 'Compartilhe na venda',
    text: 'Mande um link ou QR Code para o comprador consultar de graça. Depois, transfira o passaporte para a conta dele.',
  },
]

const OWNER_POINTS = [
  ['Histórico num só lugar', 'Notas fiscais, ordens de serviço, fotos e anotações deixam de ficar espalhadas no celular e no WhatsApp.'],
  ['Quilometragem documentada', 'Cada leitura fica registrada. Se uma leitura vier menor que a anterior, o passaporte mostra o aviso.'],
  ['Você decide quem vê', 'Oficinas só acessam a sua moto com a sua autorização. Comprador vê apenas o que você escolher mostrar.'],
  ['A história fica com a moto', 'Ao vender, o passaporte muda de dono e o histórico continua, com a autoria de cada registro preservada.'],
]

const WORKSHOP_POINTS = [
  ['Grátis, sempre', 'Sem mensalidade, sem cobrança por registro e sem cobrança por moto atendida.'],
  ['Registro rápido no celular', 'Placa, serviço, quilometragem e foto da nota, ali no balcão.'],
  ['Seu trabalho com seu nome', 'Cada serviço fica identificado com a sua oficina no histórico da moto.'],
  ['Perfil público', 'Sua oficina aparece na rede Moto Passaporte com especialidades e contato.'],
]

const ORIGINS = [
  ['Informado pelo dono', 'O proprietário registrou, sem comprovação independente.', 'var(--color-origin-owner)'],
  ['Com comprovante', 'Tem nota fiscal, recibo, ordem de serviço ou foto anexada.', 'var(--color-origin-document)'],
  ['Confirmado por oficina', 'Uma oficina participante registrou ou confirmou o serviço.', 'var(--color-origin-workshop)'],
] as const

function PointList({ items }: { items: string[][] }) {
  return (
    <dl className="divide-y divide-rule border-y border-rule">
      {items.map(([title, text]) => (
        <div key={title} className="grid gap-1 py-4 sm:grid-cols-[13rem_1fr] sm:gap-6">
          <dt className="font-semibold text-ink">{title}</dt>
          <dd className="text-muted">{text}</dd>
        </div>
      ))}
    </dl>
  )
}

export function HomePage() {
  const { data: settings } = usePublicSettings()
  const freeLimit = settings?.freePlanMaxMotorcycles ?? null
  const plans = settings?.plans ?? []

  return (
    <>
      {/* Abertura */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-12 md:grid-cols-[1.05fr_1fr] md:pt-20">
        <div className="max-w-xl">
          <h1 className="display text-[2.35rem] text-ink sm:text-5xl lg:text-[3.6rem]">
            A história da sua moto não precisa começar de novo a cada proprietário.
          </h1>
          <p className="mt-6 max-w-[34rem] text-lg text-muted">
            Guarde revisões, quilometragem, notas fiscais e fotos num passaporte digital. Quando você vender, o histórico vai junto com a moto.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink to="/criar-conta">Criar meu passaporte</ButtonLink>
            <ButtonLink to="/#oficinas" variant="secondary" reloadDocument>
              Sou oficina
            </ButtonLink>
          </div>
          {freeLimit !== null && (
            <p className="mt-4 text-sm text-muted">
              Grátis para {freeLimit} {freeLimit === 1 ? 'moto' : 'motos'}. Sem cartão de crédito.
              {(settings?.welcomePremiumDays ?? 0) > 0 && <> Quem cria a conta ganha {welcomeLabel(settings!.welcomePremiumDays)} de Premium.</>}
            </p>
          )}
        </div>
        <div className="flex justify-center md:justify-end">
          <PassportSpecimen />
        </div>
      </section>

      {/* Como funciona — sequência real, por isso numerada */}
      <section id="como-funciona" className="scroll-mt-20 border-t border-rule bg-sheet">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="heading max-w-2xl text-3xl text-ink">Como funciona</h2>
          <ol className="mt-10 grid gap-x-8 gap-y-10 md:grid-cols-4">
            {STEPS.map((step, i) => (
              <li key={step.title} className="border-t-2 border-ink pt-4">
                <span className="heading text-2xl text-brass" aria-hidden="true">{i + 1}</span>
                <h3 className="mt-2 font-semibold text-ink">{step.title}</h3>
                <p className="mt-2 text-muted">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Motociclistas */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="grid gap-10 md:grid-cols-[1fr_1.6fr]">
          <div>
            <h2 className="heading text-3xl text-ink">Para quem tem moto</h2>
            <p className="mt-4 max-w-sm text-muted">
              Do dia a dia às viagens longas, da primeira revisão à venda.
            </p>
          </div>
          <PointList items={OWNER_POINTS} />
        </div>
      </section>

      {/* Oficinas */}
      <section id="oficinas" className="scroll-mt-20 bg-ink text-sheet">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-[1fr_1.6fr]">
          <div>
            <h2 className="heading text-3xl">Para oficinas</h2>
            <p className="mt-4 max-w-sm text-sheet/80">
              Uma ferramenta gratuita para documentar o serviço e manter o cliente por perto.
            </p>
            <ButtonLink to="/oficina/nova" variant="inverse" className="mt-6">Cadastrar minha oficina</ButtonLink>
          </div>
          <dl className="divide-y divide-sheet/20 border-y border-sheet/20">
            {WORKSHOP_POINTS.map(([title, text]) => (
              <div key={title} className="grid gap-1 py-4 sm:grid-cols-[13rem_1fr] sm:gap-6">
                <dt className="font-semibold">{title}</dt>
                <dd className="text-sheet/80">{text}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Honestidade — PRD 3.4 */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="grid gap-10 md:grid-cols-[1fr_1.6fr]">
          <div>
            <h2 className="heading text-3xl text-ink">O que o passaporte é, e o que não é</h2>
          </div>
          <div>
            <p className="max-w-2xl text-lg text-graphite">
              O Moto Passaporte organiza a história documentada da moto. Não é laudo mecânico nem vistoria, não substitui o DETRAN e não transfere a propriedade legal do veículo.
            </p>
            <p className="mt-4 max-w-2xl text-muted">
              Também não garante que tudo o que foi informado é verdadeiro. Em vez disso, mostra de onde veio cada registro:
            </p>
            <ul className="mt-6 grid gap-4 sm:grid-cols-3">
              {ORIGINS.map(([title, text, color]) => (
                <li key={title} className="rounded-doc border-2 bg-sheet p-4" style={{ borderColor: color }}>
                  <p className="font-semibold" style={{ color }}>{title}</p>
                  <p className="mt-1 text-sm text-muted">{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Planos — valores vêm da configuração; nada fixo no código */}
      <section id="planos" className="scroll-mt-20 border-t border-rule bg-sheet">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="heading text-3xl text-ink">Planos</h2>
          {(settings?.welcomePremiumDays ?? 0) > 0 && (
            <p className="mt-2 max-w-2xl text-graphite">
              Toda conta nova começa com <strong>{welcomeLabel(settings!.welcomePremiumDays)} de Premium grátis</strong>, sem cartão. Depois você escolhe: assina para continuar ou segue no plano gratuito, sem perder motos nem histórico.
            </p>
          )}
          {plans.length > 0 ? (
            <PlansGrid plans={plans} billingEnabled={settings?.billingEnabled ?? false} />
          ) : (
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            <div className="border-t-2 border-ink pt-4">
              <h3 className="font-semibold text-ink">Gratuito</h3>
              <p className="mt-2 text-muted">
                {freeLimit !== null
                  ? `${freeLimit} ${freeLimit === 1 ? 'moto' : 'motos'}, histórico básico e compartilhamento com compradores.`
                  : 'Histórico básico e compartilhamento com compradores.'}
              </p>
              <ButtonLink to="/criar-conta" variant="secondary" className="mt-5">Criar conta grátis</ButtonLink>
            </div>
            <div className="border-t-2 border-rule pt-4">
              <h3 className="font-semibold text-ink">Premium</h3>
              <p className="mt-2 text-muted">
                Mais espaço para anexos, relatórios em PDF e lembretes de manutenção. Em breve.
              </p>
            </div>
            <div className="border-t-2 border-rule pt-4">
              <h3 className="font-semibold text-ink">Para quem vai comprar</h3>
              <p className="mt-2 text-muted">
                Consultar um passaporte compartilhado pelo vendedor é sempre grátis e não exige conta.
              </p>
            </div>
          </div>
          )}
        </div>
      </section>
    </>
  )
}
