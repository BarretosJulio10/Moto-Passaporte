-- =============================================================================
-- PRD 2.2 — Controle de Gastos, Fase A: ver gastos (ADR-050)
-- Cálculo no banco sobre o histórico técnico (sem coluna nova): soma só serviços vigentes (não anulados e não
-- substituídos por correção) com valor informado; data do serviço; horário de Brasília. Totais simples para todos;
-- análise (mês a mês, categorias, oficinas, comparação) com o benefício spending_insights (Premium e boas-vindas).
-- =============================================================================

-- Benefício novo nos planos ------------------------------------------------------
alter table public.subscription_plans drop constraint if exists subscription_plans_entitlements_check;
alter table public.subscription_plans add constraint subscription_plans_entitlements_check
  check (entitlements <@ array['pdf_reports', 'maintenance_reminders', 'spending_insights']::text[]);
update public.subscription_plans set entitlements = entitlements || array['spending_insights']
 where kind = 'premium' and not ('spending_insights' = any (entitlements));
-- Assinaturas e períodos pagos guardam uma cópia dos benefícios do dia da compra: benefício novo do Premium entra
-- também para quem já é Premium (só acrescenta; nada é retirado).
update public.subscriptions set entitlements = entitlements || array['spending_insights']
 where 'pdf_reports' = any (entitlements) and not ('spending_insights' = any (entitlements));
update public.premium_passes set entitlements = entitlements || array['spending_insights']
 where 'pdf_reports' = any (entitlements) and not ('spending_insights' = any (entitlements));

-- Início da posse para o corte "desde a compra": só existe quando a moto veio de outro dono (há posse anterior).
-- Quem cadastrou a moto e lançou o próprio histórico antigo vê tudo.
create or replace function public.sp_ownership_start(p_ownership uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select case when exists (select 1 from public.motorcycle_ownerships p
                            where p.motorcycle_id = o.motorcycle_id and p.id <> o.id and p.started_at <= o.started_at)
              then coalesce(o.acquisition_date, (o.started_at at time zone 'America/Sao_Paulo')::date) end
    from public.motorcycle_ownerships o where o.id = p_ownership;
$$;
revoke execute on function public.sp_ownership_start(uuid) from public, anon, authenticated;

-- Serviços que contam no gasto de uma moto do usuário ------------------------------
-- Vigentes = não anulados e sem correção posterior; escopo 'ownership' = desde que a moto é do usuário.
create or replace function public.sp_records(p_user uuid, p_motorcycle uuid, p_scope text)
returns table (id uuid, motorcycle_id uuid, category text, title text, service_date date, workshop_name text,
               source_type text, value_cents bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.motorcycle_id, r.category::text, r.title, r.service_date, nullif(btrim(r.workshop_name), ''),
         r.source_type::text, r.service_value_cents
    from public.motorcycle_ownerships o
    join public.maintenance_records r on r.motorcycle_id = o.motorcycle_id
   where o.owner_user_id = p_user and o.ended_at is null
     and (p_motorcycle is null or o.motorcycle_id = p_motorcycle)
     and not r.is_void
     and not exists (select 1 from public.maintenance_records c where c.corrects_record_id = r.id)
     and (p_scope = 'all' or r.service_date >= coalesce(public.sp_ownership_start(o.id), r.service_date));
$$;
revoke execute on function public.sp_records(uuid, uuid, text) from public, anon, authenticated;

-- Painel de gastos (RF-01 a RF-05) ---------------------------------------------------
create or replace function public.get_spending_summary(
  p_motorcycle uuid,
  p_from date default null,
  p_to date default null,
  p_scope text default 'ownership',
  p_category text default null,
  p_workshop text default null,
  p_source text default null,
  p_compare boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
        v_today date := (now() at time zone 'America/Sao_Paulo')::date;
        v_entitled boolean;
        v_start date;
        v_from date;
        v_to date;
        v_days int;
        v_total bigint;
        v_count int;
        v_missing int;
        v_res jsonb;
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  if p_scope not in ('ownership', 'all') then raise exception 'Escopo inválido.' using errcode = '22023'; end if;
  if p_motorcycle is not null and not public.is_current_owner(p_motorcycle) then
    raise exception 'Moto não encontrada na sua conta.' using errcode = '42501';
  end if;
  v_entitled := public.user_has_entitlement(v_uid, 'spending_insights');

  select min(public.sp_ownership_start(o.id)) into v_start
    from public.motorcycle_ownerships o
   where o.owner_user_id = v_uid and o.ended_at is null and (p_motorcycle is null or o.motorcycle_id = p_motorcycle);

  create temporary table if not exists sp_f (id uuid, category text, service_date date, workshop_name text,
                                             source_type text, value_cents bigint) on commit drop;
  delete from sp_f;
  insert into sp_f
  select r.id, r.category, r.service_date, r.workshop_name, r.source_type, r.value_cents
    from public.sp_records(v_uid, p_motorcycle, p_scope) r
   where (p_category is null or r.category = p_category)
     and (p_workshop is null or (p_workshop = '' and r.workshop_name is null) or r.workshop_name = p_workshop)
     and (p_source is null or r.source_type = p_source);

  v_from := coalesce(p_from, (select min(service_date) from sp_f), v_today);
  -- Limite de cima: o maior entre hoje em Brasília e a data do servidor (o registro aceita a data do servidor).
  v_to := least(coalesce(p_to, greatest(v_today, current_date)), greatest(v_today, current_date));
  if v_from > v_to then v_from := v_to; end if;
  if v_to - v_from > 3700 then raise exception 'Escolha um período de até 10 anos.' using errcode = '22023'; end if;
  v_days := greatest(1, v_to - v_from + 1);

  select coalesce(sum(value_cents), 0), count(*) filter (where value_cents is not null), count(*) filter (where value_cents is null)
    into v_total, v_count, v_missing
    from sp_f where service_date between v_from and v_to;

  v_res := jsonb_build_object(
    'entitled', v_entitled, 'scope', p_scope, 'ownership_start', v_start, 'from', v_from, 'to', v_to,
    'total_cents', v_total, 'entries', v_count, 'missing_values', v_missing,
    'monthly_average_cents', case when v_count > 0 then round(v_total * 30.4375 / v_days) end,
    'filters', jsonb_build_object(
      'categories', coalesce((select jsonb_agg(distinct category) from sp_f), '[]'::jsonb),
      'workshops', coalesce((select jsonb_agg(distinct workshop_name) from sp_f where workshop_name is not null), '[]'::jsonb)));

  if not v_entitled then
    return v_res;
  end if;

  return v_res || jsonb_build_object(
    'months', (select coalesce(jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'),
                  'cents', coalesce((select sum(value_cents) from sp_f where date_trunc('month', service_date) = m and service_date between v_from and v_to), 0),
                  'count', (select count(*) from sp_f where date_trunc('month', service_date) = m and service_date between v_from and v_to and value_cents is not null),
                  'previous_cents', case when p_compare then coalesce((select sum(value_cents) from sp_f
                                      where date_trunc('month', service_date) = m - interval '1 year'), 0) end)
                  order by m), '[]'::jsonb)
                 from generate_series(date_trunc('month', v_from::timestamp), date_trunc('month', v_to::timestamp), interval '1 month') m),
    'by_category', (select coalesce(jsonb_agg(jsonb_build_object('category', category, 'cents', cents, 'count', n) order by cents desc, category), '[]'::jsonb)
                      from (select category, sum(value_cents) as cents, count(*) as n from sp_f
                             where service_date between v_from and v_to and value_cents is not null group by category) x),
    'by_workshop', (select coalesce(jsonb_agg(jsonb_build_object('workshop', workshop_name, 'cents', cents, 'count', n) order by cents desc, workshop_name nulls last), '[]'::jsonb)
                      from (select workshop_name, sum(value_cents) as cents, count(*) as n from sp_f
                             where service_date between v_from and v_to and value_cents is not null group by workshop_name) x),
    'missing', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'service_date', f.service_date,
                   'title', (select title from public.maintenance_records where id = f.id)) order by f.service_date desc), '[]'::jsonb)
                  from (select * from sp_f where value_cents is null and service_date between v_from and v_to order by service_date desc limit 20) f));
end;
$$;

-- Cartões "Gastos este mês / este ano" (RF-10): para todos os planos -------------------------
create or replace function public.get_spending_snapshot(p_motorcycle uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
        v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  if p_motorcycle is not null and not public.is_current_owner(p_motorcycle) then
    raise exception 'Moto não encontrada na sua conta.' using errcode = '42501';
  end if;
  return (select jsonb_build_object(
      'month_cents', coalesce(sum(value_cents) filter (where service_date >= date_trunc('month', v_today)::date and service_date <= greatest(v_today, current_date)), 0),
      'year_cents', coalesce(sum(value_cents) filter (where service_date >= date_trunc('year', v_today)::date and service_date <= greatest(v_today, current_date)), 0),
      'year_entries', count(*) filter (where value_cents is not null and service_date >= date_trunc('year', v_today)::date and service_date <= greatest(v_today, current_date)),
      'year_missing', count(*) filter (where value_cents is null and service_date >= date_trunc('year', v_today)::date and service_date <= greatest(v_today, current_date)),
      'entitled', public.user_has_entitlement(v_uid, 'spending_insights'))
    from public.sp_records(v_uid, p_motorcycle, 'ownership'));
end;
$$;

revoke execute on function public.get_spending_summary(uuid, date, date, text, text, text, text, boolean) from public, anon;
grant execute on function public.get_spending_summary(uuid, date, date, text, text, text, text, boolean) to authenticated;
revoke execute on function public.get_spending_snapshot(uuid) from public, anon;
grant execute on function public.get_spending_snapshot(uuid) to authenticated;
