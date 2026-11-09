-- Reversão de 20261109003133_spending_phase_b (ADR-051).
-- ATENÇÃO: apaga as despesas avulsas. Antes, apagar os arquivos do bucket expense-receipts pelo painel/API do Storage.
drop function if exists public.get_spending_entries(uuid, date, date, text, text, text, text, text, integer);
drop function if exists public.get_spending_summary(uuid, date, date, text, text, text, text, boolean, text);
drop function if exists public.get_spending_snapshot(uuid);
drop function if exists public.sp_km(uuid, date, date);
drop function if exists public.sp_entries(uuid, uuid, text);
drop function if exists public.delete_owner_expense(uuid);
drop function if exists public.save_owner_expense(uuid, uuid, text, date, bigint, text, integer, text, text, boolean);
drop policy if exists expense_receipts_insert on storage.objects;
drop policy if exists expense_receipts_select on storage.objects;
drop policy if exists expense_receipts_delete on storage.objects;
delete from storage.buckets where id = 'expense-receipts';
drop table if exists public.owner_expenses;
drop function if exists public.audit_owner_expense();
drop type if exists public.expense_category;
delete from public.system_settings where key = 'free_expenses_per_month';
create or replace function public.user_storage_used_bytes(p_user uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum(a.file_size), 0)::bigint
    from public.attachments a
    join public.motorcycle_ownerships o
      on o.motorcycle_id = a.motorcycle_id and o.ended_at is null and o.owner_user_id = p_user
   where a.organization_id is null
     and (a.diary_entry_id is null
          or exists (select 1 from public.motorcycle_diary d where d.id = a.diary_entry_id and d.author_id = p_user));
$$;
create or replace function public.get_storage_usage()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'used_bytes', coalesce((
      select sum(a.file_size)
      from public.attachments a
      join public.motorcycle_ownerships o
        on o.motorcycle_id = a.motorcycle_id and o.ended_at is null and o.owner_user_id = auth.uid()
      where a.organization_id is null
        and (a.diary_entry_id is null
             or exists (select 1 from public.motorcycle_diary d where d.id = a.diary_entry_id and d.author_id = auth.uid()))
    ), 0),
    'quota_bytes', public.user_storage_quota_mb(auth.uid())::bigint * 1048576,
    'max_file_bytes', coalesce((select (value #>> '{}')::bigint from public.system_settings where key = 'attachment_max_file_mb'), 10) * 1048576
  );
$$;

-- Funções da Fase A:
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
