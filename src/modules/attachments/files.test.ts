import { describe, expect, it } from 'vitest'
import { buildStoragePath, checkLimits, cleanFileName, fitWithin, formatBytes, guessKind, sniffMime } from './files'

const bytes = (...b: number[]) => new Uint8Array(b)

describe('sniffMime', () => {
  it('reconhece o tipo real pelos primeiros bytes', () => {
    expect(sniffMime(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg')
    expect(sniffMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png')
    expect(sniffMime(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))).toBe('image/webp')
    expect(sniffMime(new TextEncoder().encode('%PDF-1.7'))).toBe('application/pdf')
  })
  it('recusa o que não é foto nem PDF, mesmo com extensão enganosa', () => {
    expect(sniffMime(new TextEncoder().encode('<html>'))).toBeNull()
    expect(sniffMime(bytes(0x4d, 0x5a))).toBeNull()
    expect(sniffMime(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20))).toBeNull()
    expect(sniffMime(bytes())).toBeNull()
  })
})

describe('regras de arquivo', () => {
  it('reduz mantendo a proporção', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 2000, height: 1500 })
    expect(fitWithin(1200, 4800)).toEqual({ width: 500, height: 2000 })
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
  })
  it('monta o caminho no formato que o banco aceita', () => {
    const moto = '0b5f8d3e-1111-4a2b-9c3d-000000000001'
    const path = buildStoragePath(moto, 'application/pdf', 'aaaaaaaa-0000-0000-0000-000000000001')
    expect(path).toBe(`${moto}/aaaaaaaa-0000-0000-0000-000000000001.pdf`)
    expect(buildStoragePath(moto, 'image/jpeg')).toMatch(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/)
  })
  it('limpa o nome exibido', () => {
    expect(cleanFileName('C:\\fotos\\nota\u0007.jpg')).toBe('nota.jpg')
    expect(cleanFileName('')).toBe('arquivo')
    expect(cleanFileName('a'.repeat(300))).toHaveLength(200)
  })
  it('sugere o tipo pelo nome', () => {
    expect(guessKind('NF-e 123.pdf', 'application/pdf')).toBe('invoice')
    expect(guessKind('recibo oficina.jpg', 'image/jpeg')).toBe('receipt')
    expect(guessKind('ordem de servico.pdf', 'application/pdf')).toBe('service_order')
    expect(guessKind('IMG_2033.jpg', 'image/jpeg')).toBe('photo')
  })
  it('confere tamanho e espaço', () => {
    const usage = { used_bytes: 99 * 1024 * 1024, quota_bytes: 100 * 1024 * 1024, max_file_bytes: 10 * 1024 * 1024 }
    expect(checkLimits(11 * 1024 * 1024, usage)).toMatch(/maior que 10 MB/)
    expect(checkLimits(2 * 1024 * 1024, usage)).toBe('Seu espaço de anexos acabou.')
    expect(checkLimits(500 * 1024, usage)).toBeNull()
    expect(checkLimits(500 * 1024, usage, 600 * 1024)).toBe('Seu espaço de anexos acabou.')
    expect(formatBytes(1536)).toBe('2 KB')
  })
})
