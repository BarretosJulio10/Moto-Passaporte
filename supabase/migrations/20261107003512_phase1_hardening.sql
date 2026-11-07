-- =============================================================================
-- Moto Passaporte — Migração: reforço da Fase 1 (advisors do Supabase)
-- Objetivo:
--   1. Bloquear chamada via API (RPC) das funções de trigger internas.
--   2. Otimizar políticas RLS: auth.uid() avaliado uma vez por consulta.
--   3. Indexar chaves estrangeiras usadas em consultas e no rate limit.
-- Dependências: migrações da Fase 1.
-- Reversão: recriar políticas com auth.uid() direto; drop dos índices; grants
--           não precisam ser revertidos (funções de trigger não são chamadas via API).
-- =============================================================================

-- 1. Funções de trigger: nenhum papel da API precisa executá-las diretamente.
revoke execute on function public.set_updated_at()             from public, anon, authenticated;
revoke execute on function public.prevent_audit_mutation()     from public, anon, authenticated;
revoke execute on function public.audit_row_change()           from public, anon, authenticated;
revoke execute on function public.prevent_history_mutation()   from public, anon, authenticated;
revoke execute on function public.set_settings_updated_by()    from public, anon, authenticated;
revoke execute on function public.protect_motorcycle_identity() from public, anon, authenticated;
revoke execute on function public.protect_plate_history()      from public, anon, authenticated;
revoke execute on function public.protect_ownership_history()  from public, anon, authenticated;
revoke execute on function public.audit_chassis_change()       from public, anon, authenticated;
revoke execute on function public.prevent_delete()             from public, anon, authenticated;
revoke execute on function public.flag_mileage_inconsistency() from public, anon, authenticated;

-- 2. Políticas com (select auth.uid()) — mesma regra, avaliação única por consulta.
drop policy profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

drop policy profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy user_roles_select_own on public.user_roles;
create policy user_roles_select_own on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

drop policy organization_members_select on public.organization_members;
create policy organization_members_select on public.organization_members
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_org_responsible(organization_id) or public.is_admin());

drop policy motorcycle_ownerships_select on public.motorcycle_ownerships;
create policy motorcycle_ownerships_select on public.motorcycle_ownerships
  for select to authenticated
  using (owner_user_id = (select auth.uid()));

drop policy motorcycle_claim_requests_select on public.motorcycle_claim_requests;
create policy motorcycle_claim_requests_select on public.motorcycle_claim_requests
  for select to authenticated
  using (requested_by = (select auth.uid()));

-- 3. Índices de chaves estrangeiras.
create index motorcycles_created_by_idx               on public.motorcycles (created_by, created_at desc);
create index organizations_created_by_idx             on public.organizations (created_by);
create index mileage_records_corrects_idx             on public.mileage_records (corrects_record_id) where corrects_record_id is not null;
create index mileage_records_organization_idx         on public.mileage_records (organization_id) where organization_id is not null;
create index mileage_records_created_by_idx           on public.mileage_records (created_by);
create index motorcycle_claim_requests_motorcycle_idx on public.motorcycle_claim_requests (motorcycle_id);
create index motorcycle_claim_requests_resolved_by_idx on public.motorcycle_claim_requests (resolved_by) where resolved_by is not null;
create index motorcycle_plates_created_by_idx         on public.motorcycle_plates (created_by);
create index system_settings_updated_by_idx           on public.system_settings (updated_by);
create index user_roles_granted_by_idx                on public.user_roles (granted_by) where granted_by is not null;
