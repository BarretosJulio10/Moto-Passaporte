import { Link } from 'react-router-dom'
import { claimPath, type LinkKind } from './api'

/** Caixa nas páginas públicas (orçamento e OS): guardar o atendimento no painel do Moto Passaporte. */
export function SaveToAccount({ kind, token, workshop }: { kind: LinkKind; token: string; workshop: string }) {
  return (
    <div className="rounded-sheet border border-rule bg-sheet p-4 text-sm print:hidden">
      <p className="font-semibold text-ink">Acompanhe pelo Moto Passaporte</p>
      <p className="mt-1 text-graphite">Com uma conta grátis você vê os orçamentos e serviços da {workshop} no seu painel e recebe os avisos. Não é preciso para aprovar.</p>
      <Link to={claimPath(kind, token)} className="mt-2 inline-block font-semibold text-ink underline underline-offset-4">Guardar na minha conta</Link>
    </div>
  )
}
