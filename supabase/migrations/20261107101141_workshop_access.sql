-- =============================================================================
-- Moto Passaporte — Migração: pesquisa por placa e autorizações de oficina
-- (Fase 3, PRD 6.4, 6.6; itens 3.3 e 3.4)
-- Objetivo: oficina pesquisa a placa (com limite de tentativas e auditoria),
--           vê só o mínimo (marca, modelo, ano), pede acesso; o titular aprova,
--           recusa ou revoga. Autorizações nunca são apagadas (histórico).
--           Após aprovação, a oficina vê identificação, placa atual e última km.
-- Dependências: organizations, workshops, motorcycles.
-- Reversão: drop functions *workshop_access*, search_motorcycle_by_plate,
--           get_my_pending_access_requests, get_workshop_access_list,
--           workshop_has_access, protect_workshop_access; drop table
--           motorcycle_workshop_access, plate_search_log; drop types
--           workshop_access_status, workshop_access_type; delete settings workshop_*.
-- =============================================================================

insert into public.system_settings (key, value, description, is_public) values
  ('workshop_plate_search_per_hour', '30', 'Pesquisas por placa por usuário de oficina, por hora.', false),
  ('workshop_org_search_per_hour', '100', 'Pesquisas por placa por oficina, por hora.', false),
  ('workshop_access_requests_per_day', '20', 'Pedidos de acesso por oficina, por dia.', false),
  ('workshop_access_retry_days', '7', 'Dias de espera para pedir de novo após recusa do titular.', false)
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- Registro de pesquisas (auditoria e limite). Não guarda a placa, só o hash.
-- -----------------------------------------------------------------------------

create table public.plate_search_log (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  created_by      uuid references auth.users (id) on delete set null,
  plate_hash      text not null,
  found           boolean not null,
  created_at      timestamptz not null default now()
);

comment on table public.plate_search_log is
  'Pesquisas por placa feitas por oficinas (PRD 6.4). plate_hash = sha256 da placa normalizada.';

create index plate_search_log_user_idx on public.plate_search_log (created_by, created_at desc);
create index plate_search_log_org_idx  on public.plate_search_log (organization_id, created_at desc);

create trigger plate_search_log_immutable
  before update or delete on public.plate_search_log
  for each row execute function public.prevent_history_mutation();

alter table public.plate_search_log enable row level security;
revoke all on public.plate_search_log from anon, authenticated;
grant select on public.plate_search_log to authenticated;
create policy plate_search_log_select_admin on public.plate_search_log
  for select to authenticated using (public.is_admin());

-- -----------------------------------------------------------------------------
-- Autorizações
-- -----------------------------------------------------------------------------

create type public.workshop_access_status as enum ('pending', 'approved', 'rejected', 'canceled', 'revoked', 'ended');
create type public.workshop_access_type   as enum ('regular', 'origin');

create table public.motorcycle_workshop_access (
  id              uuid primary key default gen_random_uuid(),
  motorcycle_id   uuid not null references public.motorcycles (id) on delete restrict,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  access_type     public.workshop_access_type not null default 'regular',
  status          public.workshop_access_status not null default 'pending',
  message         text check (message is null or char_length(message) <= 280),
  requested_by    uuid references auth.users (id) on delete set null,
  requested_at    timestamptz not null default now(),
  decided_by      uuid references auth.users (id) on delete set null,
  decided_at      timestamptz,
  ended_by        uuid references auth.users (id) on delete set null,
  ended_at        timestamptz,
  end_reason      text check (end_reason is null or end_reason in ('owner', 'transfer', 'admin', 'workshop')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.motorcycle_workshop_access is
  'Autorizações de oficinas por moto (PRD 6.4–6.6). Nunca apagadas; revogação vale imediatamente no backend.';

-- No máximo um pedido pendente ou uma autorização ativa por oficina e moto.
create unique index motorcycle_workshop_access_open_uidx
  on public.motorcycle_workshop_access (motorcycle_id, organization_id)
  where status in ('pending', 'approved');
create index motorcycle_workshop_access_moto_idx on public.motorcycle_workshop_access (motorcycle_id, requested_at desc);
create index motorcycle_workshop_access_org_idx  on public.motorcycle_workshop_access (organization_id, status, requested_at desc);
create index motorcycle_workshop_access_requested_by_idx on public.motorcycle_workshop_access (requested_by);

-- Transições permitidas: pending -> approved/rejected/canceled; approved -> revoked/ended.
create or replace function public.protect_workshop_access()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_fixed_old jsonb;
  v_fixed_new jsonb;
begin
  if tg_op = 'DELETE' then
    raise exception 'Histórico de autorizações não pode ser excluído.' using errcode = '42501';
  end if;
  v_fixed_old := to_jsonb(old) - 'status' - 'decided_by' - 'decided_at' - 'ended_by' - 'ended_at' - 'end_reason' - 'updated_at' - 'requested_by';
  v_fixed_new := to_jsonb(new) - 'status' - 'decided_by' - 'decided_at' - 'ended_by' - 'ended_at' - 'end_reason' - 'updated_at' - 'requested_by';
  -- Exclusão de conta zera colunas de autoria sem mudar mais nada.
  if new.status = old.status and v_fixed_new = v_fixed_old
     and (new.requested_by is null or new.requested_by = old.requested_by)
     and (new.decided_by is null or new.decided_by is not distinct from old.decided_by)
     and (new.ended_by is null or new.ended_by is not distinct from old.ended_by)
     and new.decided_at is not distinct from old.decided_at
     and new.ended_at is not distinct from old.ended_at then
    return new;
  end if;
  if v_fixed_new <> v_fixed_old or new.requested_by is distinct from old.requested_by then
    raise exception 'Dados do pedido não podem ser alterados.' using errcode = '42501';
  end if;
  if not (
       (old.status = 'pending'  and new.status in ('approved', 'rejected', 'canceled'))
    or (old.status = 'approved' and new.status in ('revoked', 'ended'))
  ) then
    raise exception 'Mudança de situação não permitida.' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.protect_workshop_access() from public, anon, authenticated;

create trigger motorcycle_workshop_access_protect
  before update or delete on public.motorcycle_workshop_access
  for each row execute function public.protect_workshop_access();

create trigger motorcycle_workshop_access_audit
  after insert or update on public.motorcycle_workshop_access
  for each row execute function public.audit_row_change('motorcycle_id', 'organization_id');

alter table public.motorcycle_workshop_access enable row level security;
revoke all on public.motorcycle_workshop_access from anon, authenticated;
-- Leitura pelas funções abaixo (com dados da oficina e da moto conforme o papel).
grant select on public.motorcycle_workshop_access to authenticated;
create policy motorcycle_workshop_access_select on public.motorcycle_workshop_access
  for select to authenticated
  using (public.is_current_owner(motorcycle_id) or public.is_org_member(organization_id) or public.is_admin());

-- Usuário é membro ativo de oficina ativa com autorização aprovada para a moto.
create or replace function public.workshop_has_access(p_motorcycle uuid, p_organization uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.motorcycle_workshop_access a
    join public.organization_members m
      on m.organization_id = a.organization_id and m.user_id = auth.uid() and m.status = 'active'
    join public.organizations o on o.id = a.organization_id and o.status = 'active'
    where a.motorcycle_id = p_motorcycle
      and a.status = 'approved'
      and (p_organization is null or a.organization_id = p_organization)
  );
$$;
revoke execute on function public.workshop_has_access(uuid, uuid) from public, anon;
grant  execute on function public.workshop_has_access(uuid, uuid) to authenticated;

-- Garante membro ativo de oficina ativa.
create or replace function public.assert_workshop_member(p_organization uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_org_member(p_organization) or not public.is_org_active(p_organization) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function public.assert_workshop_member(uuid) from public, anon, authenticated;

create or replace function public.setting_int(p_key text, p_default int)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (value #>> '{}')::int from public.system_settings where key = p_key), p_default);
$$;
revoke execute on function public.setting_int(text, int) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Pesquisa por placa (PRD 6.4, passos 1 a 3)
-- -----------------------------------------------------------------------------

create or replace function public.search_motorcycle_by_plate(p_organization_id uuid, p_plate text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_plate text := public.normalize_plate(p_plate);
  v_moto  public.motorcycles;
  v_acc   public.motorcycle_workshop_access;
begin
  perform public.assert_workshop_member(p_organization_id);
  if v_plate is null or not public.is_valid_plate(v_plate) then
    raise exception 'Placa inválida. Use o formato ABC1D23 ou ABC1234.' using errcode = '22023';
  end if;

  if (select count(*) from public.plate_search_log
       where created_by = v_uid and created_at > now() - interval '1 hour')
       >= public.setting_int('workshop_plate_search_per_hour', 30)
     or (select count(*) from public.plate_search_log
       where organization_id = p_organization_id and created_at > now() - interval '1 hour')
       >= public.setting_int('workshop_org_search_per_hour', 100) then
    raise exception 'Muitas pesquisas em pouco tempo. Tente novamente mais tarde.' using errcode = 'P0001';
  end if;

  select m.* into v_moto
    from public.motorcycle_plates p
    join public.motorcycles m on m.id = p.motorcycle_id
   where p.plate = v_plate and p.valid_until is null and m.status = 'active';

  insert into public.plate_search_log (organization_id, created_by, plate_hash, found)
  values (p_organization_id, v_uid, encode(extensions.digest(v_plate, 'sha256'), 'hex'), v_moto.id is not null);

  if v_moto.id is null then
    return jsonb_build_object('found', false);
  end if;

  select * into v_acc from public.motorcycle_workshop_access
   where motorcycle_id = v_moto.id and organization_id = p_organization_id
   order by requested_at desc limit 1;

  return jsonb_build_object(
    'found', true,
    'brand', v_moto.brand,
    'model', v_moto.model,
    'manufacturing_year', v_moto.manufacturing_year,
    'access_id', v_acc.id,
    'access_status', v_acc.status,
    -- Identificador interno só para quem já tem acesso aprovado.
    'motorcycle_id', case when v_acc.status = 'approved' then v_moto.id end
  );
end;
$$;
revoke execute on function public.search_motorcycle_by_plate(uuid, text) from public, anon;
grant  execute on function public.search_motorcycle_by_plate(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Pedido de acesso (passo 4). Feito pela placa, sem expor o id da moto.
-- -----------------------------------------------------------------------------

create or replace function public.request_workshop_access(
  p_organization_id uuid,
  p_plate           text,
  p_message         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_plate text := public.normalize_plate(p_plate);
  v_moto  uuid;
  v_open  public.motorcycle_workshop_access;
  v_id    uuid;
begin
  perform public.assert_workshop_member(p_organization_id);
  if p_message is not null and char_length(trim(p_message)) > 280 then
    raise exception 'A mensagem pode ter até 280 caracteres.' using errcode = '22023';
  end if;

  select p.motorcycle_id into v_moto
    from public.motorcycle_plates p
    join public.motorcycles m on m.id = p.motorcycle_id
   where p.plate = v_plate and p.valid_until is null and m.status = 'active';
  if v_moto is null then
    raise exception 'Placa não encontrada.' using errcode = 'P0001';
  end if;

  select * into v_open from public.motorcycle_workshop_access
   where motorcycle_id = v_moto and organization_id = p_organization_id and status in ('pending', 'approved');
  if found then
    return jsonb_build_object('id', v_open.id, 'status', v_open.status);
  end if;

  if exists (select 1 from public.motorcycle_workshop_access
             where motorcycle_id = v_moto and organization_id = p_organization_id and status = 'rejected'
               and decided_at > now() - make_interval(days => public.setting_int('workshop_access_retry_days', 7))) then
    raise exception 'O titular recusou um pedido recente. Aguarde alguns dias para pedir de novo.' using errcode = 'P0001';
  end if;

  if (select count(*) from public.motorcycle_workshop_access
       where organization_id = p_organization_id and requested_at > now() - interval '1 day')
       >= public.setting_int('workshop_access_requests_per_day', 20) then
    raise exception 'Limite diário de pedidos de acesso atingido.' using errcode = 'P0001';
  end if;

  insert into public.motorcycle_workshop_access (motorcycle_id, organization_id, message, requested_by)
  values (v_moto, p_organization_id, nullif(trim(p_message), ''), v_uid)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'status', 'pending');
end;
$$;
revoke execute on function public.request_workshop_access(uuid, text, text) from public, anon;
grant  execute on function public.request_workshop_access(uuid, text, text) to authenticated;

create or replace function public.cancel_workshop_access_request(p_access_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.motorcycle_workshop_access;
begin
  select * into a from public.motorcycle_workshop_access where id = p_access_id for update;
  if not found or not public.is_org_member(a.organization_id) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  if a.status <> 'pending' then
    raise exception 'Só pedidos pendentes podem ser cancelados.' using errcode = 'P0001';
  end if;
  update public.motorcycle_workshop_access
     set status = 'canceled', ended_by = auth.uid(), ended_at = now(), end_reason = 'workshop'
   where id = p_access_id;
end;
$$;
revoke execute on function public.cancel_workshop_access_request(uuid) from public, anon;
grant  execute on function public.cancel_workshop_access_request(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Decisão e revogação pelo titular (passos 6 e PRD 6.6)
-- -----------------------------------------------------------------------------

create or replace function public.decide_workshop_access(p_access_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.motorcycle_workshop_access;
begin
  select * into a from public.motorcycle_workshop_access where id = p_access_id for update;
  if not found or not public.is_current_owner(a.motorcycle_id) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  if a.status <> 'pending' then
    raise exception 'Este pedido já foi respondido.' using errcode = 'P0001';
  end if;
  if p_approve and not public.is_org_active(a.organization_id) then
    raise exception 'Esta oficina não está ativa na plataforma.' using errcode = 'P0001';
  end if;
  update public.motorcycle_workshop_access
     set status = case when p_approve then 'approved'::public.workshop_access_status else 'rejected' end,
         decided_by = auth.uid(), decided_at = now()
   where id = p_access_id;
end;
$$;
revoke execute on function public.decide_workshop_access(uuid, boolean) from public, anon;
grant  execute on function public.decide_workshop_access(uuid, boolean) to authenticated;

create or replace function public.revoke_workshop_access(p_access_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.motorcycle_workshop_access;
begin
  select * into a from public.motorcycle_workshop_access where id = p_access_id for update;
  if not found or not public.is_current_owner(a.motorcycle_id) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  if a.status <> 'approved' then
    raise exception 'Só autorizações ativas podem ser revogadas.' using errcode = 'P0001';
  end if;
  update public.motorcycle_workshop_access
     set status = 'revoked', ended_by = auth.uid(), ended_at = now(), end_reason = 'owner'
   where id = p_access_id;
end;
$$;
revoke execute on function public.revoke_workshop_access(uuid) from public, anon;
grant  execute on function public.revoke_workshop_access(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Leituras
-- -----------------------------------------------------------------------------

-- Titular: autorizações e histórico de uma moto, com dados públicos da oficina.
create or replace function public.get_motorcycle_workshop_access(p_motorcycle_id uuid)
returns table (
  id uuid, status public.workshop_access_status, access_type public.workshop_access_type,
  message text, requested_at timestamptz, decided_at timestamptz, ended_at timestamptz, end_reason text,
  workshop_name text, workshop_city text, workshop_state text, workshop_slug text,
  workshop_verified boolean, workshop_active boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_current_owner(p_motorcycle_id) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  return query
    select a.id, a.status, a.access_type, a.message, a.requested_at, a.decided_at, a.ended_at, a.end_reason,
           coalesce(w.business_name, o.name), w.city, w.state,
           case when w.is_public then w.public_slug end,
           coalesce(w.verification_status = 'verified', false),
           o.status = 'active'
      from public.motorcycle_workshop_access a
      join public.organizations o on o.id = a.organization_id
      left join public.workshops w on w.organization_id = a.organization_id
     where a.motorcycle_id = p_motorcycle_id
     order by (a.status = 'pending') desc, (a.status = 'approved') desc, a.requested_at desc;
end;
$$;
revoke execute on function public.get_motorcycle_workshop_access(uuid) from public, anon;
grant  execute on function public.get_motorcycle_workshop_access(uuid) to authenticated;

-- Titular: pedidos pendentes em todas as suas motos (aviso no painel).
create or replace function public.get_my_pending_access_requests()
returns table (
  id uuid, motorcycle_id uuid, motorcycle_label text, workshop_name text,
  workshop_city text, workshop_state text, message text, requested_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.motorcycle_id, m.brand || ' ' || m.model,
         coalesce(w.business_name, o.name), w.city, w.state, a.message, a.requested_at
    from public.motorcycle_workshop_access a
    join public.motorcycle_ownerships ow
      on ow.motorcycle_id = a.motorcycle_id and ow.ended_at is null and ow.owner_user_id = auth.uid()
    join public.motorcycles m on m.id = a.motorcycle_id
    join public.organizations o on o.id = a.organization_id
    left join public.workshops w on w.organization_id = a.organization_id
   where a.status = 'pending'
   order by a.requested_at desc;
$$;
revoke execute on function public.get_my_pending_access_requests() from public, anon;
grant  execute on function public.get_my_pending_access_requests() to authenticated;

-- Oficina: pedidos e autorizações. Placa, km e id da moto só com acesso aprovado.
create or replace function public.get_workshop_access_list(p_organization_id uuid)
returns table (
  id uuid, status public.workshop_access_status, access_type public.workshop_access_type,
  requested_at timestamptz, decided_at timestamptz, ended_at timestamptz,
  brand text, model text, manufacturing_year smallint,
  motorcycle_id uuid, plate text, latest_mileage integer, latest_mileage_at date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_org_member(p_organization_id) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  return query
    select a.id, a.status, a.access_type, a.requested_at, a.decided_at, a.ended_at,
           m.brand, m.model, m.manufacturing_year,
           case when ok.allowed then m.id end,
           case when ok.allowed then p.plate end,
           case when ok.allowed then lm.mileage end,
           case when ok.allowed then lm.recorded_at end
      from public.motorcycle_workshop_access a
      join public.motorcycles m on m.id = a.motorcycle_id
      cross join lateral (select a.status = 'approved' and public.is_org_active(a.organization_id) as allowed) ok
      left join public.motorcycle_plates p on p.motorcycle_id = m.id and p.valid_until is null
      left join lateral (
        select mr.mileage, mr.recorded_at from public.mileage_records mr
         where mr.motorcycle_id = m.id order by mr.recorded_at desc, mr.created_at desc limit 1
      ) lm on true
     where a.organization_id = p_organization_id
     order by (a.status = 'approved') desc, (a.status = 'pending') desc, a.requested_at desc;
end;
$$;
revoke execute on function public.get_workshop_access_list(uuid) from public, anon;
grant  execute on function public.get_workshop_access_list(uuid) to authenticated;
