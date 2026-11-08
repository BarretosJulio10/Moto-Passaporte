// Clientes e motos da oficina (PRD 2.1 §4 e §5). Contrato em docs/modules/WORKSHOP.md.
import { rpc } from '../shared/rpc'

export const CUSTOMER_SOURCES = ['balcao', 'whatsapp', 'indicacao', 'redes_sociais', 'google', 'passaporte', 'outro'] as const
export type CustomerSource = (typeof CUSTOMER_SOURCES)[number]
export const SOURCE_LABEL: Record<CustomerSource, string> = {
  balcao: 'Balcão', whatsapp: 'WhatsApp', indicacao: 'Indicação', redes_sociais: 'Redes sociais',
  google: 'Google', passaporte: 'Moto Passaporte', outro: 'Outro',
}

export type CustomerInput = {
  full_name: string
  phone?: string
  whatsapp?: string
  email?: string
  cpf?: string
  address?: string
  birth_date?: string
  notes?: string
  first_visit_at?: string
  source?: CustomerSource
}

export type CustomerRow = {
  id: string
  full_name: string
  phone: string | null
  whatsapp: string | null
  email: string | null
  status: 'active' | 'archived'
  first_visit_at: string
  source: CustomerSource
  vehicles: number
  quotes: number
  last_quote_at: string | null
  vehicle_labels: string | null
}

export type Vehicle = {
  id: string
  customer_id: string
  motorcycle_id: string | null
  brand: string
  model: string
  version: string | null
  year: number | null
  displacement_cc: number | null
  plate: string | null
  km: number | null
  color: string | null
  notes: string | null
  status: 'active' | 'archived'
  linked_at: string | null
}

export type VehicleInput = {
  brand: string
  model: string
  version?: string
  year?: string
  displacement_cc?: string
  plate?: string
  km?: string
  color?: string
  notes?: string
  status?: 'active' | 'archived'
}

export type CustomerQuoteSummary = {
  id: string
  number: number
  status: string
  created_at: string
  total_cents: number
  approved_total_cents: number | null
  vehicle_id: string | null
}

export type Customer = Omit<CustomerRow, 'vehicles' | 'quotes' | 'last_quote_at' | 'vehicle_labels'> & {
  cpf: string | null
  address: string | null
  birth_date: string | null
  notes: string | null
  created_at: string
  vehicles: Vehicle[]
  quotes: CustomerQuoteSummary[]
  marketing_opt_out_at?: string | null
}

export type VehicleRow = Pick<Vehicle, 'id' | 'customer_id' | 'brand' | 'model' | 'version' | 'year' | 'displacement_cc' | 'plate' | 'km' | 'color' | 'status'> & {
  customer_name: string
  linked: boolean
  quotes: number
}

export type WorkshopPermissions = {
  responsible: boolean
  request_access: boolean
  register_services: boolean
  manage_quotes: boolean
  manage_prices: boolean
  execute_orders: boolean
  manage_finance: boolean
  user_id?: string
}

export const fetchMyPermissions = (org: string) => rpc<WorkshopPermissions>('get_my_workshop_permissions', { p_org: org })

export const listCustomers = (org: string, search = '', includeArchived = false) =>
  rpc<CustomerRow[]>('workshop_list_customers', { p_org: org, p_search: search || null, p_include_archived: includeArchived })

export const fetchCustomer = (org: string, id: string) => rpc<Customer>('workshop_get_customer', { p_org: org, p_id: id })

export const saveCustomer = (org: string, id: string | null, data: CustomerInput) =>
  rpc<string>('workshop_save_customer', { p_org: org, p_id: id, p_data: data })

export const setCustomerStatus = (org: string, id: string, status: 'active' | 'archived') =>
  rpc<void>('workshop_set_customer_status', { p_org: org, p_id: id, p_status: status })

export const saveVehicle = (org: string, id: string | null, customerId: string, data: VehicleInput) =>
  rpc<string>('workshop_save_vehicle', { p_org: org, p_id: id, p_customer: customerId, p_data: data })

export const listVehicles = (org: string, search = '') =>
  rpc<VehicleRow[]>('workshop_list_vehicles', { p_org: org, p_search: search || null })

export const linkVehiclePassport = (org: string, vehicleId: string, motorcycleId: string | null) =>
  rpc<void>('workshop_link_vehicle_passport', { p_org: org, p_vehicle: vehicleId, p_motorcycle: motorcycleId })

export function vehicleLabel(v: Pick<Vehicle, 'brand' | 'model' | 'year'> | null | undefined): string {
  if (!v) return 'Moto não informada'
  return [v.brand, v.model, v.year].filter(Boolean).join(' ')
}

/** Mostra só os 2 dígitos finais do CPF (dado protegido, PRD 2.1 §4.1). */
export function maskCpf(cpf: string | null | undefined): string {
  if (!cpf) return '—'
  return `•••.•••.•••-${cpf.slice(-2)}`
}
