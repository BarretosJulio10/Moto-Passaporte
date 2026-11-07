// Acesso ao banco do módulo de oficinas. RLS garante o isolamento entre organizações.
import { getSupabase } from '@/lib/supabase'
import type { WorkshopInput, WorkshopProfileInput } from './schemas'

export type MyWorkshop = {
  organization_id: string
  role: 'responsible' | 'staff'
  business_name: string
  public_slug: string
  city: string | null
  state: string | null
  verification_status: 'unverified' | 'verified' | 'rejected'
}

/** Oficinas das quais o usuário é membro ativo (não inclui perfis públicos de terceiros). */
export async function fetchMyWorkshops(userId: string): Promise<MyWorkshop[]> {
  const supabase = getSupabase()
  const { data: members, error } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', userId)
    .eq('status', 'active')
  if (error) throw error
  if (!members.length) return []
  const ids = members.map((m) => m.organization_id)
  const { data: shops, error: shopError } = await supabase
    .from('workshops')
    .select('organization_id, business_name, public_slug, city, state, verification_status')
    .in('organization_id', ids)
    .order('business_name')
  if (shopError) throw shopError
  const roleById = new Map(members.map((m) => [m.organization_id, m.role]))
  return shops.map((s) => ({ ...s, role: roleById.get(s.organization_id) ?? 'staff' }))
}

export async function createWorkshop(input: WorkshopInput): Promise<string> {
  const { data, error } = await getSupabase().rpc('create_workshop', {
    p_business_name: input.businessName,
    p_public_slug: input.publicSlug,
    p_city: input.city,
    p_state: input.state,
    p_phone: input.phone,
    p_whatsapp: input.whatsapp,
    p_email: input.email,
    p_cnpj: input.cnpj,
    p_legal_name: input.legalName,
  })
  if (error) throw error
  return data
}

export async function fetchWorkshop(organizationId: string) {
  const { data, error } = await getSupabase()
    .from('workshops')
    .select('*')
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function updateWorkshop(organizationId: string, input: WorkshopProfileInput) {
  const { error } = await getSupabase()
    .from('workshops')
    .update({
      business_name: input.businessName,
      public_slug: input.publicSlug,
      legal_name: input.legalName ?? null,
      cnpj: input.cnpj ?? null,
      responsible_name: input.responsibleName ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      whatsapp: input.whatsapp ?? null,
      address: input.address ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      specialties: input.specialties,
      description: input.description ?? null,
      opening_hours: input.openingHours ?? null,
      is_public: input.isPublic,
    })
    .eq('organization_id', organizationId)
  if (error) throw error
}

/** Perfil público por endereço. Campos internos (CNPJ, razão social) não são exibidos na página. */
export async function fetchPublicWorkshop(slug: string) {
  const { data, error } = await getSupabase()
    .from('workshops')
    .select('business_name, public_slug, city, state, specialties, description, opening_hours, phone, whatsapp, email, address, verification_status')
    .eq('public_slug', slug)
    .eq('is_public', true)
    .maybeSingle()
  if (error) throw error
  return data
}
