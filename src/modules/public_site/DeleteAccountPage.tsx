import { Link } from 'react-router-dom'
import { usePublicSettings } from './usePublicSettings'

/**
 * Página pública "Como excluir sua conta" (exigência da Google Play: o link precisa abrir sem login).
 * O pedido em si é feito em Minha conta → Privacidade, ou pelo suporte para quem não consegue entrar.
 */
export function DeleteAccountPage() {
  const { data } = usePublicSettings()
  const email = data?.supportEmail ?? null
  const whatsapp = data?.supportWhatsapp ?? null

  return (
    <div className="mx-auto max-w-3xl px-5 py-14">
      <h1 className="heading text-4xl text-ink">Como excluir sua conta</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Você pode pedir a exclusão da sua conta do Moto Passaporte a qualquer momento, sem custo, pelo site ou pelo app.
      </p>

      <h2 className="heading mt-10 text-2xl text-ink">Pelo app ou pelo site</h2>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-graphite">
        <li>Entre na sua conta em <Link to="/entrar" className="font-semibold text-ink underline underline-offset-4">motopassaporte.com.br/entrar</Link> ou abra o app.</li>
        <li>Toque em <strong>Minha conta</strong>.</li>
        <li>Na parte <strong>Privacidade e meus dados</strong>, em <strong>Pedido</strong>, escolha <strong>Excluir minha conta e meus dados pessoais</strong> e envie.</li>
        <li>Antes, se quiser, use <strong>Baixar meus dados</strong> e <strong>Baixar meus comprovantes</strong> para guardar uma cópia.</li>
      </ol>

      <h2 className="heading mt-10 text-2xl text-ink">Sem acesso à conta</h2>
      <p className="mt-3 text-graphite">
        Escreva para o suporte informando o e-mail da conta. Por segurança, podemos pedir uma confirmação de que a conta é sua.
      </p>
      <ul className="mt-3 space-y-1 text-graphite">
        {email && <li>E-mail: <a href={`mailto:${email}?subject=Excluir%20minha%20conta`} className="font-semibold text-ink underline underline-offset-4">{email}</a></li>}
        {whatsapp && <li>WhatsApp: <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer" className="font-semibold text-ink underline underline-offset-4">abrir conversa</a></li>}
        {!email && !whatsapp && <li><Link to="/contato" className="font-semibold text-ink underline underline-offset-4">Página de contato</Link></li>}
      </ul>

      <h2 className="heading mt-10 text-2xl text-ink">O que é apagado e o que fica</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-graphite">
        <li><strong>Apagados ou anonimizados:</strong> seus dados pessoais (nome, e-mail, telefone), seu diário e suas preferências.</li>
        <li><strong>Continuam com a moto:</strong> os registros de manutenção e quilometragem, sem os seus dados pessoais. O histórico pertence à moto e segue com o próximo dono.</li>
        <li><strong>Antes da exclusão:</strong> motos no seu nome precisam ser transferidas ou arquivadas, e assinaturas ativas são canceladas.</li>
        <li><strong>Guardados por obrigação legal:</strong> registros de pagamento e de acesso, pelo prazo que a lei exige.</li>
      </ul>
      <p className="mt-6 text-sm text-muted">
        Mais detalhes na <Link to="/privacidade" className="underline underline-offset-4">Política de privacidade</Link>.
      </p>
    </div>
  )
}
