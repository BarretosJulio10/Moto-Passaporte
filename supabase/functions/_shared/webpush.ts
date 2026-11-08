// Web Push padrão (RFC 8030/8291/8292) só com Web Crypto, sem bibliotecas (ADR-040).
// - VAPID: JWT ES256 assinado com a chave do servidor (a privada fica só no Vault).
// - Conteúdo criptografado (aes128gcm) para a chave do aparelho: Apple/Google não leem o texto.

type Bytes = Uint8Array<ArrayBuffer>
const enc = new TextEncoder()

export function b64urlEncode(bytes: Bytes): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function b64urlDecode(text: string): Bytes {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4)
  const bin = atob(b64)
  const out: Bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function concat(...parts: Bytes[]): Bytes {
  const out: Bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, length: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8)
  return new Uint8Array(bits)
}

export type VapidKeys = { publicKey: string; privateJwk: JsonWebKey }

/** Gera o par de chaves VAPID (uma vez; a privada vai para o Vault). */
export async function generateVapidKeys(): Promise<VapidKeys> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  return { publicKey: b64urlEncode(raw), privateJwk }
}

/** Cabeçalho Authorization VAPID para o servidor de push do aparelho. */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys, subject: string, ttlSeconds = 12 * 3600): Promise<string> {
  const aud = new URL(endpoint).origin
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64urlEncode(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + ttlSeconds, sub: subject })))
  const unsigned = `${header}.${claims}`
  const key = await crypto.subtle.importKey('jwk', keys.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned)))
  return `vapid t=${unsigned}.${b64urlEncode(sig)}, k=${keys.publicKey}`
}

/** Criptografa o conteúdo para o aparelho (RFC 8291, aes128gcm, um único registro). */
export async function encryptPayload(payload: Bytes, p256dh: string, authSecret: string, salt: Bytes = crypto.getRandomValues(new Uint8Array(16))): Promise<Bytes> {
  const uaPublic = b64urlDecode(p256dh)
  const auth = b64urlDecode(authSecret)
  if (uaPublic.length !== 65 || auth.length !== 16) throw new Error('Chaves do aparelho inválidas')
  const local = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey))
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256))

  const ikm = await hkdf(auth, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32)
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)

  const record = concat(payload, new Uint8Array([2])) // delimitador do último registro
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, record))

  const rs = new Uint8Array(4)
  new DataView(rs.buffer).setUint32(0, 4096)
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher)
}

export type PushSubscription = { endpoint: string; p256dh: string; auth: string }
export type PushResult = { ok: boolean; gone: boolean; status: number }

/** Envia uma notificação. gone = aparelho não existe mais (desinstalou ou bloqueou): apagar. */
export async function sendPush(sub: PushSubscription, data: unknown, keys: VapidKeys, subject: string, opts: { ttl?: number; urgency?: 'normal' | 'high'; topic?: string } = {}): Promise<PushResult> {
  const body = await encryptPayload(enc.encode(JSON.stringify(data)), sub.p256dh, sub.auth)
  const headers: Record<string, string> = {
    Authorization: await vapidAuthorization(sub.endpoint, keys, subject),
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    TTL: String(opts.ttl ?? 86400),
    Urgency: opts.urgency ?? 'normal',
  }
  if (opts.topic) headers.Topic = opts.topic.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32)
  const res = await fetch(sub.endpoint, { method: 'POST', headers, body, signal: AbortSignal.timeout(10_000) })
  await res.body?.cancel()
  return { ok: res.status >= 200 && res.status < 300, gone: res.status === 404 || res.status === 410, status: res.status }
}
