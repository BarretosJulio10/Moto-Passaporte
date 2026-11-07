-- =============================================================================
-- Fase 5.4 — Benefícios Premium configuráveis (PRD 4.3, 5.8, 5.9, 11; ADR-021)
-- - subscription_plans.entitlements: recursos liberados ('pdf_reports', 'maintenance_reminders').
-- - subscription_plans.max_share_links: links de compartilhamento ativos por moto (avançado = mais links).
-- - Assinaturas guardam esses benefícios contratados (PRD 8.5).
-- - maintenance_reminders: lembretes por km, intervalo de meses ou data (PRD 5.8).
-- - motorcycle_reports: registro de cada relatório gerado (PRD 5.9; métricas PRD 863).
-- Rollback: restaurar get_public_plans, get_my_plan, user_plan,
--   billing_prepare_subscription e create_passport_share das migrações anteriores;
--   remover as colunas e tabelas novas.
-- =============================================================================

alter table public.subscription_plans
  add column entitlements text[] not null default '{}'
    check (entitlements <@ array['pdf_reports', 'maintenance_reminders']::text[]),
  add column max_share_links int not null default 3 check (max_share_links between 1 and 50);

alter table public.subscriptions
  add column entitlements text[] not null default '{}',
  add column max_share_links int not null default 3;

update public.subscription_plans set max_share_links = 3 where kind = 'free';
update public.subscription_plans
   set entitlements = array['pdf_reports', 'maintenance_reminders'], max_share_links = 10
 where kind = 'premium';

-- -----------------------------------------------------------------------------
-- Plano vigente com benefícios
-- -----------------------------------------------------------------------------

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
    -- Benefícios e limites contratados valem mesmo se o catálogo mudar (PRD 8.5).
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

create or replace function public.user_has_entitlement(p_user uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_key = any((public.user_plan(p_user)).entitlements), false);
$$;

revoke execute on function public.user_has_entitlement(uuid, text) from public, anon, authenticated;

create or replace function public.get_public_plans()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'code', code, 'kind', kind, 'billing_period', billing_period, 'name', name,
    'description', description, 'price_cents', price_cents, 'currency', currency,
    'price_note', price_note, 'max_motorcycles', max_motorcycles,
    'storage_quota_mb', storage_quota_mb, 'features', to_jsonb(features),
    'trial_days', trial_days, 'cancellation_text', cancellation_text,
    'entitlements', to_jsonb(entitlements), 'max_share_links', max_share_links
  ) order by sort_order, price_cents), '[]'::jsonb)
  from public.subscription_plans
  where is_active and is_public;
$$;

create or replace function public.get_my_plan()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  p public.subscription_plans;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  p := public.user_plan(v_uid);
  return jsonb_build_object(
    'code', p.code, 'kind', p.kind, 'name', p.name, 'billing_period', p.billing_period,
    'max_motorcycles', coalesce(p.max_motorcycles, 1),
    'storage_quota_mb', coalesce(p.storage_quota_mb, 100),
    'motorcycles_used', (select count(*) from public.motorcycle_ownerships
                          where owner_user_id = v_uid and ended_at is null),
    'features', to_jsonb(coalesce(p.features, '{}')),
    'entitlements', to_jsonb(coalesce(p.entitlements, '{}')),
    'max_share_links', coalesce(p.max_share_links, 3)
  );
end;
$$;

-- Benefícios e limite de links são editados por função própria (admin_save_plan não muda).
create or replace function public.admin_set_plan_benefits(p_id uuid, p_entitlements text[], p_max_share_links int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ent text[];
begin
  if not public.is_admin() then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct e order by e), '{}') into v_ent from unnest(coalesce(p_entitlements, '{}')) e;
  update public.subscription_plans
     set entitlements = v_ent, max_share_links = coalesce(p_max_share_links, max_share_links)
   where id = p_id and (entitlements is distinct from v_ent or max_share_links is distinct from coalesce(p_max_share_links, max_share_links));
  if not found and not exists (select 1 from public.subscription_plans where id = p_id) then
    raise exception 'Plano não encontrado.' using errcode = 'P0002';
  end if;
exception
  when check_violation then
    raise exception 'Benefícios inválidos: escolha entre os recursos disponíveis; links de 1 a 50.' using errcode = 'P0001';
end;
$$;

revoke execute on function public.admin_set_plan_benefits(uuid, text[], int) from public, anon;
grant execute on function public.admin_set_plan_benefits(uuid, text[], int) to authenticated;

-- Assinatura passa a guardar os benefícios contratados.
create or replace function public.billing_prepare_subscription(p_user uuid, p_plan_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.subscription_plans;
  g public.payment_gateway_settings;
  v_email text;
  v_id uuid;
  v_expired jsonb;
begin
  if coalesce((select (value #>> '{}')::boolean from public.system_settings where key = 'billing_enabled'), false) is not true then
    raise exception 'A contratação ainda não está disponível.' using errcode = 'P0001';
  end if;
  select lower(email) into v_email from auth.users where id = p_user;
  if v_email is null then
    raise exception 'Conta não encontrada.' using errcode = '42501';
  end if;
  select * into p from public.subscription_plans
   where code = p_plan_code and kind = 'premium' and is_active and is_public;
  if not found then
    raise exception 'Plano indisponível.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.subscriptions
             where user_id = p_user and status in ('active', 'past_due', 'paused')) then
    raise exception 'Você já tem uma assinatura em andamento. Cancele a atual antes de contratar outra.' using errcode = 'P0001';
  end if;
  select * into g from public.payment_gateway_settings where provider = 'mercadopago';
  if g.access_token_secret_id is null or g.last_check_ok is not true then
    raise exception 'Pagamentos indisponíveis no momento.' using errcode = 'P0001';
  end if;

  with old as (
    update public.subscriptions set status = 'expired', cancel_reason = 'Nova tentativa de contratação'
     where user_id = p_user and status = 'pending'
     returning provider_subscription_id
  )
  select coalesce(jsonb_agg(provider_subscription_id) filter (where provider_subscription_id is not null), '[]'::jsonb)
    into v_expired from old;

  insert into public.subscriptions
    (user_id, plan_id, plan_code, plan_name, billing_period, price_cents, currency, max_motorcycles,
     storage_quota_mb, environment, provider_account_id, entitlements, max_share_links)
  values
    (p_user, p.id, p.code, p.name, p.billing_period, p.price_cents, p.currency, p.max_motorcycles,
     p.storage_quota_mb, g.environment, g.account_id, p.entitlements, p.max_share_links)
  returning id into v_id;

  return jsonb_build_object(
    'subscription_id', v_id, 'payer_email', v_email, 'plan_name', p.name,
    'billing_period', p.billing_period, 'price_cents', p.price_cents, 'currency', p.currency,
    'trial_days', p.trial_days, 'expired_provider_ids', v_expired
  );
end;
$$;

revoke execute on function public.billing_prepare_subscription(uuid, text) from public, anon, authenticated;
grant execute on function public.billing_prepare_subscription(uuid, text) to service_role;

-- Compartilhamento: limite de links ativos vem do plano (recurso avançado no Premium).
create or replace function public.create_passport_share(
  p_motorcycle_id    uuid,
  p_label            text    default null,
  p_expires_in_days  integer default null,
  p_show_plate       boolean default false,
  p_show_mileage     boolean default true,
  p_show_history     boolean default true,
  p_show_values      boolean default false,
  p_show_attachments boolean default false,
  p_show_diary       boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
  v_id    uuid;
  v_limit int := coalesce((public.user_plan(auth.uid())).max_share_links, 3);
begin
  if not public.is_current_owner(p_motorcycle_id) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  if p_label is not null and char_length(trim(p_label)) > 60 then
    raise exception 'O nome do link pode ter até 60 caracteres.' using errcode = '22023';
  end if;
  if p_expires_in_days is not null and p_expires_in_days not between 1 and 365 then
    raise exception 'Validade entre 1 e 365 dias.' using errcode = '22023';
  end if;
  if (select count(*) from public.passport_shares
       where motorcycle_id = p_motorcycle_id and created_by = auth.uid() and revoked_at is null
         and (expires_at is null or expires_at > now())) >= v_limit then
    raise exception 'Seu plano permite % links ativos por moto. Revogue algum antes de criar outro.', v_limit using errcode = 'P0001';
  end if;

  insert into public.passport_shares
    (motorcycle_id, token, label, show_plate, show_mileage, show_history, show_values, show_attachments, show_diary, expires_at, created_by)
  values
    (p_motorcycle_id, v_token, nullif(trim(p_label), ''),
     coalesce(p_show_plate, false), coalesce(p_show_mileage, true), coalesce(p_show_history, true),
     coalesce(p_show_values, false) and coalesce(p_show_history, true),
     coalesce(p_show_attachments, false) and coalesce(p_show_history, true),
     coalesce(p_show_diary, false),
     case when p_expires_in_days is null then null else now() + make_interval(days => p_expires_in_days) end,
     auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'token', v_token);
end;
$$;

-- -----------------------------------------------------------------------------
-- Lembretes de manutenção (PRD 5.8)
-- -----------------------------------------------------------------------------

create table public.maintenance_reminders (
  id                uuid primary key default gen_random_uuid(),
  motorcycle_id     uuid not null references public.motorcycles (id) on delete cascade,
  owner_user_id     uuid not null references auth.users (id) on delete cascade,
  title             text not null check (char_length(title) between 2 and 80),
  category          public.maintenance_category,
  every_km          int check (every_km between 100 and 100000),
  every_months      int check (every_months between 1 and 60),
  due_date          date,
  base_mileage      int check (base_mileage >= 0),
  base_date         date not null default current_date,
  notes             text check (char_length(notes) <= 300),
  paused            boolean not null default false,
  done_at           timestamptz,
  last_completed_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint maintenance_reminders_rule check (
    (every_km is not null or every_months is not null or due_date is not null)
    and not (due_date is not null and every_months is not null)
  )
);

comment on table public.maintenance_reminders is
  'Lembretes do titular (PRD 5.8): por km, intervalo de meses ou data. Não alteram o histórico; intervalos vêm do usuário.';

create index maintenance_reminders_moto_idx on public.maintenance_reminders (motorcycle_id, owner_user_id);
create index maintenance_reminders_owner_idx on public.maintenance_reminders (owner_user_id);

create trigger maintenance_reminders_updated_at before update on public.maintenance_reminders
  for each row execute function public.set_updated_at();

alter table public.maintenance_reminders enable row level security;
revoke all on public.maintenance_reminders from anon, authenticated;

create table public.motorcycle_reports (
  id            uuid primary key default gen_random_uuid(),
  motorcycle_id uuid not null references public.motorcycles (id) on delete cascade,
  generated_by  uuid references auth.users (id) on delete set null,
  generated_at  timestamptz not null default now()
);

comment on table public.motorcycle_reports is 'Relatórios gerados (PRD 5.9): referência impressa no relatório e métrica de uso.';
create index motorcycle_reports_moto_idx on public.motorcycle_reports (motorcycle_id, generated_at desc);
create index motorcycle_reports_user_idx on public.motorcycle_reports (generated_by);
alter table public.motorcycle_reports enable row level security;
revoke all on public.motorcycle_reports from anon, authenticated;

create or replace function public.motorcycle_current_km(p_motorcycle uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select mr.mileage from public.mileage_records mr
   where mr.motorcycle_id = p_motorcycle
   order by mr.recorded_at desc, mr.created_at desc
   limit 1;
$$;

revoke execute on function public.motorcycle_current_km(uuid) from public, anon, authenticated;

-- Situação calculada de um lembrete.
create or replace function public.reminder_view(r public.maintenance_reminders, p_current_km int)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_next_km int;
  v_next_date date;
  v_km_left int;
  v_days_left int;
  v_status text;
begin
  if r.every_km is not null and r.base_mileage is not null then
    v_next_km := r.base_mileage + r.every_km;
  end if;
  v_next_date := coalesce(r.due_date, case when r.every_months is not null then (r.base_date + make_interval(months => r.every_months))::date end);
  if v_next_km is not null and p_current_km is not null then v_km_left := v_next_km - p_current_km; end if;
  if v_next_date is not null then v_days_left := v_next_date - current_date; end if;

  v_status := case
    when r.done_at is not null then 'done'
    when r.paused then 'paused'
    when coalesce(v_km_left, 1) <= 0 or coalesce(v_days_left, 1) <= 0 then 'due'
    when (v_km_left is not null and v_km_left <= greatest(300, r.every_km / 10))
      or (v_days_left is not null and v_days_left <= 15) then 'soon'
    else 'ok'
  end;

  return jsonb_build_object(
    'id', r.id, 'motorcycle_id', r.motorcycle_id, 'title', r.title, 'category', r.category,
    'every_km', r.every_km, 'every_months', r.every_months, 'due_date', r.due_date,
    'base_mileage', r.base_mileage, 'base_date', r.base_date, 'notes', r.notes, 'paused', r.paused,
    'last_completed_at', r.last_completed_at, 'next_km', v_next_km, 'next_date', v_next_date,
    'km_left', v_km_left, 'days_left', v_days_left, 'current_km', p_current_km, 'status', v_status
  );
end;
$$;

revoke execute on function public.reminder_view(public.maintenance_reminders, int) from public, anon, authenticated;

create or replace function public.require_reminder_access(p_motorcycle uuid, p_needs_premium boolean)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_current_owner(p_motorcycle) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  if p_needs_premium and not public.user_has_entitlement(auth.uid(), 'maintenance_reminders') then
    raise exception 'Lembretes de manutenção fazem parte do Premium.' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public.require_reminder_access(uuid, boolean) from public, anon, authenticated;

create or replace function public.validate_reminder(
  p_title text, p_every_km int, p_every_months int, p_due_date date
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_title is null or char_length(btrim(p_title)) not between 2 and 80 then
    raise exception 'Dê um nome ao lembrete (2 a 80 caracteres).' using errcode = '22023';
  end if;
  if p_every_km is null and p_every_months is null and p_due_date is null then
    raise exception 'Escolha pelo menos um gatilho: quilometragem, intervalo em meses ou data.' using errcode = '22023';
  end if;
  if p_due_date is not null and p_every_months is not null then
    raise exception 'Use data específica ou intervalo em meses, não os dois.' using errcode = '22023';
  end if;
  if p_every_km is not null and p_every_km not between 100 and 100000 then
    raise exception 'Intervalo de quilometragem entre 100 e 100.000 km.' using errcode = '22023';
  end if;
  if p_every_months is not null and p_every_months not between 1 and 60 then
    raise exception 'Intervalo entre 1 e 60 meses.' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.validate_reminder(text, int, int, date) from public, anon, authenticated;

create or replace function public.create_reminder(
  p_motorcycle_id uuid,
  p_title         text,
  p_category      public.maintenance_category default null,
  p_every_km      int default null,
  p_every_months  int default null,
  p_due_date      date default null,
  p_notes         text default null,
  p_base_mileage  int default null,
  p_base_date     date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.require_reminder_access(p_motorcycle_id, true);
  perform public.validate_reminder(p_title, p_every_km, p_every_months, p_due_date);
  if (select count(*) from public.maintenance_reminders
       where motorcycle_id = p_motorcycle_id and owner_user_id = auth.uid() and done_at is null) >= 30 then
    raise exception 'Limite de 30 lembretes por moto.' using errcode = 'P0001';
  end if;
  if p_base_date is not null and p_base_date > current_date then
    raise exception 'A data da última vez não pode estar no futuro.' using errcode = '22023';
  end if;
  insert into public.maintenance_reminders
    (motorcycle_id, owner_user_id, title, category, every_km, every_months, due_date, base_mileage, base_date, notes)
  values
    (p_motorcycle_id, auth.uid(), btrim(p_title), p_category, p_every_km, p_every_months, p_due_date,
     case when p_every_km is not null then coalesce(p_base_mileage, public.motorcycle_current_km(p_motorcycle_id), 0) end,
     coalesce(p_base_date, current_date), nullif(btrim(p_notes), ''))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.update_reminder(
  p_reminder_id  uuid,
  p_title        text,
  p_category     public.maintenance_category,
  p_every_km     int,
  p_every_months int,
  p_due_date     date,
  p_notes        text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.maintenance_reminders;
begin
  select * into r from public.maintenance_reminders where id = p_reminder_id and owner_user_id = auth.uid() for update;
  if not found then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  perform public.require_reminder_access(r.motorcycle_id, true);
  perform public.validate_reminder(p_title, p_every_km, p_every_months, p_due_date);
  update public.maintenance_reminders set
    title = btrim(p_title), category = p_category, every_km = p_every_km, every_months = p_every_months,
    due_date = p_due_date, notes = nullif(btrim(p_notes), ''),
    base_mileage = case when p_every_km is null then null
                        else coalesce(r.base_mileage, public.motorcycle_current_km(r.motorcycle_id), 0) end
  where id = r.id;
end;
$$;

-- Pausar, concluir e excluir continuam permitidos sem Premium (o usuário não perde controle).
create or replace function public.set_reminder_paused(p_reminder_id uuid, p_paused boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.maintenance_reminders;
begin
  select * into r from public.maintenance_reminders where id = p_reminder_id and owner_user_id = auth.uid();
  if not found then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  perform public.require_reminder_access(r.motorcycle_id, false);
  update public.maintenance_reminders set paused = p_paused where id = r.id;
end;
$$;

create or replace function public.complete_reminder(p_reminder_id uuid, p_mileage int default null, p_date date default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.maintenance_reminders;
  v_date date := coalesce(p_date, current_date);
begin
  select * into r from public.maintenance_reminders where id = p_reminder_id and owner_user_id = auth.uid() for update;
  if not found then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  perform public.require_reminder_access(r.motorcycle_id, false);
  if v_date > current_date then
    raise exception 'A data não pode estar no futuro.' using errcode = '22023';
  end if;
  if p_mileage is not null and p_mileage < 0 then
    raise exception 'Quilometragem inválida.' using errcode = '22023';
  end if;
  update public.maintenance_reminders set
    base_mileage = case when every_km is not null
                        then coalesce(p_mileage, public.motorcycle_current_km(r.motorcycle_id), base_mileage) end,
    base_date = v_date,
    last_completed_at = now(),
    paused = false,
    -- Lembrete de data única e sem km: concluído de vez.
    done_at = case when due_date is not null and every_km is null then now() end,
    due_date = case when due_date is not null and every_km is not null then null else due_date end
  where id = r.id;
end;
$$;

create or replace function public.delete_reminder(p_reminder_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.maintenance_reminders;
begin
  select * into r from public.maintenance_reminders where id = p_reminder_id and owner_user_id = auth.uid();
  if not found then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  perform public.require_reminder_access(r.motorcycle_id, false);
  delete from public.maintenance_reminders where id = r.id;
end;
$$;

create or replace function public.get_motorcycle_reminders(p_motorcycle_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_km int;
begin
  perform public.require_reminder_access(p_motorcycle_id, false);
  v_km := public.motorcycle_current_km(p_motorcycle_id);
  return coalesce((
    select jsonb_agg(v order by
             case v ->> 'status' when 'due' then 0 when 'soon' then 1 when 'ok' then 2 when 'paused' then 3 else 4 end,
             v ->> 'next_date' nulls last, (v ->> 'km_left')::int nulls last)
      from (select public.reminder_view(r, v_km) v
              from public.maintenance_reminders r
             where r.motorcycle_id = p_motorcycle_id and r.owner_user_id = auth.uid()
               and (r.done_at is null or r.done_at > now() - interval '30 days')) x
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_my_due_reminders()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(v || jsonb_build_object('motorcycle_name', name)
                            order by case v ->> 'status' when 'due' then 0 else 1 end), '[]'::jsonb)
    from (
      select public.reminder_view(r, public.motorcycle_current_km(r.motorcycle_id)) v,
             m.brand || ' ' || m.model as name
        from public.maintenance_reminders r
        join public.motorcycle_ownerships o
          on o.motorcycle_id = r.motorcycle_id and o.ended_at is null and o.owner_user_id = auth.uid()
        join public.motorcycles m on m.id = r.motorcycle_id
       where r.owner_user_id = auth.uid() and not r.paused and r.done_at is null
    ) x
   where v ->> 'status' in ('due', 'soon');
$$;

do $grants$
declare
  f text;
begin
  foreach f in array array[
    'public.create_reminder(uuid, text, public.maintenance_category, int, int, date, text, int, date)',
    'public.update_reminder(uuid, text, public.maintenance_category, int, int, date, text)',
    'public.set_reminder_paused(uuid, boolean)',
    'public.complete_reminder(uuid, int, date)',
    'public.delete_reminder(uuid)',
    'public.get_motorcycle_reminders(uuid)',
    'public.get_my_due_reminders()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$grants$;

-- -----------------------------------------------------------------------------
-- Relatório (PRD 5.9): o titular com o benefício registra a geração e recebe a referência.
-- Os dados do relatório são os mesmos que o titular já lê no painel.
-- -----------------------------------------------------------------------------

create or replace function public.register_motorcycle_report(p_motorcycle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_at timestamptz;
begin
  if auth.uid() is null or not public.is_current_owner(p_motorcycle_id) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  if not public.user_has_entitlement(auth.uid(), 'pdf_reports') then
    raise exception 'Relatórios em PDF fazem parte do Premium.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.motorcycle_reports
       where generated_by = auth.uid() and generated_at > now() - interval '1 hour') >= 30 then
    raise exception 'Muitos relatórios em pouco tempo. Tente de novo mais tarde.' using errcode = 'P0001';
  end if;
  insert into public.motorcycle_reports (motorcycle_id, generated_by) values (p_motorcycle_id, auth.uid())
  returning id, generated_at into v_id, v_at;
  return jsonb_build_object('reference', upper(left(replace(v_id::text, '-', ''), 10)), 'generated_at', v_at);
end;
$$;

revoke execute on function public.register_motorcycle_report(uuid) from public, anon;
grant execute on function public.register_motorcycle_report(uuid) to authenticated;
