-- =============================================================================
-- ROLLBACK de 20261108161839_premium_grants (v0.36.0, ADR-037). Ver docs/OPERATIONS.md §4.
-- Retira o Premium por cortesia: as contas com cortesia voltam ao plano gratuito.
-- Perde: o registro das cortesias (exportar antes: select * from public.premium_grants).
-- =============================================================================
begin;
create or replace function public.user_plan(p_user uuid)
returns public.subscription_plans
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.subscriptions;
  p public.subscription_plans;
begin
  s := public.user_active_subscription(p_user);
  if s.id is not null then
    select * into p from public.subscription_plans where id = s.plan_id;
    p.name := s.plan_name;
    p.max_motorcycles := s.max_motorcycles;
    p.storage_quota_mb := s.storage_quota_mb;
    p.price_cents := s.price_cents;
    p.entitlements := s.entitlements;
    p.max_share_links := s.max_share_links;
    return p;
  end if;
  select * into p from public.subscription_plans where kind = 'free' limit 1;
  return p;
end;
$$;
revoke execute on function public.user_plan(uuid) from public, anon, authenticated;
drop function if exists public.admin_get_premium_grant(uuid);
drop function if exists public.admin_revoke_premium(uuid, text);
drop function if exists public.admin_grant_premium(uuid, uuid, date, text);
drop function if exists public.user_active_grant(uuid);
drop table if exists public.premium_grants;
commit;
