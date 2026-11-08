// Notificações no celular (Web Push, ADR-040). O aparelho gera as próprias chaves; o servidor
// guarda só o endereço e as chaves públicas para enviar o aviso criptografado.
import { getSupabase } from '@/lib/supabase'
import type { Database } from '@/types/supabase'
import { isIOS, isStandalone } from '@/core/pwa/pwa'

export type PushDevice = Database['public']['Functions']['get_my_push_devices']['Returns'][number]

/** O que este aparelho permite agora. */
export type PushSupport = 'ok' | 'ios-needs-install' | 'unsupported' | 'blocked'

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported'
  if (isIOS() && !isStandalone()) return 'ios-needs-install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  return 'ok'
}

function keyToBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((base64url.length + 3) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function toB64url(buf: ArrayBuffer | null): string {
  if (!buf) return ''
  let s = ''
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Nome amigável do aparelho para a lista ("Android · Chrome", "iPhone"). */
export function deviceLabel(ua = navigator.userAgent): string {
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Aparelho'
  const br = /EdgA?\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox\//.test(ua) ? 'Firefox'
    : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : ''
  return br && os !== 'iPhone' && os !== 'iPad' ? `${os} · ${br}` : os
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.getRegistration('/')
  if (reg) return reg
  return await navigator.serviceWorker.register('/sw.js', { scope: '/' })
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'ok') return null
  const reg = await navigator.serviceWorker.getRegistration('/')
  return (await reg?.pushManager.getSubscription()) ?? null
}

/** Pede permissão (precisa vir de um toque) e registra este aparelho na conta. */
export async function enablePush(): Promise<void> {
  const support = pushSupport()
  if (support === 'ios-needs-install') throw new Error('No iPhone, instale o app na tela inicial antes de ativar as notificações.')
  if (support === 'unsupported') throw new Error('Este navegador não recebe notificações. Use o Chrome no Android ou o app instalado no iPhone.')
  if (support === 'blocked') throw new Error('As notificações estão bloqueadas para este site. Libere nas configurações do navegador ou do celular.')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Sem permissão, não dá para enviar avisos para este aparelho.')
  const { data: key, error: keyError } = await getSupabase().rpc('get_push_public_key')
  if (keyError) throw keyError
  if (!key) throw new Error('As notificações no celular ainda não estão disponíveis. Tente mais tarde.')
  const reg = await registration()
  await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (sub && toB64url(sub.options.applicationServerKey) !== key) {
    await sub.unsubscribe()
    sub = null
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(key) })
  const { error } = await getSupabase().rpc('register_push_subscription', {
    p_endpoint: sub.endpoint,
    p_p256dh: toB64url(sub.getKey('p256dh')),
    p_auth: toB64url(sub.getKey('auth')),
    p_label: deviceLabel(),
  })
  if (error) throw error
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  await getSupabase().rpc('unregister_push_subscription', { p_endpoint: sub.endpoint })
  await sub.unsubscribe()
}

export async function fetchMyDevices(): Promise<PushDevice[]> {
  const { data, error } = await getSupabase().rpc('get_my_push_devices')
  if (error) throw error
  return data ?? []
}

export async function removeDevice(id: string): Promise<void> {
  const { error } = await getSupabase().rpc('delete_my_push_device', { p_id: id })
  if (error) throw error
}

export async function sendTestPush(): Promise<void> {
  const { error } = await getSupabase().rpc('send_my_test_push')
  if (error) throw error
}
