// Modo loja (ADR-063): o app da Google Play é uma "casca" (TWA) que abre este mesmo site.
// Pela regra de pagamentos da Play, dentro dele não pode haver preço, botão, link nem texto
// levando a pagar fora da Google. O site e o app instalado pelo navegador seguem iguais.

/** Identificador do app na Google Play (não muda nunca). */
export const PLAY_PACKAGE = 'br.com.motopassaporte.app'

const KEY = 'mp-store-app'

/**
 * O app da loja abre com `?origem=play` (start_url da casca) e o Chrome informa
 * `document.referrer = android-app://<pacote>` em toda abertura, inclusive por link.
 * A marca fica só na sessão da aba: o app da loja divide o armazenamento com o Chrome,
 * então guardar para sempre esconderia a compra também no navegador.
 */
export function detectStoreApp(
  href = typeof window !== 'undefined' ? window.location.href : '',
  referrer = typeof document !== 'undefined' ? document.referrer : '',
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof window !== 'undefined' ? safeSession() : null,
): boolean {
  let fromPlay = false
  try {
    fromPlay = new URL(href).searchParams.get('origem') === 'play' || referrer.startsWith(`android-app://${PLAY_PACKAGE}`)
  } catch {
    fromPlay = referrer.startsWith(`android-app://${PLAY_PACKAGE}`)
  }
  try {
    if (fromPlay) storage?.setItem(KEY, 'play')
    return fromPlay || storage?.getItem(KEY) === 'play'
  } catch {
    return fromPlay
  }
}

function safeSession(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/** Frases que mandam comprar, renovar ou pagar (mesma regra do envio de notificações no celular). */
export const PURCHASE_HINT = /moto extra|meu plano|assin|premium|pagamento|pix|r\$|renov|mercado pago|conheça/i

let cached: boolean | null = null

/** true dentro do app baixado da Google Play. */
export function isStoreApp(): boolean {
  if (cached === null) cached = detectStoreApp()
  return cached
}

/** Só para testes. */
export function setStoreAppForTests(value: boolean | null) {
  cached = value
}

/**
 * Tira de mensagens do servidor as frases que mandam comprar (ex.: "Inclua uma moto extra em Meu plano…").
 * Fora do app da loja, devolve a mensagem como veio.
 */
export function storeSafeText(message: string): string {
  if (!isStoreApp()) return message
  return message
    .split(/(?<=[.!?])\s+/)
    .filter((s) => !PURCHASE_HINT.test(s))
    .join(' ')
    .trim() || 'Seu plano atual não permite esta ação.'
}
