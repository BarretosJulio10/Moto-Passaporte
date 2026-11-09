import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Notice } from '@/components/Notice'
import { getSupabase } from '@/lib/supabase'

/** Link "parar de receber avisos por e-mail" (ADR-064): funciona sem entrar na conta. */
export function UnsubscribePage() {
  const [params] = useSearchParams()
  const token = params.get('t') ?? ''
  const [state, setState] = useState<'loading' | 'done' | 'invalid' | 'error'>('loading')

  useEffect(() => {
    if (!/^[0-9a-f-]{36}$/i.test(token)) {
      setState('invalid')
      return
    }
    getSupabase().rpc('email_unsubscribe' as never, { p_token: token } as never)
      .then(({ data, error }) => setState(error ? 'error' : data ? 'done' : 'invalid'))
  }, [token])

  return (
    <div className="mx-auto max-w-2xl px-5 py-14">
      <h1 className="heading text-3xl text-ink">Avisos por e-mail</h1>
      <div className="mt-6">
        {state === 'loading' && <p className="text-muted" role="status">Atualizando…</p>}
        {state === 'done' && (
          <Notice tone="success" title="Pronto, você não vai mais receber avisos por e-mail.">
            Avisos essenciais sobre cobrança da sua assinatura continuam chegando. Para voltar a receber, entre na sua conta e ligue em Notificações.
          </Notice>
        )}
        {state === 'invalid' && <Notice tone="error">Este link não é válido ou já expirou. Entre na sua conta e ajuste em Notificações.</Notice>}
        {state === 'error' && <Notice tone="error">Não foi possível atualizar agora. Tente de novo em alguns minutos.</Notice>}
      </div>
      <p className="mt-6 text-sm"><Link to="/painel/notificacoes" className="font-semibold text-ink underline underline-offset-4">Abrir minhas notificações</Link></p>
    </div>
  )
}
