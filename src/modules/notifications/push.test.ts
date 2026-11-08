import { describe, expect, it, vi, afterEach } from 'vitest'
import { deviceLabel, pushSupport } from './push'

afterEach(() => vi.unstubAllGlobals())

describe('push no celular', () => {
  it('dá nome amigável ao aparelho', () => {
    expect(deviceLabel('Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36')).toBe('Android · Chrome')
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1')).toBe('iPhone')
    expect(deviceLabel('Mozilla/5.0 (Linux; Android 13) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36')).toBe('Android · Samsung Internet')
  })

  it('no iPhone fora do app instalado pede para instalar', () => {
    vi.stubGlobal('navigator', { ...navigator, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Safari/604.1', maxTouchPoints: 5 })
    expect(pushSupport()).toBe('ios-needs-install')
  })

  it('navegador sem suporte', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/120.0', maxTouchPoints: 0 })
    expect(pushSupport()).toBe('unsupported')
  })
})
