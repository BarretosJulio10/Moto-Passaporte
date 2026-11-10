// Converte erros do Supabase Auth em mensagens claras em português.
// Mensagens dizem o que aconteceu e como resolver, sem pedir desculpas.

type MaybeAuthError = { code?: string; message?: string; status?: number } | null | undefined

const BY_CODE: Record<string, string> = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  email_not_confirmed: 'Confirme seu e-mail antes de entrar. Procure a mensagem que enviamos para a sua caixa de entrada.',
  user_already_exists: 'Já existe uma conta com este e-mail. Entre ou recupere sua senha.',
  email_exists: 'Já existe uma conta com este e-mail. Entre ou recupere sua senha.',
  weak_password: 'Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.',
  over_email_send_rate_limit: 'Muitos e-mails enviados em pouco tempo. Aguarde alguns minutos e tente de novo.',
  over_request_rate_limit: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.',
  same_password: 'A nova senha precisa ser diferente da atual.',
  session_not_found: 'Sua sessão expirou. Entre novamente.',
  otp_expired: 'O link expirou. Peça um novo link.',
  validation_failed: 'Confira os dados informados.',
  signup_disabled: 'Novos cadastros estão temporariamente desativados.',
  insufficient_aal: 'Digite o código do app autenticador para confirmar.',
  mfa_verification_failed: 'Código do app autenticador incorreto. Confira e tente de novo.',
}

const BY_MESSAGE: Array<[RegExp, string]> = [
  [/invalid login credentials/i, BY_CODE.invalid_credentials!],
  [/email not confirmed/i, BY_CODE.email_not_confirmed!],
  [/already registered/i, BY_CODE.user_already_exists!],
  [/password should be at least/i, BY_CODE.weak_password!],
  [/AAL2 session is required/i, 'Digite o código do app autenticador para confirmar.'],
  [/invalid totp code|mfa verification/i, 'Código do app autenticador incorreto. Confira e tente de novo.'],
  [/rate limit/i, BY_CODE.over_request_rate_limit!],
  [/failed to fetch|network/i, 'Sem conexão com o servidor. Verifique sua internet e tente de novo.'],
]

export function translateAuthError(error: MaybeAuthError): string {
  if (!error) return 'Não foi possível concluir a operação. Tente de novo.'
  if (error.code && BY_CODE[error.code]) return BY_CODE[error.code]!
  const message = error.message ?? ''
  for (const [pattern, text] of BY_MESSAGE) {
    if (pattern.test(message)) return text
  }
  return 'Não foi possível concluir a operação. Tente de novo.'
}
