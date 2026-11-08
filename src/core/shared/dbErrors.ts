// Converte erros do banco (PostgREST/RPC) em mensagens para o usuário.
// As funções do banco já lançam mensagens em português para regras de negócio
// (códigos P0001 e 22023); essas são exibidas como vieram.

type MaybeDbError = { code?: string; message?: string } | null | undefined

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
      return message || 'Confira os dados informados.'
    case '42501':
      return 'Você não tem permissão para esta operação.'
    case '23505':
      return 'Já existe um registro com esses dados.'
    case '23514':
      return 'Algum dado está fora do formato permitido. Confira os campos.'
    case 'PGRST301':
    case 'PGRST303':
      return 'Sua sessão expirou. Entre novamente.'
    default:
      return 'Não foi possível concluir a operação. Tente de novo.'
  }
}
