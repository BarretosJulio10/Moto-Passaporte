import { Link } from 'react-router-dom'
import { Notice } from '@/components/Notice'
import { usePublicSettings } from './usePublicSettings'

/** Canais de atendimento vêm de system_settings (support_email, support_whatsapp). */
export function ContactPage() {
  const { data, isLoading } = usePublicSettings()
  const email = data?.supportEmail ?? null
  const whatsapp = data?.supportWhatsapp ?? null
  const hasChannel = Boolean(email || whatsapp)

  return (
    <div className="mx-auto max-w-3xl px-5 py-14">
      <h1 className="heading text-4xl text-ink">Contato</h1>
      <p className="mt-3 max-w-xl text-muted">
        Dúvidas sobre sua conta, uma moto ou a sua oficina? Antes de escrever, veja se a resposta está nas{' '}
        <Link to="/perguntas-frequentes" className="font-semibold text-ink underline underline-offset-4">perguntas frequentes</Link>.
      </p>

      <div className="mt-10">
        {isLoading && <p className="text-muted" role="status">Carregando canais…</p>}
        {!isLoading && hasChannel && (
          <dl className="divide-y divide-rule border-y border-rule">
            {email && (
              <div className="grid gap-1 py-5 sm:grid-cols-[10rem_1fr]">
                <dt className="font-semibold text-ink">E-mail</dt>
                <dd>
                  <a href={`mailto:${email}`} className="font-semibold text-ink underline underline-offset-4">{email}</a>
                </dd>
              </div>
            )}
            {whatsapp && (
              <div className="grid gap-1 py-5 sm:grid-cols-[10rem_1fr]">
                <dt className="font-semibold text-ink">WhatsApp</dt>
                <dd>
                  <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer" className="font-semibold text-ink underline underline-offset-4">
                    Abrir conversa
                  </a>
                </dd>
              </div>
            )}
          </dl>
        )}
        {!isLoading && !hasChannel && (
          <Notice tone="info" title="Canais de atendimento em definição">
            Os canais de contato serão publicados aqui em breve.
          </Notice>
        )}
      </div>

      <p className="mt-8 text-sm text-muted">
        Por segurança, nunca pedimos senha, código de verificação ou dados de cartão por e-mail ou WhatsApp.
      </p>
    </div>
  )
}
