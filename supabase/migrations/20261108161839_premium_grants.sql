-- =============================================================================
-- Premium por cortesia (ADR-037)
-- O administrador concede um plano Premium sem cobrança a uma conta (equipe, parceiros,
-- oficinas convidadas, testes), com motivo auditado e prazo opcional. A assinatura paga,
-- se existir, tem prioridade. Não gera fatura nem pagamento.
-- Rollback: supabase/rollback/20261108161839_premium_grants.down.sql
-- =============================================================================

create table if not exists public.premium_grants (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  plan_id     uuid not null references public.subscription_plans (id) on delete restrict,
  reason      text not null check (char_length(reason) between 5 and 500),
  starts_at   timestamptz not null default now(),
  expires_at  timestamptz,
  granted_by  uuid references auth.users (id) on delete set null,
  revoked_at  timestamptz,
  revoked_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  check (expires_at is null or expires_at > starts_at)
);
create index if not exists premium_grants_user_idx on public.premium_grants (user_id, created_at desc);
create index if not exists premium_grants_plan_idx on public.premium_grants (plan_id);
create index if not exists premium_grants_granted_by_idx on public.premium_grants (granted_by);
create index if not exists premium_grants_revoked_by_idx on public.premium_grants (revoked_by);
-- Uma cortesia em vigor por conta.
create unique index if not exists premium_grants_one_open on public.premium_grants (user_id) where revoked_at is null;
alter table public.premium_grants enable row level security;
revoke all on public.premium_grants from public, anon, authenticated;
comment on table public.premium_grants is 'Premium por cortesia concedido pelo administrador (ADR-037). Só por funções.';

create or replace function public.user_active_grant(p_user uuid)
returns public.premium_grants
language sql
stable
security definer
set search_path = ''
as $$
  select g.* from public.premium_grants g
   where g.user_id = p_user and g.revoked_at is null and g.starts_at <= now()
     and (g.expires_at is null or g.expires_at > now())
   limit 1;
$$;
revoke execute on function public.user_active_grant(uuid) from public, anon, authenticated;

-- Plano vigente: assinatura paga > cortesia > gratuito.
create or replace function public.user_plan(p_user uuid)
returns public.subscription_plans
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.subscriptions;
  g public.premium_grants;
  p public.subscription_plans;
begin
  s := public.user_active_subscription(p_user);
  if s.id is not null then
    select * into p from public.subscription_plans where id = s.plan_id;
    -- Benefícios e limites contratados valem mesmo se o catálogo mudar (PRD 8.5).
    p.name := s.plan_name;
    p.max_motorcycles := s.max_motorcycles;
    p.storage_quota_mb := s.storage_quota_mb;
    p.price_cents := s.price_cents;
    p.entitlements := s.entitlements;
    p.max_share_links := s.max_share_links;
    return p;
  end if;
  g := public.user_active_grant(p_user);
  if g.id is not null then
    select * into p from public.subscription_plans where id = g.plan_id;
    p.name := p.name || ' (cortesia)';
    p.price_cents := 0;
    return p;
  end if;
  select * into p from public.subscription_plans where kind = 'free' limit 1;
  return p;
end;
$$;
revoke execute on function public.user_plan(uuid) from public, anon, authenticated;

create or replace function public.admin_grant_premium(p_user_id uuid, p_plan_id uuid, p_until date, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := public.require_admin_reason(p_reason);
  v_plan public.subscription_plans;
  v_old public.premium_grants;
  v_id uuid;
  v_until timestamptz;
begin
  select * into v_plan from public.subscription_plans where id = p_plan_id;
  if not found or v_plan.kind <> 'premium' then
    raise exception 'Escolha um plano Premium.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;
  if p_until is not null then
    if p_until <= current_date then
      raise exception 'A validade precisa ser uma data futura.' using errcode = '22023';
    end if;
    v_until := (p_until + 1)::timestamp at time zone 'America/Sao_Paulo';
  end if;
  select * into v_old from public.premium_grants where user_id = p_user_id and revoked_at is null for update;
  if found then
    update public.premium_grants set revoked_at = now(), revoked_by = auth.uid() where id = v_old.id;
  end if;
  insert into public.premium_grants (user_id, plan_id, reason, expires_at, granted_by)
  values (p_user_id, p_plan_id, v_reason, v_until, auth.uid())
  returning id into v_id;
  perform public.write_audit('premium_grants', v_id::text, 'admin_grant_premium', null, null,
    case when v_old.id is not null then jsonb_build_object('previous_grant', v_old.id) end,
    jsonb_build_object('user_id', p_user_id, 'plan', v_plan.code, 'until', p_until, 'reason', v_reason));
  perform public.notify(p_user_id, 'admin_notice', 'Você recebeu o ' || v_plan.name || ' como cortesia',
    case when p_until is null then 'Os benefícios Premium já estão liberados na sua conta, sem cobrança.'
         else 'Os benefícios Premium já estão liberados na sua conta, sem cobrança, até ' || to_char(p_until, 'DD/MM/YYYY') || '.' end,
    '/painel', null);
  return v_id;
end;
$$;

create or replace function public.admin_revoke_premium(p_user_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := public.require_admin_reason(p_reason);
  g public.premium_grants;
begin
  select * into g from public.premium_grants where user_id = p_user_id and revoked_at is null for update;
  if not found then
    raise exception 'Esta conta não tem cortesia em vigor.' using errcode = 'P0002';
  end if;
  update public.premium_grants set revoked_at = now(), revoked_by = auth.uid() where id = g.id;
  perform public.write_audit('premium_grants', g.id::text, 'admin_revoke_premium', null, null, null,
    jsonb_build_object('user_id', p_user_id, 'reason', v_reason));
end;
$$;

create or replace function public.admin_get_premium_grant(p_user_id uuid)
returns table (id uuid, plan_name text, starts_at timestamptz, expires_at timestamptz, reason text, active boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  return query
    select g.id, p.name, g.starts_at, g.expires_at, g.reason, (g.expires_at is null or g.expires_at > now())
      from public.premium_grants g join public.subscription_plans p on p.id = g.plan_id
     where g.user_id = p_user_id and g.revoked_at is null;
end;
$$;

revoke execute on function public.admin_grant_premium(uuid, uuid, date, text) from public, anon;
revoke execute on function public.admin_revoke_premium(uuid, text) from public, anon;
revoke execute on function public.admin_get_premium_grant(uuid) from public, anon;
grant execute on function public.admin_grant_premium(uuid, uuid, date, text) to authenticated;
grant execute on function public.admin_revoke_premium(uuid, text) to authenticated;
grant execute on function public.admin_get_premium_grant(uuid) to authenticated;
