-- =============================================================================
-- Verificação em duas etapas obrigatória para administradores (PRD 15.1; KI-014; ADR-030)
-- is_admin() passa a exigir sessão com MFA (claim "aal" = "aal2" do Supabase Auth). Toda
-- autorização administrativa (funções admin_*, políticas RLS de admin e Edge Functions com
-- login de admin) passa por is_admin(), então nada administrativo funciona sem a segunda etapa.
-- my_admin_access() informa ao site se a conta tem o papel e se a sessão já está verificada,
-- para mostrar a tela de ativação/código (não revela nada além da própria conta).
-- Rollback: supabase/rollback/<versão>_admin_mfa.down.sql (volta is_admin() a só checar o papel).
-- =============================================================================

create or replace function public.session_aal()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1');
$$;

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

revoke execute on function public.session_aal() from public, anon;
revoke execute on function public.my_admin_access() from public, anon;
grant execute on function public.session_aal() to authenticated;
grant execute on function public.my_admin_access() to authenticated;
