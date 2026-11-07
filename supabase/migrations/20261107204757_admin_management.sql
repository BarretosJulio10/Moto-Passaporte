-- =============================================================================
-- Fase 6.1 — Painel administrativo: indicadores, usuários e oficinas (PRD 7.1, 7.2, 7.3, 7.7; ADR-023)
-- - admin_get_metrics: indicadores executivos numa chamada.
-- - Usuários: lista com e-mail mascarado; detalhe com dados privados só com motivo (auditado);
--   suspender/bloquear com justificativa (impede novos logins via auth.users.banned_until).
-- - Oficinas: lista, situação (ativa/suspensa/bloqueada) e verificação com justificativa.
-- - Nada aqui altera histórico de motos.
-- Rollback: remover as funções e as colunas de situação de profiles; reativar contas
--   (auth.users.banned_until = null) que tiverem sido suspensas por esta função.
-- =============================================================================

alter table public.profiles
  add column account_status    text not null default 'active' check (account_status in ('active', 'suspended', 'blocked')),
  add column status_reason     text check (char_length(status_reason) <= 500),
  add column status_changed_at timestamptz,
  add column status_changed_by uuid references auth.users (id) on delete set null;

create index profiles_status_changed_by_idx on public.profiles (status_changed_by);

create or replace function public.mask_email(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_email is null or position('@' in p_email) = 0 then null
              else left(split_part(p_email, '@', 1), 2) || '•••@' || split_part(p_email, '@', 2) end;
$$;

create or replace function public.require_admin_reason(p_reason text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 10 or char_length(p_reason) > 500 then
    raise exception 'Informe o motivo (de 10 a 500 caracteres). Ele fica registrado na auditoria.' using errcode = '22023';
  end if;
  return btrim(p_reason);
end;
$$;

revoke execute on function public.require_admin_reason(text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Indicadores (PRD 7.1)
-- -----------------------------------------------------------------------------

create or replace function public.admin_get_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_grace int := public.setting_int('billing_grace_days', 7);
begin
  if not public.is_admin() then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'users_total',          (select count(*) from public.profiles),
    'users_new_7d',         (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'users_new_30d',        (select count(*) from public.profiles where created_at > now() - interval '30 days'),
    'users_restricted',     (select count(*) from public.profiles where account_status <> 'active'),
    'motorcycles_total',    (select count(*) from public.motorcycles),
    'motorcycles_new_7d',   (select count(*) from public.motorcycles where created_at > now() - interval '7 days'),
    'workshops_total',      (select count(*) from public.organizations where type = 'workshop'),
    'workshops_active',     (select count(*) from public.organizations where type = 'workshop' and status = 'active'),
    'workshops_unverified', (select count(*) from public.workshops w join public.organizations o on o.id = w.organization_id
                              where o.status = 'active' and w.verification_status = 'unverified'),
    'records_total',        (select count(*) from public.maintenance_records where not is_void),
    'records_30d',          (select count(*) from public.maintenance_records where not is_void and created_at > now() - interval '30 days'),
    'subscriptions_active', (select count(*) from public.subscriptions where status = 'active' and current_period_end > now()),
    'subscriptions_past_due', (select count(*) from public.subscriptions where status = 'past_due'
                                and current_period_end + make_interval(days => v_grace) > now()),
    'subscriptions_canceling', (select count(*) from public.subscriptions where status = 'canceled' and current_period_end > now()),
    'mrr_cents',            (select coalesce(sum(price_cents::numeric / case billing_period when 'monthly' then 1 when 'semiannual' then 6 else 12 end), 0)::bigint
                               from public.subscriptions
                              where status in ('active', 'past_due') and environment = 'production' and current_period_end > now()),
    'payments_pending',     (select count(*) from public.payments where status = 'pending'),
    'payments_rejected_30d', (select count(*) from public.payments where status = 'rejected' and created_at > now() - interval '30 days'),
    'invoices_failed',      (select count(*) from public.invoices where status = 'failed'),
    'storage_bytes',        (select coalesce(sum(file_size), 0) from public.attachments),
    'files_total',          (select count(*) from public.attachments),
    'transfers_pending',    (select count(*) from public.transfer_requests where status = 'pending' and expires_at > now()),
    'access_requests_pending', (select count(*) from public.motorcycle_workshop_access where status = 'pending'),
    'claims_pending',       (select count(*) from public.motorcycle_claim_requests where status = 'pending'),
    'reports_30d',          (select count(*) from public.motorcycle_reports where generated_at > now() - interval '30 days'),
    'billing_environment',  (select environment from public.payment_gateway_settings where provider = 'mercadopago')
  );
end;
$$;

revoke execute on function public.admin_get_metrics() from public, anon;
grant execute on function public.admin_get_metrics() to authenticated;

-- -----------------------------------------------------------------------------
-- Usuários (PRD 7.2, 7.7)
-- -----------------------------------------------------------------------------

create or replace function public.admin_list_users(p_search text default null, p_limit int default 50)
returns table (
  id uuid, full_name text, email_masked text, created_at timestamptz, account_status text,
  motorcycles int, plan_name text, is_admin boolean, workshops int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := nullif(btrim(p_search), '');
begin
  if not public.is_admin() then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  if v_q is not null and char_length(v_q) > 100 then
    raise exception 'Busca muito longa.' using errcode = '22023';
  end if;
  return query
    select p.id, p.full_name, public.mask_email(coalesce(p.email, u.email)), p.created_at, p.account_status,
           (select count(*)::int from public.motorcycle_ownerships o where o.owner_user_id = p.id and o.ended_at is null),
           (public.user_plan(p.id)).name,
           exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = 'admin'),
           (select count(*)::int from public.organization_members m where m.user_id = p.id)
      from public.profiles p
      left join auth.users u on u.id = p.id
     where v_q is null
        or p.full_name ilike '%' || v_q || '%'
        or coalesce(p.email, u.email) ilike '%' || v_q || '%'
        or p.id::text = v_q
     order by p.created_at desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

revoke execute on function public.admin_list_users(text, int) from public, anon;
grant execute on function public.admin_list_users(text, int) to authenticated;

-- Detalhe com dados privados: exige motivo e fica na auditoria (PRD 7.7).
create or replace function public.admin_get_user(p_user_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := public.require_admin_reason(p_reason);
  p public.profiles;
  u auth.users;
begin
  select * into p from public.profiles where id = p_user_id;
  if not found then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;
  select * into u from auth.users where id = p_user_id;
  perform public.write_audit('profiles', p_user_id::text, 'admin_viewed_user', null, null, null,
                             jsonb_build_object('reason', v_reason));
  return jsonb_build_object(
    'id', p.id, 'full_name', p.full_name, 'email', coalesce(p.email, u.email), 'phone', p.phone,
    'created_at', p.created_at, 'last_sign_in_at', u.last_sign_in_at,
    'account_status', p.account_status, 'status_reason', p.status_reason, 'status_changed_at', p.status_changed_at,
    'roles', (select coalesce(jsonb_agg(r.role order by r.role), '[]'::jsonb) from public.user_roles r where r.user_id = p.id),
    'plan', (public.user_plan(p.id)).name,
    'motorcycles', (select coalesce(jsonb_agg(jsonb_build_object(
                       'id', m.id, 'name', m.brand || ' ' || m.model, 'year', m.manufacturing_year,
                       'plate', (select pl.plate from public.motorcycle_plates pl where pl.motorcycle_id = m.id and pl.valid_until is null),
                       'since', o.started_at) order by o.started_at), '[]'::jsonb)
                      from public.motorcycle_ownerships o join public.motorcycles m on m.id = o.motorcycle_id
                     where o.owner_user_id = p.id and o.ended_at is null),
    'workshops', (select coalesce(jsonb_agg(jsonb_build_object('name', og.name, 'role', mb.role, 'status', og.status)), '[]'::jsonb)
                    from public.organization_members mb join public.organizations og on og.id = mb.organization_id
                   where mb.user_id = p.id),
    'subscription', (select jsonb_build_object('plan_name', s.plan_name, 'status', s.status, 'current_period_end', s.current_period_end,
                                               'environment', s.environment)
                       from public.subscriptions s where s.user_id = p.id order by s.created_at desc limit 1)
  );
end;
$$;

revoke execute on function public.admin_get_user(uuid, text) from public, anon;
grant execute on function public.admin_get_user(uuid, text) to authenticated;

-- Suspender/bloquear/reativar conta com justificativa. Impede novos logins (sessões
-- já abertas expiram quando o token de acesso vence).
create or replace function public.admin_set_user_status(p_user_id uuid, p_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := public.require_admin_reason(p_reason);
  v_prev text;
begin
  if p_status not in ('active', 'suspended', 'blocked') then
    raise exception 'Situação inválida.' using errcode = '22023';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Você não pode alterar a situação da sua própria conta.' using errcode = 'P0001';
  end if;
  if p_status <> 'active' and exists (select 1 from public.user_roles where user_id = p_user_id and role = 'admin') then
    raise exception 'Contas de administrador não podem ser suspensas por aqui.' using errcode = 'P0001';
  end if;
  select account_status into v_prev from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;
  update public.profiles set
    account_status = p_status,
    status_reason = case when p_status = 'active' then null else v_reason end,
    status_changed_at = now(),
    status_changed_by = auth.uid()
  where id = p_user_id;
  update auth.users set banned_until = case when p_status = 'active' then null else 'infinity'::timestamptz end
   where id = p_user_id;
  perform public.write_audit('profiles', p_user_id::text, 'admin_set_user_status', null, null,
                             jsonb_build_object('account_status', v_prev),
                             jsonb_build_object('account_status', p_status, 'reason', v_reason));
end;
$$;

revoke execute on function public.admin_set_user_status(uuid, text, text) from public, anon;
grant execute on function public.admin_set_user_status(uuid, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Oficinas (PRD 7.3)
-- -----------------------------------------------------------------------------

create or replace function public.admin_list_workshops(p_search text default null, p_limit int default 50)
returns table (
  id uuid, business_name text, city text, state text, public_slug text, status text, verification_status text,
  members int, active_accesses int, records int, responsible_name text, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := nullif(btrim(p_search), '');
begin
  if not public.is_admin() then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  return query
    select o.id, w.business_name, w.city, w.state, w.public_slug, o.status::text, w.verification_status::text,
           (select count(*)::int from public.organization_members m where m.organization_id = o.id),
           (select count(*)::int from public.motorcycle_workshop_access a where a.organization_id = o.id and a.status = 'approved'),
           (select count(*)::int from public.maintenance_records r where r.organization_id = o.id and not r.is_void),
           w.responsible_name, o.created_at
      from public.organizations o
      join public.workshops w on w.organization_id = o.id
     where o.type = 'workshop'
       and (v_q is null or w.business_name ilike '%' || v_q || '%' or w.city ilike '%' || v_q || '%'
            or w.public_slug ilike '%' || v_q || '%' or regexp_replace(coalesce(w.cnpj, ''), '\D', '', 'g') = regexp_replace(v_q, '\D', '', 'g'))
     order by o.created_at desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

revoke execute on function public.admin_list_workshops(text, int) from public, anon;
grant execute on function public.admin_list_workshops(text, int) to authenticated;

create or replace function public.admin_set_workshop_status(p_organization_id uuid, p_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := public.require_admin_reason(p_reason);
  v_prev text;
begin
  if p_status not in ('active', 'suspended', 'blocked') then
    raise exception 'Situação inválida.' using errcode = '22023';
  end if;
  select status::text into v_prev from public.organizations where id = p_organization_id and type = 'workshop' for update;
  if not found then
    raise exception 'Oficina não encontrada.' using errcode = 'P0002';
  end if;
  update public.organizations set status = p_status::public.organization_status where id = p_organization_id;
  perform public.write_audit('organizations', p_organization_id::text, 'admin_set_workshop_status', null, p_organization_id,
                             jsonb_build_object('status', v_prev), jsonb_build_object('status', p_status, 'reason', v_reason));
end;
$$;

revoke execute on function public.admin_set_workshop_status(uuid, text, text) from public, anon;
grant execute on function public.admin_set_workshop_status(uuid, text, text) to authenticated;

create or replace function public.admin_set_workshop_verification(p_organization_id uuid, p_verification text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := public.require_admin_reason(p_reason);
  v_prev text;
begin
  if p_verification not in ('unverified', 'verified', 'rejected') then
    raise exception 'Verificação inválida.' using errcode = '22023';
  end if;
  select verification_status::text into v_prev from public.workshops where organization_id = p_organization_id for update;
  if not found then
    raise exception 'Oficina não encontrada.' using errcode = 'P0002';
  end if;
  update public.workshops set verification_status = p_verification::public.workshop_verification
   where organization_id = p_organization_id;
  perform public.write_audit('workshops', p_organization_id::text, 'admin_set_workshop_verification', null, p_organization_id,
                             jsonb_build_object('verification_status', v_prev),
                             jsonb_build_object('verification_status', p_verification, 'reason', v_reason));
end;
$$;

revoke execute on function public.admin_set_workshop_verification(uuid, text, text) from public, anon;
grant execute on function public.admin_set_workshop_verification(uuid, text, text) to authenticated;
