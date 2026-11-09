-- =============================================================================
-- Chave para a verificação em duas etapas do admin (ADR-030 → ADR-054).
-- admin_mfa_required = 1 (padrão): is_admin() exige sessão aal2. = 0: só o papel admin.
-- Desligada temporariamente a pedido do responsável durante os testes; religar com
--   update public.system_settings set value = '1' where key = 'admin_mfa_required';
-- Reversão: supabase/rollback/<versão>_admin_mfa_switch.down.sql
-- =============================================================================
insert into public.system_settings (key, value, description, is_public)
values ('admin_mfa_required', '1'::jsonb, 'Exigir verificação em duas etapas para administradores (1 = sim, 0 = não). Desligar só em testes.', false)
on conflict (key) do nothing;

create or replace function public.admin_mfa_required()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.setting_int('admin_mfa_required', 1) <> 0;
$$;
revoke execute on function public.admin_mfa_required() from public, anon, authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('admin') and (public.session_aal() = 'aal2' or not public.admin_mfa_required());
$$;

create or replace function public.my_admin_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('has_admin_role', public.has_role('admin'), 'aal', public.session_aal(),
                            'mfa_required', public.admin_mfa_required(),
                            'allowed', public.has_role('admin') and (public.session_aal() = 'aal2' or not public.admin_mfa_required()));
$$;
