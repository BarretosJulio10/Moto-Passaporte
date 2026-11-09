import { storeSafeText } from '@/core/pwa/storeApp'

// Converte erros do banco (PostgREST/RPC) em mensagens para o usuário.
// As funções do banco já lançam mensagens em português para regras de negócio
// (códigos P0001 e 22023); essas são exibidas como vieram.

type MaybeDbError = { code?: string; message?: string } | null | undefined

// Mensagens técnicas do Postgres/PostgREST (em inglês) nunca vão para a tela.
const SYSTEM_MESSAGE = /permission denied|row-level security|violates|must be owner|not allowed|JWT|relation|function|column/i

/** Regra de formato que falhou (nome da restrição na mensagem) → o que o usuário corrige. */
function checkMessage(message: string): string | null {
  if (/whatsapp|phone/i.test(message)) return 'Confira o telefone/WhatsApp: use DDD + número, ex.: (17) 99999-9999.'
  if (/plate/i.test(message)) return 'Confira a placa: são 7 letras e números, ex.: ABC1D23.'
  if (/email/i.test(message)) return 'Confira o e-mail.'
  if (/cpf/i.test(message)) return 'Confira o CPF: são 11 números.'
  if (/year/i.test(message)) return 'Confira o ano.'
  if (/\bkm\b|mileage/i.test(message)) return 'Confira a quilometragem.'
  return null
}

export function translateDbError(error: MaybeDbError): string {
  if (!error) return 'Não foi possível concluir a operação. Tente de novo.'
  const message = error.message ?? ''
  if (/failed to fetch|network|load failed/i.test(message)) {
    return 'Sem conexão com o servidor. Verifique sua internet e tente de novo.'
  }
  switch (error.code) {
    case 'P0001':
    case 'P0002':
    case '22023':
      return message ? storeSafeText(message) : 'Confira os dados informados.'
    case '42501':
      // As funções do banco usam 42501 com motivo em português (ex.: "conta desligada").
      return message && !SYSTEM_MESSAGE.test(message) ? storeSafeText(message) : 'Você não tem permissão para esta operação.'
    case '23505':
      return 'Já existe um registro com esses dados.'
    case '23514':
      return checkMessage(message) ?? 'Algum dado está fora do formato permitido. Confira os campos.'
    case 'PGRST301':
    case 'PGRST303':
      return 'Sua sessão expirou. Entre novamente.'
    default:
      return 'Não foi possível concluir a operação. Tente de novo.'
  }
}
