import { describe, expect, it, vi, beforeEach } from 'vitest'

const order: string[] = []
let checkResponse: { error: unknown } = { error: null }

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    storage: { from: () => ({ upload: async () => { order.push('upload'); return { error: null } } }) },
    functions: { invoke: async (name: string) => { order.push(`check:${name}`); return checkResponse } },
    rpc: async (name: string) => { order.push(`rpc:${name}`); return { data: 'att-1', error: null } },
  }),
}))

import { uploadAttachment, AttachmentError } from './api'

const file = { blob: new Blob([new Uint8Array([0xff, 0xd8, 0xff])]), mime: 'image/jpeg', name: 'foto.jpg', size: 3 } as never

beforeEach(() => {
  order.length = 0
  checkResponse = { error: null }
})

describe('uploadAttachment', () => {
  it('envia, confere o conteúdo no servidor e só então registra', async () => {
    const id = await uploadAttachment({ motorcycleId: '11111111-1111-1111-1111-111111111111', file, kind: 'photo' })
    expect(id).toBe('att-1')
    expect(order).toEqual(['upload', 'check:attachment-check', 'rpc:register_attachment'])
  })

  it('conteúdo recusado pelo servidor não é registrado e mostra o motivo', async () => {
    const body = { message: 'O conteúdo do arquivo não corresponde ao tipo informado.' }
    checkResponse = { error: { context: new Response(JSON.stringify(body), { status: 422 }) } }
    await expect(uploadAttachment({ motorcycleId: '11111111-1111-1111-1111-111111111111', file, kind: 'photo' }))
      .rejects.toThrow(new AttachmentError(body.message))
    expect(order).not.toContain('rpc:register_attachment')
  })
})
