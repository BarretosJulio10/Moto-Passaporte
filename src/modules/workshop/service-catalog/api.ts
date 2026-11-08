// Catálogo de serviços e tabelas de preço (PRD 2.1 §10). Contrato em docs/modules/WORKSHOP_PRICING.md.
import { rpc } from '../shared/rpc'

export const SERVICE_CATEGORIES = [
  'motor', 'lubrificacao', 'transmissao', 'freios', 'pneus', 'suspensao', 'eletrica', 'injecao',
  'arrefecimento', 'embreagem', 'revisoes', 'acessorios', 'estetica', 'outros',
] as const
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number]
export const CATEGORY_LABEL: Record<ServiceCategory, string> = {
  motor: 'Motor', lubrificacao: 'Lubrificação', transmissao: 'Transmissão', freios: 'Freios', pneus: 'Pneus',
  suspensao: 'Suspensão', eletrica: 'Elétrica', injecao: 'Injeção eletrônica', arrefecimento: 'Arrefecimento',
  embreagem: 'Embreagem', revisoes: 'Revisões', acessorios: 'Acessórios', estetica: 'Estética', outros: 'Outros',
}

export const CHARGE_TYPES = ['fixed', 'hourly', 'from'] as const
export type ChargeType = (typeof CHARGE_TYPES)[number]
export const CHARGE_LABEL: Record<ChargeType, string> = { fixed: 'Valor fechado', hourly: 'Por hora', from: 'A partir de' }

export const COMPLEXITIES = ['simples', 'media', 'alta'] as const
export type Complexity = (typeof COMPLEXITIES)[number]
export const COMPLEXITY_LABEL: Record<Complexity, string> = { simples: 'Simples', media: 'Média', alta: 'Alta' }

export type Service = {
  id: string
  name: string
  category: ServiceCategory
  description: string | null
  estimated_minutes: number | null
  default_price_cents: number | null
  charge_type: ChargeType
  active: boolean
  notes: string | null
}

export type PriceTable = { id: string; name: string; description: string | null; is_default: boolean; active: boolean }

export type PriceRule = {
  id: string
  table_id: string
  service_id: string
  brand: string | null
  model: string | null
  year_from: number | null
  year_to: number | null
  cc_min: number | null
  cc_max: number | null
  complexity: Complexity | null
  price_cents: number
  notes: string | null
}

export type Catalog = { services: Service[]; tables: PriceTable[]; rules: PriceRule[] }

export type ServiceInput = {
  name: string
  category: ServiceCategory
  description?: string
  estimated_minutes?: string
  default_price_cents?: number | null
  charge_type: ChargeType
  active: boolean
  notes?: string
}

export type PriceRuleInput = {
  table_id: string
  service_id: string
  brand?: string
  model?: string
  year_from?: string
  year_to?: string
  cc_min?: string
  cc_max?: string
  complexity?: Complexity | ''
  price_cents: number
  notes?: string
}

export type PriceSuggestion = {
  price_cents: number | null
  source: 'rule' | 'default' | 'none'
  label: string
  rule_id?: string
  table_id?: string | null
}

export const fetchCatalog = (org: string) => rpc<Catalog>('workshop_list_catalog', { p_org: org })
export const saveService = (org: string, id: string | null, data: ServiceInput) =>
  rpc<string>('workshop_save_service', { p_org: org, p_id: id, p_data: data })
export const savePriceTable = (org: string, id: string | null, name: string, description: string, isDefault: boolean, active = true) =>
  rpc<string>('workshop_save_price_table', { p_org: org, p_id: id, p_name: name, p_description: description, p_is_default: isDefault, p_active: active })
export const savePriceRule = (org: string, id: string | null, data: PriceRuleInput) =>
  rpc<string>('workshop_save_price_rule', { p_org: org, p_id: id, p_data: data })
export const deletePriceRule = (org: string, id: string) => rpc<void>('workshop_delete_price_rule', { p_org: org, p_id: id })
export const suggestPrice = (org: string, serviceId: string, vehicleId: string | null, tableId: string | null) =>
  rpc<PriceSuggestion>('workshop_suggest_price', { p_org: org, p_service: serviceId, p_vehicle: vehicleId, p_table: tableId })

/** Descreve a regra: "Honda CG 160 · 2018–2024 · 100–300 cc". */
export function ruleLabel(r: Pick<PriceRule, 'brand' | 'model' | 'year_from' | 'year_to' | 'cc_min' | 'cc_max' | 'complexity'>): string {
  const parts = [
    [r.brand, r.model].filter(Boolean).join(' '),
    r.year_from || r.year_to ? `${r.year_from ?? '…'}–${r.year_to ?? '…'}` : '',
    r.cc_min || r.cc_max ? `${r.cc_min ?? 0}–${r.cc_max ?? '…'} cc` : '',
    r.complexity ? `complexidade ${COMPLEXITY_LABEL[r.complexity].toLowerCase()}` : '',
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Todas as motos'
}
