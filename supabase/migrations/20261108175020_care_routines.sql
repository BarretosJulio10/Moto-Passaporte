-- =============================================================================
-- Rotinas de cuidado da moto com aviso no celular (ADR-041) — grátis para todos
-- - Catálogo de rotinas (care_routines), pronto para novas (pneu, freio, bateria…).
-- - Troca de óleo por km: intervalo do usuário (sugestão 1.000 km); aviso 500 km antes e quando
--   vence, na hora em que o km é atualizado. Registrar "Troca de óleo" no histórico reinicia a conta.
-- - Corrente (folga e lubrificação): a cada 7 dias (padrão) ou 15; pode desligar.
-- - Check-up semanal, sábado às 10h (Brasília), um aviso por moto: atualizar km, óleo e corrente.
-- Rollback: supabase/rollback/20261108175020_care_routines.down.sql
-- =============================================================================

create table if not exists public.care_routines (
  code             text primary key check (code ~ '^[a-z_]{3,40}$'),
  name             text not null,
  trigger_type     text not null check (trigger_type in ('km', 'days')),
  default_interval int  not null,
  min_interval     int  not null,
  max_interval     int  not null,
  enabled_default  boolean not null default true,
  soon_before      int,          -- km (ou dias) antes do vencimento para avisar
  sort             int not null default 100,
  check (default_interval between min_interval and max_interval)
);
alter table public.care_routines enable row level security;
revoke all on public.care_routines from public, anon, authenticated;
insert into public.care_routines (code, name, trigger_type, default_interval, min_interval, max_interval, enabled_default, soon_before, sort) values
  ('oil_change', 'Troca de óleo', 'km', 1000, 300, 20000, true, 500, 10),
  ('chain_check', 'Corrente: folga e lubrificação', 'days', 7, 7, 15, true, null, 20)
on conflict (code) do nothing;

create table if not exists public.motorcycle_care (
  motorcycle_id  uuid not null references public.motorcycles (id) on delete cascade,
  routine_code   text not null references public.care_routines (code) on delete cascade,
  interval_value int,
  enabled        boolean not null default true,
  last_done_at   timestamptz,
  last_done_km   int check (last_done_km is null or last_done_km between 0 and 2000000),
  updated_by     uuid references auth.users (id) on delete set null,
  updated_at     timestamptz not null default now(),
  primary key (motorcycle_id, routine_code)
);
create index if not exists motorcycle_care_routine_idx on public.motorcycle_care (routine_code);
create index if not exists motorcycle_care_updated_by_idx on public.motorcycle_care (updated_by);
alter table public.motorcycle_care enable row level security;
revoke all on public.motorcycle_care from public, anon, authenticated;
comment on table public.motorcycle_care is 'Configuração das rotinas de cuidado por moto (ADR-041). Só por funções.';

-- Novos tipos de aviso.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'workshop_access_request', 'workshop_access_decided', 'workshop_access_revoked', 'workshop_service',
  'transfer_received', 'transfer_decided', 'reminder_due', 'subscription_ending', 'payment_approved',
  'payment_failed', 'storage_limit', 'claim_decided', 'ownership_notice', 'admin_notice',
  'care_checkup', 'oil_change'));

create or replace function public.notification_kind_optional(p_kind text)
returns boolean
language sql
immutable
set search_path = ''
as $$ select p_kind in ('reminder_due', 'storage_limit', 'subscription_ending', 'workshop_service', 'care_checkup', 'oil_change') $$;

-- Situação das rotinas de uma moto (uso interno).
create or replace function public.care_status(p_motorcycle uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_km int := public.motorcycle_current_km(p_motorcycle);
  v_km_at timestamptz;
  ro public.care_routines;
  co public.motorcycle_care;
  rc public.care_routines;
  cc public.motorcycle_care;
  v_oil_km int;
  v_oil_date date;
  v_base int;
  v_interval int;
  v_next int;
  v_left int;
  v_chain_days int;
  v_chain_next timestamptz;
begin
  select max(mr.created_at) into v_km_at from public.mileage_records mr where mr.motorcycle_id = p_motorcycle;

  select * into ro from public.care_routines where code = 'oil_change';
  select * into co from public.motorcycle_care where motorcycle_id = p_motorcycle and routine_code = 'oil_change';
  -- Última troca de óleo vigente no histórico (não anulada nem corrigida).
  select r.mileage, r.service_date into v_oil_km, v_oil_date
    from public.maintenance_records r
   where r.motorcycle_id = p_motorcycle and r.category = 'oil_change' and not r.is_void and r.mileage is not null
     and not exists (select 1 from public.maintenance_records c where c.corrects_record_id = r.id)
   order by r.mileage desc limit 1;
  v_base := greatest(v_oil_km, co.last_done_km);
  if v_base is null then
    select mr.mileage into v_base from public.mileage_records mr where mr.motorcycle_id = p_motorcycle
     order by mr.recorded_at, mr.created_at limit 1;
  end if;
  v_interval := coalesce(co.interval_value, ro.default_interval);
  v_next := v_base + v_interval;
  v_left := case when v_km is not null and v_next is not null then v_next - v_km end;

  select * into rc from public.care_routines where code = 'chain_check';
  select * into cc from public.motorcycle_care where motorcycle_id = p_motorcycle and routine_code = 'chain_check';
  v_chain_days := coalesce(cc.interval_value, rc.default_interval);
  v_chain_next := case when cc.last_done_at is null then null else cc.last_done_at + make_interval(days => v_chain_days) end;

  return jsonb_build_object(
    'current_km', v_km,
    'km_updated_at', v_km_at,
    'oil', jsonb_build_object(
      'enabled', coalesce(co.enabled, ro.enabled_default),
      'configured', co.interval_value is not null,
      'interval_km', v_interval,
      'last_change_km', v_base,
      'last_change_from', case when v_oil_km is not null and v_oil_km >= coalesce(co.last_done_km, -1) then 'history'
                               when co.last_done_km is not null then 'informed' else 'first_reading' end,
      'last_change_date', v_oil_date,
      'next_km', v_next,
      'km_left', v_left,
      'soon_before', ro.soon_before,
      'status', case when v_left is null then 'unknown' when v_left <= 0 then 'due'
                     when v_left <= ro.soon_before then 'soon' else 'ok' end),
    'chain', jsonb_build_object(
      'enabled', coalesce(cc.enabled, rc.enabled_default),
      'interval_days', v_chain_days,
      'last_done_at', cc.last_done_at,
      'next_at', v_chain_next,
      'due', coalesce(cc.enabled, rc.enabled_default) and (cc.last_done_at is null or cc.last_done_at <= now() - make_interval(days => v_chain_days - 1)))
  );
end;
$$;
revoke execute on function public.care_status(uuid) from public, anon, authenticated;

-- Aviso de óleo na hora (500 km antes e vencido), um por ciclo de troca.
create or replace function public.care_check_oil(p_motorcycle uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v jsonb;
  v_name text;
begin
  select o.owner_user_id into v_owner from public.motorcycle_ownerships o
   where o.motorcycle_id = p_motorcycle and o.ended_at is null limit 1;
  if v_owner is null then return; end if;
  v := public.care_status(p_motorcycle) -> 'oil';
  if not (v ->> 'enabled')::boolean or (v ->> 'status') not in ('soon', 'due') then return; end if;
  select m.brand || ' ' || m.model into v_name from public.motorcycles m where m.id = p_motorcycle;
  perform public.notify(v_owner, 'oil_change',
    case when v ->> 'status' = 'due' then 'Troca de óleo vencida: ' || v_name else 'Troca de óleo chegando: ' || v_name end,
    case when v ->> 'status' = 'due'
         then 'Passou ' || abs((v ->> 'km_left')::int) || ' km da troca (prevista aos ' || (v ->> 'next_km') || ' km). Troque e registre no histórico.'
         else 'Faltam ' || (v ->> 'km_left') || ' km para trocar o óleo (prevista aos ' || (v ->> 'next_km') || ' km).' end,
    '/painel/motos/' || p_motorcycle || '/checkup',
    'oil:' || p_motorcycle || ':' || (v ->> 'last_change_km') || ':' || (v ->> 'interval_km') || ':' || (v ->> 'status'));
exception when others then
  raise warning 'care_check_oil falhou: %', sqlerrm;
end;
$$;
revoke execute on function public.care_check_oil(uuid) from public, anon, authenticated;

create or replace function public.care_after_mileage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.care_check_oil(new.motorcycle_id);
  return null;
end;
$$;
revoke execute on function public.care_after_mileage() from public, anon, authenticated;
drop trigger if exists mileage_records_care on public.mileage_records;
create trigger mileage_records_care after insert on public.mileage_records
  for each row execute function public.care_after_mileage();

-- ---------------------------------------------------------------- usuário (titular atual)
create or replace function public.get_motorcycle_care(p_motorcycle_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_current_owner(p_motorcycle_id) then
    raise exception 'Moto não encontrada.' using errcode = '42501';
  end if;
  return public.care_status(p_motorcycle_id);
end;
$$;

create or replace function public.set_motorcycle_care(p_motorcycle_id uuid, p_routine text, p_interval int, p_enabled boolean default true, p_last_done_km int default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ro public.care_routines;
begin
  if not public.is_current_owner(p_motorcycle_id) then
    raise exception 'Moto não encontrada.' using errcode = '42501';
  end if;
  select * into ro from public.care_routines where code = p_routine;
  if not found then raise exception 'Rotina desconhecida.' using errcode = '22023'; end if;
  if p_interval is not null and (p_interval < ro.min_interval or p_interval > ro.max_interval) then
    raise exception 'Intervalo entre % e % %.', ro.min_interval, ro.max_interval,
      case ro.trigger_type when 'km' then 'km' else 'dias' end using errcode = '22023';
  end if;
  if p_routine = 'chain_check' and p_interval is not null and p_interval not in (7, 15) then
    raise exception 'Escolha a cada 7 ou 15 dias.' using errcode = '22023';
  end if;
  if p_last_done_km is not null and (p_last_done_km < 0 or p_last_done_km > coalesce(public.motorcycle_current_km(p_motorcycle_id), 2000000)) then
    raise exception 'O km da última troca não pode passar do km atual da moto.' using errcode = '22023';
  end if;
  insert into public.motorcycle_care (motorcycle_id, routine_code, interval_value, enabled, last_done_km, updated_by)
  values (p_motorcycle_id, p_routine, p_interval, coalesce(p_enabled, true), p_last_done_km, auth.uid())
  on conflict (motorcycle_id, routine_code) do update set
    interval_value = coalesce(excluded.interval_value, public.motorcycle_care.interval_value),
    enabled = excluded.enabled,
    last_done_km = coalesce(excluded.last_done_km, public.motorcycle_care.last_done_km),
    updated_by = auth.uid(), updated_at = now();
  if p_routine = 'oil_change' then perform public.care_check_oil(p_motorcycle_id); end if;
  return public.care_status(p_motorcycle_id);
end;
$$;

-- "Feito" (corrente conferida; óleo trocado sem registrar serviço).
create or replace function public.mark_care_done(p_motorcycle_id uuid, p_routine text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_current_owner(p_motorcycle_id) then
    raise exception 'Moto não encontrada.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.care_routines where code = p_routine) then
    raise exception 'Rotina desconhecida.' using errcode = '22023';
  end if;
  insert into public.motorcycle_care (motorcycle_id, routine_code, last_done_at, last_done_km, updated_by)
  values (p_motorcycle_id, p_routine, now(), case when p_routine = 'oil_change' then public.motorcycle_current_km(p_motorcycle_id) end, auth.uid())
  on conflict (motorcycle_id, routine_code) do update set
    last_done_at = now(),
    last_done_km = case when p_routine = 'oil_change' then public.motorcycle_current_km(p_motorcycle_id) else public.motorcycle_care.last_done_km end,
    updated_by = auth.uid(), updated_at = now();
  return public.care_status(p_motorcycle_id);
end;
$$;

revoke execute on function public.get_motorcycle_care(uuid) from public, anon;
revoke execute on function public.set_motorcycle_care(uuid, text, int, boolean, int) from public, anon;
revoke execute on function public.mark_care_done(uuid, text) from public, anon;
grant execute on function public.get_motorcycle_care(uuid) to authenticated;
grant execute on function public.set_motorcycle_care(uuid, text, int, boolean, int) to authenticated;
grant execute on function public.mark_care_done(uuid, text) to authenticated;

-- ---------------------------------------------------------------- check-up semanal (pg_cron)
create or replace function public.system_weekly_checkup()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v jsonb;
  v_lines text[];
  v_days int;
  v_sent int := 0;
  v_week text := to_char(now() at time zone 'America/Sao_Paulo', 'IYYY-IW');
begin
  for r in
    select m.id, m.brand || ' ' || m.model as name, o.owner_user_id
      from public.motorcycles m
      join public.motorcycle_ownerships o on o.motorcycle_id = m.id and o.ended_at is null
  loop
    v := public.care_status(r.id);
    v_lines := '{}';
    v_days := case when v ->> 'km_updated_at' is null then null
                   else (current_date - ((v ->> 'km_updated_at')::timestamptz at time zone 'America/Sao_Paulo')::date) end;
    if v_days is null or v_days >= 6 then
      v_lines := v_lines || ('Atualize o km' || coalesce(' (último: ' || to_char((v ->> 'current_km')::int, 'FM999G999G999') || ' km, há ' || v_days || ' dias)', ''));
    end if;
    if (v -> 'oil' ->> 'enabled')::boolean then
      if not (v -> 'oil' ->> 'configured')::boolean then
        v_lines := v_lines || 'Defina de quantos em quantos km troca o óleo'::text;
      elsif v -> 'oil' ->> 'status' = 'due' then
        v_lines := v_lines || ('Troca de óleo vencida há ' || abs((v -> 'oil' ->> 'km_left')::int) || ' km');
      elsif v -> 'oil' ->> 'status' = 'soon' then
        v_lines := v_lines || ('Faltam ' || (v -> 'oil' ->> 'km_left') || ' km para trocar o óleo');
      end if;
    end if;
    if (v -> 'chain' ->> 'due')::boolean then
      v_lines := v_lines || 'Confira a folga e lubrifique a corrente'::text;
    end if;
    continue when cardinality(v_lines) = 0;
    perform public.notify(r.owner_user_id, 'care_checkup', 'Check-up da semana: ' || r.name,
      array_to_string(v_lines, ' · ') || '.', '/painel/motos/' || r.id || '/checkup',
      'checkup:' || r.id || ':' || v_week);
    v_sent := v_sent + 1;
  end loop;
  return jsonb_build_object('sent', v_sent);
end;
$$;
revoke execute on function public.system_weekly_checkup() from public, anon, authenticated;
grant execute on function public.system_weekly_checkup() to service_role;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'moto-passaporte-weekly-checkup';
  -- Sábado às 10h em Brasília (13h UTC; sem horário de verão).
  perform cron.schedule('moto-passaporte-weekly-checkup', '0 13 * * 6', 'select public.system_weekly_checkup()');
end $$;

-- Preferências: os novos tipos (ligados no celular por padrão).
create or replace function public.get_my_notification_preferences()
returns table (kind text, optional boolean, in_app boolean, email boolean, push boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select k.kind, public.notification_kind_optional(k.kind), coalesce(p.in_app, true), coalesce(p.email, false),
         coalesce(p.push, public.notification_push_default(k.kind))
    from unnest(array['care_checkup', 'oil_change', 'workshop_access_request', 'workshop_access_decided', 'workshop_access_revoked',
                      'workshop_service', 'transfer_received', 'transfer_decided', 'reminder_due', 'subscription_ending',
                      'payment_approved', 'payment_failed', 'storage_limit', 'claim_decided', 'ownership_notice', 'admin_notice']) k(kind)
    left join public.notification_preferences p on p.user_id = auth.uid() and p.kind = k.kind;
$$;
