/**
 * Consultas públicas e gratuitas (ADR-055): CEP (BrasilAPI v2 com reserva no ViaCEP), CNPJ (BrasilAPI)
 * e marcas/modelos de moto da Tabela FIPE (BrasilAPI). Só ajudam a preencher: se o serviço cair ou
 * demorar, o formulário continua funcionando à mão. Nada do usuário é enviado além do CEP/CNPJ digitado.
 */
const BRASIL = 'https://brasilapi.com.br/api'
const TIMEOUT = 6000

export type CepAddress = { cep: string; street: string; neighborhood: string; city: string; state: string }
export type CnpjData = {
  cnpj: string
  legalName: string
  tradeName: string
  street: string
  number: string
  complement: string
  neighborhood: string
  city: string
  state: string
  cep: string
  phone: string
  email: string
}
export type FipeBrand = { name: string; code: string }

const onlyDigits = (s: string) => s.replace(/\D/g, '')

async function getJson<T>(url: string): Promise<T | null> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

const cepCache = new Map<string, CepAddress | null>()

/** Endereço pelo CEP. null = CEP não encontrado ou serviços fora do ar. */
export async function lookupCep(raw: string): Promise<CepAddress | null> {
  const cep = onlyDigits(raw)
  if (cep.length !== 8 || /^(\d)\1{7}$/.test(cep)) return null
  if (cepCache.has(cep)) return cepCache.get(cep)!
  let out: CepAddress | null = null
  const b = await getJson<{ cep: string; street?: string; neighborhood?: string; city?: string; state?: string }>(`${BRASIL}/cep/v2/${cep}`)
  if (b?.city) {
    out = { cep, street: b.street ?? '', neighborhood: b.neighborhood ?? '', city: b.city, state: b.state ?? '' }
  } else {
    const v = await getJson<{ erro?: boolean | string; logradouro?: string; bairro?: string; localidade?: string; uf?: string }>(`https://viacep.com.br/ws/${cep}/json/`)
    if (v && !v.erro && v.localidade) out = { cep, street: v.logradouro ?? '', neighborhood: v.bairro ?? '', city: v.localidade, state: v.uf ?? '' }
  }
  cepCache.set(cep, out)
  return out
}

/** "Rua X, Bairro, Cidade/UF – CEP 00000-000" (campo de endereço único). */
export function formatAddressLine(a: CepAddress, number = ''): string {
  const street = [a.street, number].filter(Boolean).join(', ')
  return [street, a.neighborhood, `${a.city}/${a.state}`].filter(Boolean).join(' · ') + ` · CEP ${formatCep(a.cep)}`
}

export const formatCep = (raw: string) => {
  const d = onlyDigits(raw).slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

/** Dados públicos da empresa pelo CNPJ (Receita Federal, via BrasilAPI). */
export async function lookupCnpj(raw: string): Promise<CnpjData | null> {
  const cnpj = onlyDigits(raw)
  if (cnpj.length !== 14) return null
  const r = await getJson<Record<string, unknown>>(`${BRASIL}/cnpj/v1/${cnpj}`)
  if (!r || !r.razao_social) return null
  const s = (k: string) => (typeof r[k] === 'string' || typeof r[k] === 'number' ? String(r[k]).trim() : '')
  const title = (x: string) => x.toLowerCase().replace(/(^|\s|\/|-)(\p{L})/gu, (_m, p: string, c: string) => p + c.toUpperCase())
  return {
    cnpj,
    legalName: s('razao_social'),
    tradeName: s('nome_fantasia'),
    street: title([s('descricao_tipo_de_logradouro'), s('logradouro')].filter(Boolean).join(' ')),
    number: s('numero'),
    complement: s('complemento'),
    neighborhood: title(s('bairro')),
    city: title(s('municipio')),
    state: s('uf'),
    cep: onlyDigits(s('cep')),
    phone: onlyDigits(s('ddd_telefone_1')),
    email: s('email').toLowerCase(),
  }
}

// FIPE ----------------------------------------------------------------------------
let brandsMemo: Promise<FipeBrand[]> | null = null
const modelsMemo = new Map<string, Promise<string[]>>()
const STORE = 'mp-fipe-motos-v1'

function readStore(): { at: number; brands: FipeBrand[] } | null {
  try {
    const raw = localStorage.getItem(STORE)
    const v = raw ? (JSON.parse(raw) as { at: number; brands: FipeBrand[] }) : null
    return v && Date.now() - v.at < 30 * 86400_000 ? v : null
  } catch {
    return null
  }
}

/** Marcas de moto da Tabela FIPE (guardadas no aparelho por 30 dias). */
export function fipeMotoBrands(): Promise<FipeBrand[]> {
  if (brandsMemo) return brandsMemo
  const cached = readStore()
  if (cached) return (brandsMemo = Promise.resolve(cached.brands))
  brandsMemo = getJson<{ nome: string; valor: string }[]>(`${BRASIL}/fipe/marcas/v1/motos`).then((list) => {
    const brands = (list ?? []).map((b) => ({ name: prettyBrand(b.nome), code: String(b.valor) })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    if (brands.length > 0) {
      try { localStorage.setItem(STORE, JSON.stringify({ at: Date.now(), brands })) } catch { /* sem armazenamento */ }
    } else brandsMemo = null
    return brands
  })
  return brandsMemo
}

/** Modelos de uma marca (nomes como estão na FIPE, sem repetição). */
export function fipeMotoModels(brandCode: string): Promise<string[]> {
  if (!brandCode) return Promise.resolve([])
  const hit = modelsMemo.get(brandCode)
  if (hit) return hit
  const p = getJson<{ modelo: string }[]>(`${BRASIL}/fipe/veiculos/v1/motos/${encodeURIComponent(brandCode)}`).then((list) => {
    const names = [...new Set((list ?? []).map((m) => m.modelo.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
    if (names.length === 0) modelsMemo.delete(brandCode)
    return names
  })
  modelsMemo.set(brandCode, p)
  return p
}

/** "HONDA" → "Honda"; mantém siglas curtas (BMW, KTM). */
export function prettyBrand(name: string): string {
  const n = name.trim()
  if (/^[A-Z0-9]{2,4}$/.test(n)) return n
  return n.toLowerCase().replace(/(^|\s|-|\/)(\p{L})/gu, (_m, p: string, c: string) => p + c.toUpperCase())
}

export function findBrand(brands: FipeBrand[], typed: string): FipeBrand | undefined {
  const t = typed.trim().toLowerCase()
  return t ? brands.find((b) => b.name.toLowerCase() === t) : undefined
}
