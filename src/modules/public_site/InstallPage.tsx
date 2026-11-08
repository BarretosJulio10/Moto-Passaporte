import { useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/Button'
import { canPromptInstall, isIOS, isStandalone, onPwaChange, promptInstall } from '@/core/pwa/pwa'

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-bold text-sheet">{n}</span>
      <span className="text-graphite">{children}</span>
    </li>
  )
}

/** Como instalar o app no iPhone e no Android (ADR-040). */
export function InstallPage() {
  const install = useSyncExternalStore(onPwaChange, canPromptInstall, () => false)
  const standalone = typeof window !== 'undefined' && isStandalone()
  const ios = typeof window !== 'undefined' && isIOS()
  return (
    <div className="mx-auto max-w-2xl px-5 py-14">
      <h1 className="heading text-3xl text-ink sm:text-4xl">Instale o Moto Passaporte no celular</h1>
      <p className="mt-3 text-muted">
        É o mesmo Moto Passaporte do site, com ícone na tela inicial, abrindo em tela cheia e recebendo os avisos no celular, mesmo
        com o app fechado. Não precisa de loja nem ocupa espaço.
      </p>
      {standalone && <p className="mt-6 rounded-doc border border-rule bg-sheet p-4 font-semibold text-ink">Você já está usando o app instalado. 👍</p>}

      <section className={`mt-10 ${ios ? '' : 'order-2'}`} aria-labelledby="ios">
        <h2 id="ios" className="heading text-2xl text-ink">iPhone e iPad</h2>
        <ol className="mt-4 space-y-3">
          <Step n={1}>Abra <strong>moto-passaporte.vercel.app</strong> no <strong>Safari</strong> (no iPhone, a instalação só funciona pelo Safari).</Step>
          <Step n={2}>Toque no botão <strong>Compartilhar</strong> (o quadrado com a seta para cima, na barra de baixo).</Step>
          <Step n={3}>Role e toque em <strong>Adicionar à Tela de Início</strong>, depois em <strong>Adicionar</strong>.</Step>
          <Step n={4}>Abra o Moto Passaporte pelo <strong>ícone novo</strong>, entre na sua conta e toque em <strong>Ativar notificações</strong> em Notificações.</Step>
        </ol>
        <p className="mt-3 text-sm text-muted">Precisa do iOS 16.4 ou mais novo (Ajustes → Geral → Sobre). No iPhone, os avisos só chegam pelo app instalado.</p>
      </section>

      <section className="mt-10" aria-labelledby="android">
        <h2 id="android" className="heading text-2xl text-ink">Android</h2>
        {install && <Button className="mt-4" onClick={() => void promptInstall()}>Instalar agora</Button>}
        <ol className="mt-4 space-y-3">
          <Step n={1}>Abra <strong>moto-passaporte.vercel.app</strong> no <strong>Chrome</strong>.</Step>
          <Step n={2}>Toque em <strong>Instalar</strong> quando aparecer o aviso, ou no menu <strong>⋮</strong> → <strong>Instalar app</strong> (ou "Adicionar à tela inicial").</Step>
          <Step n={3}>Entre na sua conta e toque em <strong>Ativar notificações</strong> em Notificações.</Step>
        </ol>
      </section>

      <p className="mt-12">
        <Link to="/painel/notificacoes" className="font-semibold text-ink underline underline-offset-4">Ir para Notificações</Link>
      </p>
    </div>
  )
}
