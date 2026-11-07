import type { Database } from '@/types/supabase'

export type MaintenanceCategory = Database['public']['Enums']['maintenance_category']
export type RecordSource = Database['public']['Enums']['record_source']

/** Categorias do PRD 5.4, na ordem em que aparecem nos formulários. */
export const CATEGORY_LABEL: Record<MaintenanceCategory, string> = {
  revision: 'Revisão',
  oil_change: 'Troca de óleo',
  filters: 'Filtros',
  brakes: 'Freios',
  tires: 'Pneus',
  suspension: 'Suspensão',
  engine: 'Motor',
  transmission: 'Transmissão',
  electrical: 'Sistema elétrico',
  battery: 'Bateria',
  cooling: 'Arrefecimento',
  accessories: 'Acessórios',
  modifications: 'Modificações',
  repairs: 'Reparos',
  accident: 'Acidente informado',
  inspection: 'Inspeção',
  other: 'Outros serviços',
}

export const CATEGORIES = Object.keys(CATEGORY_LABEL) as MaintenanceCategory[]

/** Origem e evidência (PRD 5.5). Não é certificação. */
export const SOURCE_LABEL: Record<RecordSource, string> = {
  owner: 'Informado pelo dono',
  document: 'Com comprovante',
  workshop: 'Confirmado por oficina',
}

export const SOURCE_COLOR: Record<RecordSource, string> = {
  owner: 'var(--color-origin-owner)',
  document: 'var(--color-origin-document)',
  workshop: 'var(--color-origin-workshop)',
}

/** Título sugerido ao escolher a categoria. */
export const CATEGORY_TITLE_SUGGESTION: Partial<Record<MaintenanceCategory, string>> = {
  revision: 'Revisão',
  oil_change: 'Troca de óleo',
  filters: 'Troca de filtros',
  brakes: 'Serviço nos freios',
  tires: 'Troca de pneus',
  battery: 'Troca de bateria',
  inspection: 'Inspeção',
}
