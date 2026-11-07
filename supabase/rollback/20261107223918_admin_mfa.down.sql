-- =============================================================================
-- ROLLBACK de 20261107223918_admin_mfa (v0.28.0, ADR-030). Ver docs/OPERATIONS.md §4.
-- ATENÇÃO: volta a liberar a administração SEM a segunda etapa (só com a senha). Usar apenas em
-- emergência (ex.: administrador sem acesso ao autenticador) e reaplicar a migração logo depois.
-- Publicar antes o site anterior (o atual usa my_admin_access).
-- =============================================================================
begin;
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('admin');
$$;
drop function if exists public.my_admin_access();
drop function if exists public.session_aal();
commit;
