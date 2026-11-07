// Equipe da oficina (PRD 6.2). Contrato em docs/API_DOCUMENTATION.md (Equipe da oficina).
import { getSupabase } from '@/lib/supabase'
import type { Database } from '@/types/supabase'

type Fn = Database['public']['Functions']
export type Member = Fn['get_org_members']['Returns'][number]
export type Invite = Fn['get_org_invites']['Returns'][number]
export type MemberRole = Database['public']['Enums']['org_member_role']
export type Permissions = { can_request_access: boolean; can_register_services: boolean }

export type InvitePreview = {
  status: 'open' | 'accepted' | 'revoked' | 'expired' | 'inactive' | 'invalid'
  workshop_name?: string
  email_matches?: boolean
  email_hint?: string
  can_request_access?: boolean
  can_register_services?: boolean
  expires_at?: string
}

export const ROLE_LABEL: Record<MemberRole, string> = { responsible: 'Responsável', staff: 'Funcionário' }
export const PERMISSION_LABEL: Record<keyof Permissions, string> = {
  can_request_access: 'Pesquisar placas e pedir acesso',
  can_register_services: 'Registrar serviços',
}

export async function fetchMembers(organizationId: string): Promise<Member[]> {
  const { data, error } = await getSupabase().rpc('get_org_members', { p_organization_id: organizationId })
  if (error) throw error
  return data ?? []
}

export async function fetchInvites(organizationId: string): Promise<Invite[]> {
  const { data, error } = await getSupabase().rpc('get_org_invites', { p_organization_id: organizationId })
  if (error) throw error
  return data ?? []
}

export async function createInvite(organizationId: string, email: string, p: Permissions) {
  const { data, error } = await getSupabase().rpc('create_org_invite', {
    p_organization_id: organizationId,
    p_email: email,
    p_can_request_access: p.can_request_access,
    p_can_register_services: p.can_register_services,
  })
  if (error) throw error
  return data as unknown as { id: string; token: string; expires_at: string }
}

export async function revokeInvite(inviteId: string) {
  const { error } = await getSupabase().rpc('revoke_org_invite', { p_invite_id: inviteId })
  if (error) throw error
}

export async function updateMember(memberId: string, role: MemberRole, p: Permissions) {
  const { error } = await getSupabase().rpc('update_org_member', {
    p_member_id: memberId,
    p_role: role,
    p_can_request_access: p.can_request_access,
    p_can_register_services: p.can_register_services,
  })
  if (error) throw error
}

export async function removeMember(memberId: string) {
  const { error } = await getSupabase().rpc('remove_org_member', { p_member_id: memberId })
  if (error) throw error
}

export async function leaveOrganization(organizationId: string) {
  const { error } = await getSupabase().rpc('leave_organization', { p_organization_id: organizationId })
  if (error) throw error
}

export async function fetchInvitePreview(token: string): Promise<InvitePreview> {
  const { data, error } = await getSupabase().rpc('get_invite_preview', { p_token: token })
  if (error) throw error
  return data as unknown as InvitePreview
}

export async function acceptInvite(token: string): Promise<string> {
  const { data, error } = await getSupabase().rpc('accept_org_invite', { p_token: token })
  if (error) throw error
  return data as string
}

export function inviteLink(token: string, origin = window.location.origin) {
  return `${origin}/convite/${token}`
}

export function whatsappShareLink(workshopName: string, link: string) {
  const text = `Você foi convidado para a equipe da ${workshopName} no Moto Passaporte. Entre com este e-mail e aceite o convite: ${link}`
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}
