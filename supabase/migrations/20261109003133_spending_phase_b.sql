-- =============================================================================
-- Moto Passaporte — PRD 2.2 Fase B: despesas avulsas, custo por km, projeção e
-- todas as motos (ADR-051).
-- Despesa avulsa é pessoal: fica com quem lançou, nunca entra no histórico técnico,
-- não passa na transferência, não aparece para oficina, comprador ou link público.
-- Comprovante em bucket próprio (expense-receipts/<usuário>/<arquivo>), apagável,
-- conta na cota do plano.
-- Reversão: supabase/rollback/<versão>_spending_phase_b.down.sql
-- =============================================================================

create type public.expense_category as enum
  ('fuel', 'insurance', 'taxes_license', 'fine', 'parking_toll', 'gear', 'washing', 'financing', 'expense_other');

create table public.owner_expenses (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  motorcycle_id  uuid not null references public.motorcycles (id) on delete cascade,
  category       public.expense_category not null,
  description    text check (description is null or char_length(description) between 1 and 200),
  value_cents    bigint not null check (value_cents between 1 and 100000000),
  expense_date   date not null,
  mileage        integer check (mileage is null or mileage between 0 and 2000000),
  receipt_path   text unique check (receipt_path is null or receipt_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$'),
  receipt_name   text check (receipt_name is null or char_length(receipt_name) between 1 and 200),
  receipt_mime   text,
  receipt_size   bigint,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
comment on table public.owner_expenses is
  'Despesas avulsas do dono (combustível, seguro, IPVA…). Pessoais: só quem lançou vê; fora do histórico técnico e da transferência (PRD 2.2, ADR-051).';
create index owner_expenses_user_idx on public.owner_expenses (user_id, motorcycle_id, expense_date) where deleted_at is null;
create index owner_expenses_moto_idx on public.owner_expenses (motorcycle_id);

alter table public.owner_expenses enable row level security;
create policy owner_expenses_select on public.owner_expenses
  for select to authenticated using (user_id = auth.uid() and deleted_at is null);
-- Sem políticas de escrita: grava e apaga só pelas funções abaixo.
revoke all on public.owner_expenses from anon;
revoke insert, update, delete, truncate, references, trigger on public.owner_expenses from authenticated;
grant select on public.owner_expenses to authenticated;

-- Auditoria só com metadados (nunca descrição nem comprovante).
create or replace function public.audit_owner_expense()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare r public.owner_expenses := coalesce(new, old);
begin
  insert into public.audit_logs (actor_user_id, motorcycle_id, entity_type, entity_id, action, previous_data, new_data)
  values (auth.uid(), r.motorcycle_id, 'owner_expense', r.id::text,
          case when tg_op = 'UPDATE' and new.deleted_at is not null and old.deleted_at is null then 'delete' else lower(tg_op) end,
          case when tg_op <> 'INSERT' then jsonb_build_object('category', old.category, 'expense_date', old.expense_date, 'value_cents', old.value_cents) end,
          case when tg_op <> 'DELETE' then jsonb_build_object('category', new.category, 'expense_date', new.expense_date, 'value_cents', new.value_cents,
                                                              'has_receipt', new.receipt_path is not null) end);
  return r;
end;
$$;
revoke execute on function public.audit_owner_expense() from public, anon, authenticated;
create trigger owner_expenses_audit after insert or update on public.owner_expenses
  for each row execute function public.audit_owner_expense();

-- Limite do gratuito ---------------------------------------------------------------
insert into public.system_settings (key, value, description, is_public)
values ('free_expenses_per_month', '10'::jsonb, 'Despesas avulsas que a conta gratuita pode lançar por mês (Premium: sem limite).', true)
on conflict (key) do nothing;

-- Comprovante: bucket privado; cada pessoa só mexe na própria pasta ------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expense-receipts', 'expense-receipts', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy expense_receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'expense-receipts' and split_part(name, '/', 1) = auth.uid()::text);
create policy expense_receipts_select on storage.objects for select to authenticated
  using (bucket_id = 'expense-receipts' and split_part(name, '/', 1) = auth.uid()::text);
create policy expense_receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'expense-receipts' and split_part(name, '/', 1) = auth.uid()::text);

-- Cota: comprovantes de despesa entram no espaço da conta ----------------------------
create or replace function public.user_storage_used_bytes(p_user uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select (coalesce((
    select sum(a.file_size)
      from public.attachments a
      join public.motorcycle_ownerships o
        on o.motorcycle_id = a.motorcycle_id and o.ended_at is null and o.owner_user_id = p_user
     where a.organization_id is null
       and (a.diary_entry_id is null
            or exists (select 1 from public.motorcycle_diary d where d.id = a.diary_entry_id and d.author_id = p_user))), 0)
   + coalesce((select sum(e.receipt_size) from public.owner_expenses e
                where e.user_id = p_user and e.deleted_at is null and e.receipt_path is not null), 0))::bigint;
$$;

create or replace function public.get_storage_usage()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'used_bytes', public.user_storage_used_bytes(auth.uid()),
    'quota_bytes', public.user_storage_quota_mb(auth.uid())::bigint * 1048576,
    'max_file_bytes', coalesce((select (value #>> '{}')::bigint from public.system_settings where key = 'attachment_max_file_mb'), 10) * 1048576
  );
$$;

-- Gravar despesa (nova ou edição) -----------------------------------------------------
create or replace function public.save_owner_expense(
  p_id uuid,
  p_motorcycle uuid,
  p_category text,
  p_expense_date date,
  p_value_cents bigint,
  p_description text default null,
  p_mileage integer default null,
  p_receipt_path text default null,
  p_receipt_name text default null,
  p_remove_receipt boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
        v_today date := (now() at time zone 'America/Sao_Paulo')::date;
        v_old public.owner_expenses;
        v_size bigint;
        v_mime text;
        v_owner text;
        v_usage jsonb;
        v_limit int;
        v_id uuid;
        v_drop text;
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  if not public.is_current_owner(p_motorcycle) then
    raise exception 'Moto não encontrada na sua conta.' using errcode = '42501';
  end if;
  if p_category is null or not (p_category = any (enum_range(null::public.expense_category)::text[])) then
    raise exception 'Escolha a categoria da despesa.' using errcode = '22023';
  end if;
  if p_value_cents is null or p_value_cents < 1 or p_value_cents > 100000000 then
    raise exception 'Informe um valor entre R$ 0,01 e R$ 1.000.000,00.' using errcode = '22023';
  end if;
  if p_expense_date is null or p_expense_date > greatest(v_today, current_date) or p_expense_date < date '1950-01-01' then
    raise exception 'Informe uma data até hoje.' using errcode = '22023';
  end if;
  if p_mileage is not null and (p_mileage < 0 or p_mileage > 2000000) then
    raise exception 'Quilometragem inválida.' using errcode = '22023';
  end if;

  if p_id is not null then
    select * into v_old from public.owner_expenses where id = p_id and user_id = v_uid and deleted_at is null for update;
    if not found or v_old.motorcycle_id <> p_motorcycle then
      raise exception 'Despesa não encontrada.' using errcode = '42501';
    end if;
  else
    if not public.user_has_entitlement(v_uid, 'spending_insights') then
      v_limit := public.setting_int('free_expenses_per_month', 10);
      if (select count(*) from public.owner_expenses
           where user_id = v_uid and deleted_at is null
             and created_at >= (date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')) >= v_limit then
        raise exception 'No plano gratuito são % despesas por mês. Assine o Premium para lançar sem limite.', v_limit using errcode = 'P0001';
      end if;
    end if;
  end if;

  if p_receipt_path is not null and p_receipt_path is distinct from v_old.receipt_path then
    if split_part(p_receipt_path, '/', 1) <> v_uid::text then
      raise exception 'Arquivo enviado para a pasta errada.' using errcode = '22023';
    end if;
    select (o.metadata ->> 'size')::bigint, o.metadata ->> 'mimetype', coalesce(o.owner_id, o.owner::text)
      into v_size, v_mime, v_owner
      from storage.objects o where o.bucket_id = 'expense-receipts' and o.name = p_receipt_path;
    if not found then raise exception 'Comprovante não encontrado. Envie de novo.' using errcode = '22023'; end if;
    if v_owner is distinct from v_uid::text then raise exception 'Operação não permitida.' using errcode = '42501'; end if;
    if v_mime not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') then
      raise exception 'Tipo de arquivo não permitido. Envie foto (JPG, PNG, WEBP) ou PDF.' using errcode = '22023';
    end if;
    v_usage := public.get_storage_usage();
    if v_size is null or v_size <= 0 or v_size > (v_usage ->> 'max_file_bytes')::bigint then
      raise exception 'Arquivo maior que o permitido.' using errcode = '22023';
    end if;
    if (v_usage ->> 'used_bytes')::bigint - coalesce(v_old.receipt_size, 0) + v_size > (v_usage ->> 'quota_bytes')::bigint then
      raise exception 'O espaço para anexos do seu plano acabou.' using errcode = 'P0001';
    end if;
    v_drop := v_old.receipt_path;
  elsif p_remove_receipt then
    v_drop := v_old.receipt_path;
  end if;

  if p_id is null then
    insert into public.owner_expenses (user_id, motorcycle_id, category, description, value_cents, expense_date, mileage,
                                       receipt_path, receipt_name, receipt_mime, receipt_size)
    values (v_uid, p_motorcycle, p_category::public.expense_category, nullif(btrim(p_description), ''), p_value_cents, p_expense_date, p_mileage,
            p_receipt_path, case when p_receipt_path is not null then left(coalesce(nullif(btrim(p_receipt_name), ''), 'comprovante'), 200) end,
            v_mime, v_size)
    returning id into v_id;
  else
    update public.owner_expenses set
        category = p_category::public.expense_category,
        description = nullif(btrim(p_description), ''),
        value_cents = p_value_cents,
        expense_date = p_expense_date,
        mileage = p_mileage,
        receipt_path = case when p_receipt_path is not null and p_receipt_path is distinct from receipt_path then p_receipt_path
                            when p_remove_receipt then null else receipt_path end,
        receipt_name = case when p_receipt_path is not null and p_receipt_path is distinct from receipt_path
                              then left(coalesce(nullif(btrim(p_receipt_name), ''), 'comprovante'), 200)
                            when p_remove_receipt then null else receipt_name end,
        receipt_mime = case when p_receipt_path is not null and p_receipt_path is distinct from receipt_path then v_mime
                            when p_remove_receipt then null else receipt_mime end,
        receipt_size = case when p_receipt_path is not null and p_receipt_path is distinct from receipt_path then v_size
                            when p_remove_receipt then null else receipt_size end,
        updated_at = now()
     where id = p_id
    returning id into v_id;
  end if;
  -- O site apaga o arquivo antigo (a política de Storage só deixa apagar da própria pasta).
  return jsonb_build_object('id', v_id, 'remove_path', v_drop);
exception when unique_violation then
  raise exception 'Este comprovante já foi usado em outra despesa.' using errcode = 'P0001';
end;
$$;
revoke execute on function public.save_owner_expense(uuid, uuid, text, date, bigint, text, integer, text, text, boolean) from public, anon;
grant execute on function public.save_owner_expense(uuid, uuid, text, date, bigint, text, integer, text, text, boolean) to authenticated;

create or replace function public.delete_owner_expense(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_path text;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  select receipt_path into v_path from public.owner_expenses
   where id = p_id and user_id = auth.uid() and deleted_at is null for update;
  if not found then raise exception 'Despesa não encontrada.' using errcode = '42501'; end if;
  update public.owner_expenses set deleted_at = now(), updated_at = now(),
         receipt_path = null, receipt_name = null, receipt_mime = null, receipt_size = null
   where id = p_id;
  return jsonb_build_object('remove_path', v_path);
end;
$$;
revoke execute on function public.delete_owner_expense(uuid) from public, anon;
grant execute on function public.delete_owner_expense(uuid) to authenticated;

-- Lançamentos que contam no gasto: serviços vigentes + despesas do próprio usuário ----
create or replace function public.sp_entries(p_user uuid, p_motorcycle uuid, p_scope text)
returns table (kind text, id uuid, motorcycle_id uuid, category text, title text, entry_date date, workshop_name text,
               source_type text, value_cents bigint, mileage integer, has_receipt boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select 'service', r.id, r.motorcycle_id, r.category, r.title, r.service_date, r.workshop_name, r.source_type, r.value_cents,
         (select m.mileage from public.maintenance_records m where m.id = r.id), r.source_type = 'document'
    from public.sp_records(p_user, p_motorcycle, p_scope) r
  union all
  select 'expense', e.id, e.motorcycle_id, e.category::text, coalesce(e.description, ''), e.expense_date, null, null, e.value_cents,
         e.mileage, e.receipt_path is not null
    from public.owner_expenses e
    join public.motorcycle_ownerships o on o.motorcycle_id = e.motorcycle_id and o.owner_user_id = p_user and o.ended_at is null
   where e.user_id = p_user and e.deleted_at is null
     and (p_motorcycle is null or e.motorcycle_id = p_motorcycle);
$$;
revoke execute on function public.sp_entries(uuid, uuid, text) from public, anon, authenticated;

-- Km rodados no período (regra 5): maior leitura válida do período menos a última antes do
-- início (ou a primeira do período). Válida = não corrigida depois e não abaixo da anterior.
create or replace function public.sp_km(p_motorcycle uuid, p_from date, p_to date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  with v as (
    select m.mileage, m.recorded_at from public.mileage_records m
     where m.motorcycle_id = p_motorcycle and not coalesce(m.below_previous, false)
       and not exists (select 1 from public.mileage_records c where c.corrects_record_id = m.id)
  ), base as (
    select coalesce(
      (select mileage from v where recorded_at < p_from order by recorded_at desc, mileage desc limit 1),
      (select mileage from v where recorded_at between p_from and p_to order by recorded_at, mileage limit 1)) as km0,
      (select count(*) from v where recorded_at between p_from and p_to)
        + (select count(*) from (select 1 from v where recorded_at < p_from limit 1) x) as n,
      (select max(mileage) from v where recorded_at between p_from and p_to) as km1
  )
  select case when n >= 2 and km1 - km0 >= 100 then km1 - km0 end from base;
$$;
revoke execute on function public.sp_km(uuid, date, date) from public, anon, authenticated;

-- Painel (RF-01 a RF-08). Novo parâmetro p_kind: 'service', 'expense' ou todos.
drop function if exists public.get_spending_summary(uuid, date, date, text, text, text, text, boolean);
create or replace function public.get_spending_summary(
  p_motorcycle uuid,
  p_from date default null,
  p_to date default null,
  p_scope text default 'ownership',
  p_category text default null,
  p_workshop text default null,
  p_source text default null,
  p_compare boolean default false,
  p_kind text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
        v_today date := (now() at time zone 'America/Sao_Paulo')::date;
        v_top date := greatest((now() at time zone 'America/Sao_Paulo')::date, current_date);
        v_entitled boolean;
        v_start date;
        v_from date;
        v_to date;
        v_days int;
        v_total bigint;
        v_count int;
        v_missing int;
        v_km int;
        v_year_total bigint;
        v_year_days int;
        v_res jsonb;
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  if p_scope not in ('ownership', 'all') then raise exception 'Escopo inválido.' using errcode = '22023'; end if;
  if p_kind is not null and p_kind not in ('service', 'expense') then raise exception 'Tipo inválido.' using errcode = '22023'; end if;
  if p_motorcycle is not null and not public.is_current_owner(p_motorcycle) then
    raise exception 'Moto não encontrada na sua conta.' using errcode = '42501';
  end if;
  v_entitled := public.user_has_entitlement(v_uid, 'spending_insights');

  select min(public.sp_ownership_start(o.id)) into v_start
    from public.motorcycle_ownerships o
   where o.owner_user_id = v_uid and o.ended_at is null and (p_motorcycle is null or o.motorcycle_id = p_motorcycle);

  create temporary table if not exists sp_g (kind text, id uuid, motorcycle_id uuid, category text, entry_date date,
                                             workshop_name text, value_cents bigint) on commit drop;
  delete from sp_g;
  insert into sp_g
  select e.kind, e.id, e.motorcycle_id, e.category, e.entry_date, e.workshop_name, e.value_cents
    from public.sp_entries(v_uid, p_motorcycle, p_scope) e
   where (p_kind is null or e.kind = p_kind)
     and (p_category is null or e.category = p_category)
     and (p_workshop is null or (e.kind = 'service' and ((p_workshop = '' and e.workshop_name is null) or e.workshop_name = p_workshop)))
     and (p_source is null or (e.kind = 'service' and e.source_type = p_source));

  v_from := coalesce(p_from, (select min(entry_date) from sp_g), v_today);
  v_to := least(coalesce(p_to, v_top), v_top);
  if v_from > v_to then v_from := v_to; end if;
  if v_to - v_from > 3700 then raise exception 'Escolha um período de até 10 anos.' using errcode = '22023'; end if;
  v_days := greatest(1, v_to - v_from + 1);

  select coalesce(sum(value_cents), 0), count(*) filter (where value_cents is not null), count(*) filter (where value_cents is null)
    into v_total, v_count, v_missing
    from sp_g where entry_date between v_from and v_to;

  v_res := jsonb_build_object(
    'entitled', v_entitled, 'scope', p_scope, 'ownership_start', v_start, 'from', v_from, 'to', v_to,
    'total_cents', v_total, 'entries', v_count, 'missing_values', v_missing,
    'monthly_average_cents', case when v_count > 0 then round(v_total * 30.4375 / v_days) end,
    'service_cents', coalesce((select sum(value_cents) from sp_g where kind = 'service' and entry_date between v_from and v_to), 0),
    'expense_cents', coalesce((select sum(value_cents) from sp_g where kind = 'expense' and entry_date between v_from and v_to), 0),
    'filters', jsonb_build_object(
      'categories', coalesce((select jsonb_agg(distinct category) from public.sp_entries(v_uid, p_motorcycle, p_scope)), '[]'::jsonb),
      'workshops', coalesce((select jsonb_agg(distinct workshop_name) from public.sp_entries(v_uid, p_motorcycle, p_scope) where workshop_name is not null), '[]'::jsonb)));

  if not v_entitled then
    return v_res;
  end if;

  -- Km e custo por km (regra 5); várias motos: soma das motos com dados suficientes.
  select sum(k) into v_km from (
    select public.sp_km(o.motorcycle_id, v_from, v_to) k
      from public.motorcycle_ownerships o
     where o.owner_user_id = v_uid and o.ended_at is null and (p_motorcycle is null or o.motorcycle_id = p_motorcycle)) x;
  if v_km is not null and v_km < 100 then v_km := null; end if;

  -- Projeção do ano (regra 7): com 90 dias ou mais passados no ano.
  v_year_days := v_today - date_trunc('year', v_today)::date + 1;
  select coalesce(sum(value_cents), 0) into v_year_total
    from sp_g where entry_date between date_trunc('year', v_today)::date and v_top;

  return v_res || jsonb_build_object(
    'km', v_km,
    'cost_per_km_cents', case when v_km is not null then round(v_total::numeric / v_km, 2) end,
    'year_projection_cents', case when v_year_days >= 90 and v_year_total > 0
                                  then round(v_year_total::numeric / v_year_days
                                             * (((date_trunc('year', v_today) + interval '1 year')::date) - date_trunc('year', v_today)::date)) end,
    'year_to_date_cents', v_year_total,
    'months', (select coalesce(jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'),
                  'cents', coalesce((select sum(value_cents) from sp_g where date_trunc('month', entry_date) = m and entry_date between v_from and v_to), 0),
                  'count', (select count(*) from sp_g where date_trunc('month', entry_date) = m and entry_date between v_from and v_to and value_cents is not null),
                  'previous_cents', case when p_compare then coalesce((select sum(value_cents) from sp_g
                                      where date_trunc('month', entry_date) = m - interval '1 year'), 0) end)
                  order by m), '[]'::jsonb)
                 from generate_series(date_trunc('month', v_from::timestamp), date_trunc('month', v_to::timestamp), interval '1 month') m),
    'by_category', (select coalesce(jsonb_agg(jsonb_build_object('category', category, 'kind', kind, 'cents', cents, 'count', n) order by cents desc, category), '[]'::jsonb)
                      from (select category, kind, sum(value_cents) as cents, count(*) as n from sp_g
                             where entry_date between v_from and v_to and value_cents is not null group by category, kind) x),
    'by_workshop', (select coalesce(jsonb_agg(jsonb_build_object('workshop', workshop_name, 'cents', cents, 'count', n) order by cents desc, workshop_name nulls last), '[]'::jsonb)
                      from (select workshop_name, sum(value_cents) as cents, count(*) as n from sp_g
                             where kind = 'service' and entry_date between v_from and v_to and value_cents is not null group by workshop_name) x),
    'by_motorcycle', case when p_motorcycle is null then
                      (select coalesce(jsonb_agg(jsonb_build_object('motorcycle_id', m.id, 'label', m.brand || ' ' || m.model,
                                 'cents', coalesce(t.cents, 0), 'count', coalesce(t.n, 0)) order by coalesce(t.cents, 0) desc, m.brand, m.model), '[]'::jsonb)
                         from public.motorcycle_ownerships o
                         join public.motorcycles m on m.id = o.motorcycle_id
                         left join (select motorcycle_id, sum(value_cents) cents, count(*) filter (where value_cents is not null) n
                                      from sp_g where entry_date between v_from and v_to group by motorcycle_id) t on t.motorcycle_id = m.id
                        where o.owner_user_id = v_uid and o.ended_at is null) end,
    'missing', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'motorcycle_id', f.motorcycle_id, 'service_date', f.entry_date,
                   'title', (select title from public.maintenance_records where id = f.id)) order by f.entry_date desc), '[]'::jsonb)
                  from (select * from sp_g where value_cents is null and entry_date between v_from and v_to order by entry_date desc limit 20) f));
end;
$$;
revoke execute on function public.get_spending_summary(uuid, date, date, text, text, text, text, boolean, text) from public, anon;
grant execute on function public.get_spending_summary(uuid, date, date, text, text, text, text, boolean, text) to authenticated;

-- Lançamentos do recorte (lista da tela; base do CSV na Fase C). Todos os planos: são os dados da própria pessoa.
create or replace function public.get_spending_entries(
  p_motorcycle uuid,
  p_from date default null,
  p_to date default null,
  p_scope text default 'ownership',
  p_category text default null,
  p_workshop text default null,
  p_source text default null,
  p_kind text default null,
  p_limit integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
        v_top date := greatest((now() at time zone 'America/Sao_Paulo')::date, current_date);
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  if p_scope not in ('ownership', 'all') then raise exception 'Escopo inválido.' using errcode = '22023'; end if;
  if p_motorcycle is not null and not public.is_current_owner(p_motorcycle) then
    raise exception 'Moto não encontrada na sua conta.' using errcode = '42501';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
             'kind', e.kind, 'id', e.id, 'motorcycle_id', e.motorcycle_id, 'category', e.category, 'title', e.title,
             'date', e.entry_date, 'workshop_name', e.workshop_name, 'mileage', e.mileage, 'value_cents', e.value_cents,
             'has_receipt', e.has_receipt,
             'receipt_path', case when e.kind = 'expense' then (select x.receipt_path from public.owner_expenses x where x.id = e.id) end,
             'receipt_name', case when e.kind = 'expense' then (select x.receipt_name from public.owner_expenses x where x.id = e.id) end)
           order by e.entry_date desc, e.kind, e.id), '[]'::jsonb)
    from (select * from public.sp_entries(v_uid, p_motorcycle, p_scope) e
           where (p_kind is null or e.kind = p_kind)
             and (p_category is null or e.category = p_category)
             and (p_workshop is null or (e.kind = 'service' and ((p_workshop = '' and e.workshop_name is null) or e.workshop_name = p_workshop)))
             and (p_source is null or (e.kind = 'service' and e.source_type = p_source))
             and (p_from is null or e.entry_date >= p_from)
             and e.entry_date <= least(coalesce(p_to, v_top), v_top)
           order by e.entry_date desc
           limit greatest(1, least(coalesce(p_limit, 200), 2000))) e);
end;
$$;
revoke execute on function public.get_spending_entries(uuid, date, date, text, text, text, text, text, integer) from public, anon;
grant execute on function public.get_spending_entries(uuid, date, date, text, text, text, text, text, integer) to authenticated;

-- Cartões (RF-10): agora com as despesas avulsas; inclui quantas despesas o gratuito ainda pode lançar.
create or replace function public.get_spending_snapshot(p_motorcycle uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
        v_today date := (now() at time zone 'America/Sao_Paulo')::date;
        v_top date := greatest((now() at time zone 'America/Sao_Paulo')::date, current_date);
        v_entitled boolean;
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  if p_motorcycle is not null and not public.is_current_owner(p_motorcycle) then
    raise exception 'Moto não encontrada na sua conta.' using errcode = '42501';
  end if;
  v_entitled := public.user_has_entitlement(v_uid, 'spending_insights');
  return (select jsonb_build_object(
      'month_cents', coalesce(sum(value_cents) filter (where entry_date >= date_trunc('month', v_today)::date and entry_date <= v_top), 0),
      'year_cents', coalesce(sum(value_cents) filter (where entry_date >= date_trunc('year', v_today)::date and entry_date <= v_top), 0),
      'year_entries', count(*) filter (where value_cents is not null and entry_date >= date_trunc('year', v_today)::date and entry_date <= v_top),
      'year_missing', count(*) filter (where value_cents is null and entry_date >= date_trunc('year', v_today)::date and entry_date <= v_top),
      'entitled', v_entitled,
      'expenses_left_this_month', case when v_entitled then null else greatest(0, public.setting_int('free_expenses_per_month', 10) - (
          select count(*)::int from public.owner_expenses x
           where x.user_id = v_uid and x.deleted_at is null
             and x.created_at >= (date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'))) end)
    from public.sp_entries(v_uid, p_motorcycle, 'ownership'));
end;
$$;
revoke execute on function public.get_spending_snapshot(uuid) from public, anon;
grant execute on function public.get_spending_snapshot(uuid) to authenticated;
