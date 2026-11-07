-- =============================================================================
-- Moto Passaporte — Migração: Oficina de Origem (Fase 3, PRD 6.5; item 3.5; ADR-014)
-- Objetivo: a oficina que ajudou no cadastro inicial pode ser reconhecida como
--           Oficina de Origem, só com consentimento do titular, nos primeiros
--           dias do passaporte, uma por moto. O vínculo é uma autorização com
--           access_type = 'origin': continua ativo até ser revogado e não dá
--           propriedade. O titular pode tirar o título sem cortar o acesso.
-- Dependências: workshop_access.
-- Reversão: recriar request_workshop_access (3 parâmetros), decide_workshop_access
--           (2 parâmetros), get_motorcycle_workshop_access e protect_workshop_access
--           da migração workshop_access; drop function set_origin_workshop,
--           origin_available; drop index motorcycle_workshop_access_origin_uidx;
--           delete setting origin_workshop_window_days.
-- =============================================================================

insert into public.system_settings (key, value, description, is_public) values
  ('origin_workshop_window_days', '30', 'Dias após a criação do passaporte em que uma oficina pode ser reconhecida como Oficina de Origem.', false)
on conflict (key) do nothing;

-- Uma única Oficina de Origem ativa por moto.
create unique index motorcycle_workshop_access_origin_uidx
  on public.motorcycle_workshop_access (motorcycle_id)
  where access_type = 'origin' and status = 'approved';

-- Transições: as anteriores e, em autorização ativa, trocar o tipo
-- (definir/tirar Origem). Na aprovação, o titular pode aprovar pedido de Origem
-- apenas como acesso comum.
create or replace function public.protect_workshop_access()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_mutable constant text[] := array['status', 'decided_by', 'decided_at', 'ended_by', 'ended_at', 'end_reason', 'updated_at', 'requested_by', 'access_type'];
  v_fixed_old jsonb;
  v_fixed_new jsonb;
begin
  if tg_op = 'DELETE' then
    raise exception 'Histórico de autorizações não pode ser excluído.' using errcode = '42501';
  end if;
  v_fixed_old := to_jsonb(old) - v_mutable;
  v_fixed_new := to_jsonb(new) - v_mutable;
  if v_fixed_new <> v_fixed_old or (new.requested_by is not null and new.requested_by is distinct from old.requested_by) then
    raise exception 'Dados do pedido não podem ser alterados.' using errcode = '42501';
  end if;

  -- Exclusão de conta zera colunas de autoria sem mudar mais nada.
  if new.status = old.status and new.access_type = old.access_type
     and (new.requested_by is null or new.requested_by = old.requested_by)
     and (new.decided_by is null or new.decided_by is not distinct from old.decided_by)
     and (new.ended_by is null or new.ended_by is not distinct from old.ended_by)
     and new.decided_at is not distinct from old.decided_at
     and new.ended_at is not distinct from old.ended_at
     and new.end_reason is not distinct from old.end_reason then
    return new;
  end if;

  -- Definir ou tirar o título de Origem numa autorização ativa.
  if old.status = 'approved' and new.status = 'approved' and new.access_type <> old.access_type
     and new.decided_by is not distinct from old.decided_by and new.decided_at is not distinct from old.decided_at
     and new.ended_at is null and new.end_reason is null then
    new.updated_at := now();
    return new;
  end if;

  if new.access_type <> old.access_type
     and not (old.status = 'pending' and new.status = 'approved' and old.access_type = 'origin' and new.access_type = 'regular') then
    raise exception 'Tipo de autorização não pode ser alterado assim.' using errcode = '42501';
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

-- A moto ainda aceita uma Oficina de Origem? (dentro do prazo e sem outra ativa)
create or replace function public.origin_available(p_motorcycle uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.motorcycles m
    where m.id = p_motorcycle
      and m.created_at > now() - make_interval(days => public.setting_int('origin_workshop_window_days', 30))
  ) and not exists (
    select 1 from public.motorcycle_workshop_access
    where motorcycle_id = p_motorcycle and access_type = 'origin' and status = 'approved'
  );
$$;
revoke execute on function public.origin_available(uuid) from public, anon, authenticated;

-- Pesquisa: informa se a oficina pode pedir o reconhecimento de Origem.
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
    'access_type', v_acc.access_type,
    'origin_available', public.origin_available(v_moto.id),
    'motorcycle_id', case when v_acc.status = 'approved' then v_moto.id end
  );
end;
$$;

-- Pedido: p_origin = "ajudamos a criar este passaporte".
drop function public.request_workshop_access(uuid, text, text);

create function public.request_workshop_access(
  p_organization_id uuid,
  p_plate           text,
  p_message         text default null,
  p_origin          boolean default false
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
    return jsonb_build_object('id', v_open.id, 'status', v_open.status, 'access_type', v_open.access_type);
  end if;

  if coalesce(p_origin, false) and not public.origin_available(v_moto) then
    raise exception 'Esta moto não aceita mais pedido de Oficina de Origem (prazo encerrado ou já definida).' using errcode = 'P0001';
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

  insert into public.motorcycle_workshop_access (motorcycle_id, organization_id, message, requested_by, access_type)
  values (v_moto, p_organization_id, nullif(trim(p_message), ''), v_uid,
          case when coalesce(p_origin, false) then 'origin'::public.workshop_access_type else 'regular' end)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'status', 'pending',
                            'access_type', case when coalesce(p_origin, false) then 'origin' else 'regular' end);
end;
$$;
revoke execute on function public.request_workshop_access(uuid, text, text, boolean) from public, anon;
grant  execute on function public.request_workshop_access(uuid, text, text, boolean) to authenticated;

-- Decisão: pedido de Origem pode ser aprovado só como acesso comum (p_as_origin = false).
drop function public.decide_workshop_access(uuid, boolean);

create function public.decide_workshop_access(p_access_id uuid, p_approve boolean, p_as_origin boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.motorcycle_workshop_access;
  v_type public.workshop_access_type;
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

  v_type := a.access_type;
  if p_approve and a.access_type = 'origin' then
    if not coalesce(p_as_origin, true) then
      v_type := 'regular';
    elsif not public.origin_available(a.motorcycle_id) then
      raise exception 'Esta moto já tem Oficina de Origem ou o prazo acabou. Autorize só o acesso.' using errcode = 'P0001';
    end if;
  end if;

  update public.motorcycle_workshop_access
     set status = case when p_approve then 'approved'::public.workshop_access_status else 'rejected' end,
         access_type = v_type,
         decided_by = auth.uid(), decided_at = now()
   where id = p_access_id;
end;
$$;
revoke execute on function public.decide_workshop_access(uuid, boolean, boolean) from public, anon;
grant  execute on function public.decide_workshop_access(uuid, boolean, boolean) to authenticated;

-- Titular define ou tira o título de Origem de uma autorização ativa.
create or replace function public.set_origin_workshop(p_access_id uuid, p_origin boolean)
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
    raise exception 'Só oficinas autorizadas podem ter o título de Origem.' using errcode = 'P0001';
  end if;
  if p_origin then
    if a.access_type = 'origin' then
      return;
    end if;
    if not public.origin_available(a.motorcycle_id) then
      raise exception 'Esta moto já tem Oficina de Origem ou o prazo acabou.' using errcode = 'P0001';
    end if;
    update public.motorcycle_workshop_access set access_type = 'origin' where id = p_access_id;
  else
    update public.motorcycle_workshop_access set access_type = 'regular' where id = p_access_id and access_type = 'origin';
  end if;
end;
$$;
revoke execute on function public.set_origin_workshop(uuid, boolean) from public, anon;
grant  execute on function public.set_origin_workshop(uuid, boolean) to authenticated;

-- Leitura do titular passa a informar se a moto ainda aceita Oficina de Origem.
drop function public.get_motorcycle_workshop_access(uuid);

create function public.get_motorcycle_workshop_access(p_motorcycle_id uuid)
returns table (
  id uuid, status public.workshop_access_status, access_type public.workshop_access_type,
  message text, requested_at timestamptz, decided_at timestamptz, ended_at timestamptz, end_reason text,
  workshop_name text, workshop_city text, workshop_state text, workshop_slug text,
  workshop_verified boolean, workshop_active boolean, origin_available boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_origin boolean;
begin
  if not public.is_current_owner(p_motorcycle_id) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  v_origin := public.origin_available(p_motorcycle_id);
  return query
    select a.id, a.status, a.access_type, a.message, a.requested_at, a.decided_at, a.ended_at, a.end_reason,
           coalesce(w.business_name, o.name), w.city, w.state,
           case when w.is_public then w.public_slug end,
           coalesce(w.verification_status = 'verified', false),
           o.status = 'active',
           v_origin
      from public.motorcycle_workshop_access a
      join public.organizations o on o.id = a.organization_id
      left join public.workshops w on w.organization_id = a.organization_id
     where a.motorcycle_id = p_motorcycle_id
     order by (a.status = 'pending') desc, (a.status = 'approved') desc, (a.access_type = 'origin') desc, a.requested_at desc;
end;
$$;
revoke execute on function public.get_motorcycle_workshop_access(uuid) from public, anon;
grant  execute on function public.get_motorcycle_workshop_access(uuid) to authenticated;
