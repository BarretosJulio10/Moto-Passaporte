-- Reversão de admin_mfa_switch: volta a exigir sempre a segunda etapa (ADR-030).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('admin') and public.session_aal() = 'aal2';
$$;

create or replace function public.my_admin_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('has_admin_role', public.has_role('admin'), 'aal', public.session_aal(),
                            'allowed', public.has_role('admin') and public.session_aal() = 'aal2');
$$;

drop function if exists public.admin_mfa_required();
delete from public.system_settings where key = 'admin_mfa_required';
