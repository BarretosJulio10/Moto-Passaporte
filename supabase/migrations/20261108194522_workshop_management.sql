-- =============================================================================
-- Moto Passaporte — Migração: módulo Oficina, Fase 4 (PRD 2.1 §11, §12, §14, §15, §16, §24 — gestão)
-- Objetivo: catálogo de peças; recebimentos por OS (sem emissão fiscal); agenda; lembretes;
--           recuperação de clientes com registro de contato (sem envio automático); relatórios;
--           papel "Financeiro" na equipe.
-- Regras: dados financeiros só para quem tem a permissão financeira (§15: privados da oficina;
--         o titular da moto nunca vê); pagamentos não são apagados, só estornados com motivo;
--         nenhuma mensagem é enviada sozinha (§14.2): o sistema prepara, a pessoa envia.
-- Reversão: supabase/rollback/20261108194522_workshop_management.down.sql
-- =============================================================================

alter table public.organization_members
  add column if not exists can_manage_finance boolean not null default false;
comment on column public.organization_members.can_manage_finance is
  'Funcionário vê e registra recebimentos e relatórios financeiros da oficina (PRD 2.1 §16, financeiro).';

create or replace function public.has_org_permission(p_organization uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    join public.organizations o on o.id = m.organization_id and o.status = 'active'
    where m.organization_id = p_organization and m.user_id = auth.uid() and m.status = 'active'
      and (m.role = 'responsible'
           or p_permission = 'member'
           or (p_permission = 'request_access' and m.can_request_access)
           or (p_permission = 'register_services' and m.can_register_services)
           or (p_permission = 'manage_quotes' and m.can_manage_quotes)
           or (p_permission = 'manage_prices' and m.can_manage_prices)
           or (p_permission = 'execute_orders' and m.can_execute_orders)
           or (p_permission = 'manage_finance' and m.can_manage_finance))
  );
$$;

create or replace function public.get_my_workshop_permissions(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare m public.organization_members;
begin
  perform public.wq_assert(p_org, 'member');
  select * into m from public.organization_members
   where organization_id = p_org and user_id = auth.uid() and status = 'active';
  return jsonb_build_object(
    'responsible', m.role = 'responsible',
    'request_access', m.role = 'responsible' or m.can_request_access,
    'register_services', m.role = 'responsible' or m.can_register_services,
    'manage_quotes', m.role = 'responsible' or m.can_manage_quotes,
    'manage_prices', m.role = 'responsible' or m.can_manage_prices,
    'execute_orders', m.role = 'responsible' or m.can_execute_orders,
    'manage_finance', m.role = 'responsible' or m.can_manage_finance,
    'user_id', auth.uid());
end;
$$;

drop function if exists public.get_org_member_extra_permissions(uuid);
create function public.get_org_member_extra_permissions(p_org uuid)
returns table (member_id uuid, can_manage_quotes boolean, can_manage_prices boolean, can_execute_orders boolean, can_manage_finance boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_org_responsible(p_org) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  return query select m.id, m.can_manage_quotes, m.can_manage_prices, m.can_execute_orders, m.can_manage_finance
    from public.organization_members m where m.organization_id = p_org and m.status = 'active';
end;
$$;

drop function if exists public.set_org_member_extra_permissions(uuid, boolean, boolean, boolean);
create function public.set_org_member_extra_permissions(p_member uuid, p_manage_quotes boolean, p_manage_prices boolean,
                                                        p_execute_orders boolean default null, p_manage_finance boolean default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare m public.organization_members;
begin
  select * into m from public.organization_members where id = p_member and status = 'active' for update;
  if not found or not public.is_org_responsible(m.organization_id) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  if m.user_id = auth.uid() then
    raise exception 'Você não pode alterar as próprias permissões.' using errcode = '42501';
  end if;
  update public.organization_members
     set can_manage_quotes = coalesce(p_manage_quotes, can_manage_quotes),
         can_manage_prices = coalesce(p_manage_prices, can_manage_prices),
         can_execute_orders = coalesce(p_execute_orders, can_execute_orders),
         can_manage_finance = coalesce(p_manage_finance, can_manage_finance)
   where id = p_member;
end;
$$;


-- Exclusão de conta (FK "on delete set null") só zera colunas de autoria; as travas de registro
-- permanente aceitam exatamente isso e nada mais (mesmo padrão de protect_attachment).
create or replace function public.wq_only_user_nulled(p_old jsonb, p_new jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select not exists (
    select 1 from jsonb_each(p_new) n
     where n.value is distinct from p_old -> n.key
       and not (n.key in ('created_by', 'actor_user_id', 'executed_by', 'voided_by', 'sent_by', 'discount_set_by', 'completed_by',
                          'delivered_by', 'decided_by', 'recorded_by', 'removed_by', 'linked_by', 'history_published_by',
                          'mechanic_user_id', 'responsible_user_id', 'updated_at')
                and n.value = 'null'::jsonb));
$$;
revoke execute on function public.wq_only_user_nulled(jsonb, jsonb) from public, anon, authenticated;

create or replace function public.wq_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and public.wq_only_user_nulled(to_jsonb(old), to_jsonb(new)) then
    return new;
  end if;
  raise exception 'Registro permanente: não pode ser alterado nem apagado.' using errcode = '42501';
end;
$$;

create or replace function public.wo_protect_item()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_status text;
begin
  if tg_op = 'DELETE' then
    raise exception 'Itens da ordem de serviço não são apagados; marque como não executado.' using errcode = '42501';
  end if;
  if public.wq_only_user_nulled(to_jsonb(old), to_jsonb(new)) then return new; end if;
  if new.source is distinct from old.source or new.quote_id is distinct from old.quote_id
     or new.quote_position is distinct from old.quote_position or new.unit_price_cents is distinct from old.unit_price_cents
     or new.subtotal_cents is distinct from old.subtotal_cents or new.discount_cents is distinct from old.discount_cents
     or new.description is distinct from old.description or new.auth_method is distinct from old.auth_method
     or new.auth_by_name is distinct from old.auth_by_name then
    raise exception 'Origem, autorização e valor do item não podem ser alterados.' using errcode = '42501';
  end if;
  select status into v_status from public.workshop_service_orders where id = new.order_id;
  if v_status in ('completed', 'awaiting_pickup', 'delivered', 'canceled') then
    raise exception 'Ordem de serviço encerrada: os itens não podem mais mudar.' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Tabelas
-- -----------------------------------------------------------------------------
create table public.workshop_parts_catalog (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,
  name              text not null check (char_length(name) between 2 and 120),
  internal_code     text check (internal_code is null or char_length(internal_code) <= 60),
  category          text check (category is null or char_length(category) <= 60),
  manufacturer      text check (manufacturer is null or char_length(manufacturer) <= 80),
  compatible_brand  text check (compatible_brand is null or char_length(compatible_brand) <= 60),
  compatible_models text check (compatible_models is null or char_length(compatible_models) <= 300),
  cost_cents        bigint check (cost_cents is null or cost_cents between 0 and 100000000),
  sale_cents        bigint check (sale_cents is null or sale_cents between 0 and 100000000),
  unit              text not null default 'un' check (unit in ('un', 'par', 'jogo', 'kit', 'l', 'ml', 'm', 'kg', 'g')),
  stock_qty         numeric(12, 3) check (stock_qty is null or stock_qty >= 0),
  notes             text check (notes is null or char_length(notes) <= 500),
  active            boolean not null default true,
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (organization_id, id)
);
comment on table public.workshop_parts_catalog is
  'Catálogo de peças e produtos da oficina (PRD 2.1 §11). stock_qty reservado para controle de estoque futuro (não usado nesta versão).';
comment on column public.workshop_parts_catalog.cost_cents is 'Custo: só para quem mexe em preços; nunca aparece para o cliente.';
create index workshop_parts_catalog_org_idx on public.workshop_parts_catalog (organization_id, active, lower(name));
create unique index workshop_parts_catalog_code_uq on public.workshop_parts_catalog (organization_id, lower(internal_code))
  where internal_code is not null;

create table public.workshop_payments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  order_id        uuid not null,
  amount_cents    bigint not null check (amount_cents between 1 and 100000000),
  method          text not null check (method in ('dinheiro', 'pix', 'debito', 'credito', 'transferencia', 'outro')),
  paid_at         date not null,
  notes           text check (notes is null or char_length(notes) <= 300),
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  voided_at       timestamptz,
  voided_by       uuid references auth.users (id) on delete set null,
  void_reason     text check (void_reason is null or char_length(void_reason) between 3 and 300),
  check ((voided_at is null) = (void_reason is null)),
  foreign key (organization_id, order_id) references public.workshop_service_orders (organization_id, id) on delete restrict
);
comment on table public.workshop_payments is
  'Recebimentos da oficina por OS (PRD 2.1 §15). Controle operacional, sem emissão fiscal. Estorno com motivo; nunca apagado.';
create index workshop_payments_order_idx on public.workshop_payments (order_id);
create index workshop_payments_org_date_idx on public.workshop_payments (organization_id, paid_at) where voided_at is null;

create table public.workshop_appointments (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete restrict,
  customer_id         uuid,
  vehicle_id          uuid,
  contact_name        text check (contact_name is null or char_length(contact_name) between 2 and 120),
  contact_phone       text check (contact_phone is null or contact_phone ~ '^[0-9]{10,13}$'),
  starts_at           timestamptz not null,
  duration_minutes    integer not null default 60 check (duration_minutes between 10 and 1440),
  service_description text not null check (char_length(service_description) between 2 and 300),
  responsible_user_id uuid references auth.users (id) on delete set null,
  status              text not null default 'confirmed' check (status in (
                        'requested', 'confirmed', 'awaiting_arrival', 'in_service', 'done', 'canceled', 'no_show')),
  notes               text check (notes is null or char_length(notes) <= 1000),
  quote_id            uuid,
  order_id            uuid,
  source              text not null default 'equipe' check (source in ('equipe', 'publico')),
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (customer_id is not null or contact_name is not null),
  foreign key (organization_id, customer_id) references public.workshop_customers (organization_id, id) on delete restrict,
  foreign key (organization_id, vehicle_id) references public.workshop_vehicles (organization_id, id) on delete restrict,
  foreign key (organization_id, quote_id) references public.workshop_quotes (organization_id, id) on delete restrict,
  foreign key (organization_id, order_id) references public.workshop_service_orders (organization_id, id) on delete restrict
);
comment on table public.workshop_appointments is
  'Agenda da oficina (PRD 2.1 §12). source=publico reservado para agendamento pelo perfil público (Fase 5).';
create index workshop_appointments_org_time_idx on public.workshop_appointments (organization_id, starts_at);

create table public.workshop_reminders (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  customer_id     uuid not null,
  vehicle_id      uuid,
  order_id        uuid,
  kind            text not null check (kind in ('km', 'date', 'interval', 'revision', 'recommendation')),
  title           text not null check (char_length(title) between 2 and 160),
  due_date        date,
  due_km          integer check (due_km is null or due_km between 0 and 9999999),
  notes           text check (notes is null or char_length(notes) <= 500),
  status          text not null default 'open' check (status in ('open', 'done', 'dismissed')),
  last_contact_at timestamptz,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (due_date is not null or due_km is not null),
  foreign key (organization_id, customer_id) references public.workshop_customers (organization_id, id) on delete restrict,
  foreign key (organization_id, vehicle_id) references public.workshop_vehicles (organization_id, id) on delete restrict,
  foreign key (organization_id, order_id) references public.workshop_service_orders (organization_id, id) on delete restrict
);
comment on table public.workshop_reminders is 'Lembretes de manutenção da oficina para os clientes (PRD 2.1 §14.1). Não envia nada sozinho.';
create index workshop_reminders_org_due_idx on public.workshop_reminders (organization_id, status, due_date);

create table public.workshop_contact_log (
  id              bigint generated always as identity primary key,
  organization_id uuid not null,
  customer_id     uuid not null,
  reason          text not null check (reason in ('quote_followup', 'reminder', 'return', 'pickup', 'other')),
  reference_id    uuid,
  channel         text not null default 'whatsapp' check (channel in ('whatsapp', 'telefone', 'outro')),
  note            text check (note is null or char_length(note) <= 300),
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  foreign key (organization_id, customer_id) references public.workshop_customers (organization_id, id) on delete restrict
);
comment on table public.workshop_contact_log is
  'Contatos preparados pela equipe (PRD 2.1 §4.2 "últimos contatos" e §14.2). Registra a mensagem preparada; não prova envio.';
create index workshop_contact_log_customer_idx on public.workshop_contact_log (organization_id, customer_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['workshop_parts_catalog', 'workshop_appointments', 'workshop_reminders'] loop
    execute format('create trigger %1$s_updated_at before update on public.%1$s for each row execute function public.set_updated_at()', t);
  end loop;
  foreach t in array array['workshop_parts_catalog', 'workshop_payments', 'workshop_appointments', 'workshop_reminders'] loop
    execute format('create trigger %1$s_protect_org before update on public.%1$s for each row execute function public.wq_protect_org()', t);
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$s for each row execute function public.audit_row_change(%2$L, %3$L)',
                   t, '', 'organization_id');
  end loop;
  foreach t in array array['workshop_parts_catalog', 'workshop_payments', 'workshop_appointments', 'workshop_reminders', 'workshop_contact_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;
create policy workshop_parts_catalog_select_member on public.workshop_parts_catalog for select to authenticated
  using (public.has_org_permission(organization_id, 'member'));
create policy workshop_appointments_select_member on public.workshop_appointments for select to authenticated
  using (public.has_org_permission(organization_id, 'member'));
create policy workshop_reminders_select_member on public.workshop_reminders for select to authenticated
  using (public.has_org_permission(organization_id, 'member'));
create policy workshop_contact_log_select_member on public.workshop_contact_log for select to authenticated
  using (public.has_org_permission(organization_id, 'member'));
-- Financeiro: só quem tem a permissão.
create policy workshop_payments_select_finance on public.workshop_payments for select to authenticated
  using (public.has_org_permission(organization_id, 'manage_finance'));

-- Pagamento: só o estorno muda a linha.
create or replace function public.wf_protect_payment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then raise exception 'Recebimentos não são apagados; faça o estorno.' using errcode = '42501'; end if;
  if public.wq_only_user_nulled(to_jsonb(old), to_jsonb(new)) then return new; end if;
  if old.voided_at is not null or new.amount_cents <> old.amount_cents or new.method <> old.method or new.paid_at <> old.paid_at
     or new.order_id <> old.order_id or new.created_at <> old.created_at or new.voided_at is null then
    raise exception 'Recebimento registrado não muda; faça o estorno com motivo.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.wf_protect_payment() from public, anon, authenticated;
create trigger workshop_payments_protect before update or delete on public.workshop_payments
  for each row execute function public.wf_protect_payment();
create trigger workshop_contact_log_immutable before update or delete on public.workshop_contact_log
  for each row execute function public.wq_immutable();

-- -----------------------------------------------------------------------------
-- Peças
-- -----------------------------------------------------------------------------
create or replace function public.workshop_save_part(p_org uuid, p_id uuid, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  perform public.wq_assert(p_org, 'manage_prices');
  if p_id is null then
    insert into public.workshop_parts_catalog (organization_id, name, internal_code, category, manufacturer, compatible_brand,
                                               compatible_models, cost_cents, sale_cents, unit, notes, active, created_by)
    values (p_org, public.wq_txt(p_data, 'name'), public.wq_txt(p_data, 'internal_code'), public.wq_txt(p_data, 'category'),
            public.wq_txt(p_data, 'manufacturer'), public.wq_txt(p_data, 'compatible_brand'), public.wq_txt(p_data, 'compatible_models'),
            nullif(p_data ->> 'cost_cents', '')::bigint, nullif(p_data ->> 'sale_cents', '')::bigint,
            coalesce(public.wq_txt(p_data, 'unit'), 'un'), public.wq_txt(p_data, 'notes'), coalesce((p_data ->> 'active')::boolean, true), auth.uid())
    returning id into v_id;
  else
    update public.workshop_parts_catalog
       set name = public.wq_txt(p_data, 'name'), internal_code = public.wq_txt(p_data, 'internal_code'),
           category = public.wq_txt(p_data, 'category'), manufacturer = public.wq_txt(p_data, 'manufacturer'),
           compatible_brand = public.wq_txt(p_data, 'compatible_brand'), compatible_models = public.wq_txt(p_data, 'compatible_models'),
           cost_cents = nullif(p_data ->> 'cost_cents', '')::bigint, sale_cents = nullif(p_data ->> 'sale_cents', '')::bigint,
           unit = coalesce(public.wq_txt(p_data, 'unit'), unit), notes = public.wq_txt(p_data, 'notes'),
           active = coalesce((p_data ->> 'active')::boolean, active)
     where id = p_id and organization_id = p_org
    returning id into v_id;
    if v_id is null then raise exception 'Peça não encontrada.' using errcode = 'P0002'; end if;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'Já existe uma peça com este código.' using errcode = '23505';
end;
$$;

-- Lista para orçamento e catálogo. Custo só para quem mexe em preços.
create or replace function public.workshop_list_parts(p_org uuid, p_search text default null, p_include_inactive boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_q text := nullif(lower(btrim(coalesce(p_search, ''))), '');
        v_cost boolean;
begin
  perform public.wq_assert(p_org, 'member');
  v_cost := public.has_org_permission(p_org, 'manage_prices');
  return coalesce((
    select jsonb_agg(case when v_cost then to_jsonb(x) else to_jsonb(x) - 'cost_cents' end order by x.active desc, lower(x.name))
      from (select * from public.workshop_parts_catalog p
             where p.organization_id = p_org and (p_include_inactive or p.active)
               and (v_q is null or lower(p.name) like '%' || v_q || '%' or lower(coalesce(p.internal_code, '')) like '%' || v_q || '%'
                    or lower(coalesce(p.manufacturer, '')) like '%' || v_q || '%' or lower(coalesce(p.compatible_models, '')) like '%' || v_q || '%')
             limit 1000) x), '[]'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------
-- Financeiro básico (§15)
-- -----------------------------------------------------------------------------
create or replace function public.workshop_record_payment(p_org uuid, p_order uuid, p_amount_cents bigint, p_method text,
                                                          p_paid_at date default null, p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare o public.workshop_service_orders;
        v_id uuid;
        v_paid bigint;
        v_due bigint;
begin
  perform public.wq_assert(p_org, 'manage_finance');
  select * into o from public.workshop_service_orders where id = p_order and organization_id = p_org for update;
  if not found then raise exception 'Ordem de serviço não encontrada.' using errcode = 'P0002'; end if;
  if o.status = 'canceled' then raise exception 'OS cancelada não recebe pagamento.' using errcode = 'P0001'; end if;
  if coalesce(p_amount_cents, 0) <= 0 then raise exception 'Informe o valor recebido.' using errcode = '22023'; end if;
  if coalesce(p_paid_at, current_date) > current_date then raise exception 'A data do recebimento não pode ser no futuro.' using errcode = '22023'; end if;
  select coalesce(sum(amount_cents), 0) into v_paid from public.workshop_payments where order_id = o.id and voided_at is null;
  v_due := coalesce(o.final_total_cents,
                    (select coalesce(sum(subtotal_cents - discount_cents), 0) from public.workshop_service_order_items
                      where order_id = o.id and status <> 'not_done'));
  if v_paid + p_amount_cents > v_due then
    raise exception 'O valor passa do total da OS (falta receber %).', to_char((v_due - v_paid) / 100.0, 'FM999G999G990D00') using errcode = 'P0001';
  end if;
  insert into public.workshop_payments (organization_id, order_id, amount_cents, method, paid_at, notes, created_by)
  values (p_org, o.id, p_amount_cents, p_method, coalesce(p_paid_at, current_date), nullif(btrim(coalesce(p_notes, '')), ''), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.workshop_void_payment(p_org uuid, p_payment uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.wq_assert(p_org, 'manage_finance');
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Informe o motivo do estorno.' using errcode = '22023'; end if;
  update public.workshop_payments set voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
   where id = p_payment and organization_id = p_org and voided_at is null;
  if not found then raise exception 'Recebimento não encontrado ou já estornado.' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.workshop_order_payments(p_org uuid, p_order uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare o public.workshop_service_orders;
        v_due bigint;
        v_paid bigint;
begin
  perform public.wq_assert(p_org, 'manage_finance');
  select * into o from public.workshop_service_orders where id = p_order and organization_id = p_org;
  if not found then raise exception 'Ordem de serviço não encontrada.' using errcode = 'P0002'; end if;
  v_due := coalesce(o.final_total_cents,
                    (select coalesce(sum(subtotal_cents - discount_cents), 0) from public.workshop_service_order_items
                      where order_id = o.id and status <> 'not_done'));
  select coalesce(sum(amount_cents), 0) into v_paid from public.workshop_payments where order_id = o.id and voided_at is null;
  return jsonb_build_object('due_cents', v_due, 'paid_cents', v_paid, 'pending_cents', greatest(v_due - v_paid, 0),
    'final', o.final_total_cents is not null,
    'payments', coalesce((select jsonb_agg(to_jsonb(p) || jsonb_build_object(
                             'created_by_name', (select full_name from public.profiles where id = p.created_by)) order by p.paid_at, p.created_at)
                            from public.workshop_payments p where p.order_id = o.id), '[]'::jsonb));
end;
$$;

create or replace function public.workshop_finance(p_org uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.wq_assert(p_org, 'manage_finance');
  return jsonb_build_object(
    'received_cents', (select coalesce(sum(amount_cents), 0) from public.workshop_payments
                        where organization_id = p_org and voided_at is null and paid_at between p_from and p_to),
    'by_method', coalesce((select jsonb_object_agg(method, total) from (select method, sum(amount_cents) as total from public.workshop_payments
                            where organization_id = p_org and voided_at is null and paid_at between p_from and p_to group by method) x), '{}'::jsonb),
    'by_day', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'cents', total) order by d) from (
                         select paid_at as d, sum(amount_cents) as total from public.workshop_payments
                          where organization_id = p_org and voided_at is null and paid_at between p_from and p_to group by paid_at) x), '[]'::jsonb),
    'completed_cents', (select coalesce(sum(final_total_cents), 0) from public.workshop_service_orders
                         where organization_id = p_org and completed_at is not null
                           and (completed_at at time zone 'America/Sao_Paulo')::date between p_from and p_to),
    'discounts_cents', (select coalesce(sum(i.discount_cents), 0) from public.workshop_service_order_items i
                          join public.workshop_service_orders o on o.id = i.order_id
                         where o.organization_id = p_org and i.status = 'done' and o.completed_at is not null
                           and (o.completed_at at time zone 'America/Sao_Paulo')::date between p_from and p_to)
                       + (select coalesce(-sum(adjustment_cents) filter (where adjustment_cents < 0), 0) from public.workshop_service_orders
                           where organization_id = p_org and completed_at is not null
                             and (completed_at at time zone 'America/Sao_Paulo')::date between p_from and p_to),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'order_id', p.order_id, 'order_number', o.number,
                            'customer_name', c.full_name, 'amount_cents', p.amount_cents, 'method', p.method, 'paid_at', p.paid_at,
                            'notes', p.notes, 'voided_at', p.voided_at, 'void_reason', p.void_reason) order by p.paid_at desc, p.created_at desc)
                           from public.workshop_payments p
                           join public.workshop_service_orders o on o.id = p.order_id
                           join public.workshop_customers c on c.id = o.customer_id
                          where p.organization_id = p_org and p.paid_at between p_from and p_to), '[]'::jsonb),
    'receivables', coalesce((select jsonb_agg(x order by x ->> 'completed_at') from (
                     select jsonb_build_object('order_id', o.id, 'order_number', o.number, 'customer_id', c.id, 'customer_name', c.full_name,
                              'whatsapp', coalesce(c.whatsapp, c.phone), 'status', o.status, 'completed_at', o.completed_at,
                              'due_cents', o.final_total_cents, 'paid_cents', coalesce(pp.paid, 0),
                              'pending_cents', o.final_total_cents - coalesce(pp.paid, 0)) as x
                       from public.workshop_service_orders o
                       join public.workshop_customers c on c.id = o.customer_id
                       left join lateral (select sum(amount_cents) as paid from public.workshop_payments
                                           where order_id = o.id and voided_at is null) pp on true
                      where o.organization_id = p_org and o.final_total_cents is not null
                        and o.final_total_cents > coalesce(pp.paid, 0)) y), '[]'::jsonb),
    'pending_total_cents', (select coalesce(sum(o.final_total_cents - coalesce((select sum(amount_cents) from public.workshop_payments
                              where order_id = o.id and voided_at is null), 0)), 0)
                              from public.workshop_service_orders o where o.organization_id = p_org and o.final_total_cents is not null));
end;
$$;

-- -----------------------------------------------------------------------------
-- Agenda (§12)
-- -----------------------------------------------------------------------------
create or replace function public.workshop_save_appointment(p_org uuid, p_id uuid, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
        v_cust uuid := nullif(p_data ->> 'customer_id', '')::uuid;
        v_veh uuid := nullif(p_data ->> 'vehicle_id', '')::uuid;
        v_resp uuid := nullif(p_data ->> 'responsible_user_id', '')::uuid;
begin
  perform public.wq_assert(p_org, 'manage_quotes');
  if v_veh is not null and not exists (select 1 from public.workshop_vehicles where id = v_veh and organization_id = p_org
                                         and (v_cust is null or customer_id = v_cust)) then
    raise exception 'A moto não pertence a este cliente.' using errcode = '22023';
  end if;
  if v_resp is not null and not exists (select 1 from public.organization_members where organization_id = p_org and user_id = v_resp and status = 'active') then
    raise exception 'O responsável precisa ser da equipe.' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.workshop_appointments (organization_id, customer_id, vehicle_id, contact_name, contact_phone, starts_at, duration_minutes,
                                              service_description, responsible_user_id, status, notes, created_by)
    values (p_org, v_cust, v_veh, public.wq_txt(p_data, 'contact_name'), public.wq_digits(p_data, 'contact_phone'),
            (p_data ->> 'starts_at')::timestamptz, coalesce(nullif(p_data ->> 'duration_minutes', '')::int, 60),
            public.wq_txt(p_data, 'service_description'), v_resp, coalesce(public.wq_txt(p_data, 'status'), 'confirmed'),
            public.wq_txt(p_data, 'notes'), auth.uid())
    returning id into v_id;
  else
    update public.workshop_appointments
       set customer_id = v_cust, vehicle_id = v_veh, contact_name = public.wq_txt(p_data, 'contact_name'),
           contact_phone = public.wq_digits(p_data, 'contact_phone'), starts_at = (p_data ->> 'starts_at')::timestamptz,
           duration_minutes = coalesce(nullif(p_data ->> 'duration_minutes', '')::int, duration_minutes),
           service_description = public.wq_txt(p_data, 'service_description'), responsible_user_id = v_resp,
           notes = public.wq_txt(p_data, 'notes')
     where id = p_id and organization_id = p_org and status not in ('done', 'canceled', 'no_show')
    returning id into v_id;
    if v_id is null then raise exception 'Agendamento não encontrado ou já encerrado.' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.workshop_set_appointment_status(p_org uuid, p_id uuid, p_status text, p_quote uuid default null, p_order uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.wq_assert(p_org, 'manage_quotes');
  if p_status not in ('requested', 'confirmed', 'awaiting_arrival', 'in_service', 'done', 'canceled', 'no_show') then
    raise exception 'Situação inválida.' using errcode = '22023';
  end if;
  update public.workshop_appointments
     set status = p_status,
         quote_id = coalesce(p_quote, quote_id),
         order_id = coalesce(p_order, order_id)
   where id = p_id and organization_id = p_org;
  if not found then raise exception 'Agendamento não encontrado.' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.workshop_list_appointments(p_org uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.wq_assert(p_org, 'member');
  return coalesce((select jsonb_agg(to_jsonb(a) || jsonb_build_object(
                     'customer_name', c.full_name, 'customer_whatsapp', coalesce(c.whatsapp, c.phone),
                     'vehicle_label', case when v.id is not null then concat_ws(' ', v.brand, v.model, v.plate) end,
                     'responsible_name', (select full_name from public.profiles where id = a.responsible_user_id)) order by a.starts_at)
                     from public.workshop_appointments a
                     left join public.workshop_customers c on c.id = a.customer_id
                     left join public.workshop_vehicles v on v.id = a.vehicle_id
                    where a.organization_id = p_org and a.starts_at >= p_from and a.starts_at < p_to), '[]'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------
-- Lembretes, recuperação e contatos (§14)
-- -----------------------------------------------------------------------------
create or replace function public.workshop_save_reminder(p_org uuid, p_id uuid, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
        v_cust uuid := (p_data ->> 'customer_id')::uuid;
        v_veh uuid := nullif(p_data ->> 'vehicle_id', '')::uuid;
        v_order uuid := nullif(p_data ->> 'order_id', '')::uuid;
begin
  perform public.wq_assert(p_org, 'manage_quotes');
  if not exists (select 1 from public.workshop_customers where id = v_cust and organization_id = p_org) then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;
  if v_veh is not null and not exists (select 1 from public.workshop_vehicles where id = v_veh and organization_id = p_org and customer_id = v_cust) then
    raise exception 'A moto não pertence a este cliente.' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.workshop_reminders (organization_id, customer_id, vehicle_id, order_id, kind, title, due_date, due_km, notes, created_by)
    values (p_org, v_cust, v_veh, v_order, coalesce(public.wq_txt(p_data, 'kind'), 'date'), public.wq_txt(p_data, 'title'),
            nullif(p_data ->> 'due_date', '')::date, nullif(p_data ->> 'due_km', '')::int, public.wq_txt(p_data, 'notes'), auth.uid())
    returning id into v_id;
  else
    update public.workshop_reminders
       set kind = coalesce(public.wq_txt(p_data, 'kind'), kind), title = public.wq_txt(p_data, 'title'),
           due_date = nullif(p_data ->> 'due_date', '')::date, due_km = nullif(p_data ->> 'due_km', '')::int,
           notes = public.wq_txt(p_data, 'notes'), vehicle_id = v_veh
     where id = p_id and organization_id = p_org
    returning id into v_id;
    if v_id is null then raise exception 'Lembrete não encontrado.' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.workshop_set_reminder_status(p_org uuid, p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.wq_assert(p_org, 'manage_quotes');
  if p_status not in ('open', 'done', 'dismissed') then raise exception 'Situação inválida.' using errcode = '22023'; end if;
  update public.workshop_reminders set status = p_status where id = p_id and organization_id = p_org;
  if not found then raise exception 'Lembrete não encontrado.' using errcode = 'P0002'; end if;
end;
$$;

-- Mensagem preparada (WhatsApp aberto pela pessoa). Não confirma envio (§13.3).
create or replace function public.workshop_log_contact(p_org uuid, p_customer uuid, p_reason text, p_reference uuid default null,
                                                       p_channel text default 'whatsapp', p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.wq_assert(p_org, 'manage_quotes');
  if not exists (select 1 from public.workshop_customers where id = p_customer and organization_id = p_org) then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;
  insert into public.workshop_contact_log (organization_id, customer_id, reason, reference_id, channel, note, created_by)
  values (p_org, p_customer, p_reason, p_reference, coalesce(p_channel, 'whatsapp'), nullif(btrim(coalesce(p_note, '')), ''), auth.uid());
  if p_reason = 'reminder' and p_reference is not null then
    update public.workshop_reminders set last_contact_at = now() where id = p_reference and organization_id = p_org;
  end if;
end;
$$;

create or replace function public.workshop_relationship(p_org uuid, p_inactive_days int default 180, p_quote_days int default 2)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  perform public.wq_assert(p_org, 'member');
  return jsonb_build_object(
    'reminders', coalesce((select jsonb_agg(to_jsonb(r) || jsonb_build_object('customer_name', c.full_name, 'whatsapp', coalesce(c.whatsapp, c.phone),
                              'vehicle_label', case when v.id is not null then concat_ws(' ', v.brand, v.model) end, 'vehicle_km', v.km,
                              'due', (r.due_date is not null and r.due_date <= v_today + 7) or (r.due_km is not null and v.km is not null and v.km >= r.due_km - 300))
                            order by r.due_date nulls last, r.created_at)
                             from public.workshop_reminders r
                             join public.workshop_customers c on c.id = r.customer_id
                             left join public.workshop_vehicles v on v.id = r.vehicle_id
                            where r.organization_id = p_org and r.status = 'open'), '[]'::jsonb),
    'open_quotes', coalesce((select jsonb_agg(jsonb_build_object('quote_id', q.id, 'number', q.number, 'status', q.status, 'customer_id', c.id,
                              'customer_name', c.full_name, 'whatsapp', coalesce(c.whatsapp, c.phone), 'total_cents', qv.total_cents,
                              'sent_at', qv.sent_at, 'valid_until', qv.valid_until,
                              'last_contact_at', (select max(created_at) from public.workshop_contact_log l where l.organization_id = p_org and l.reference_id = q.id))
                            order by qv.sent_at)
                             from public.workshop_quotes q
                             join public.workshop_quote_versions qv on qv.quote_id = q.id and qv.version_no = q.current_version
                             join public.workshop_customers c on c.id = q.customer_id
                            where q.organization_id = p_org and q.status in ('sent', 'viewed') and qv.sent_at < now() - make_interval(days => p_quote_days)), '[]'::jsonb),
    'lost_quotes', coalesce((select jsonb_agg(jsonb_build_object('quote_id', q.id, 'number', q.number, 'status', q.status, 'customer_id', c.id,
                              'customer_name', c.full_name, 'whatsapp', coalesce(c.whatsapp, c.phone), 'total_cents', qv.total_cents,
                              'updated_at', q.updated_at) order by q.updated_at desc)
                             from public.workshop_quotes q
                             join public.workshop_quote_versions qv on qv.quote_id = q.id and qv.version_no = q.current_version
                             join public.workshop_customers c on c.id = q.customer_id
                            where q.organization_id = p_org and q.status in ('expired', 'rejected', 'partially_approved')
                              and q.updated_at > now() - interval '60 days'), '[]'::jsonb),
    'inactive_customers', coalesce((select jsonb_agg(x order by x ->> 'last_visit') from (
                              select jsonb_build_object('customer_id', c.id, 'customer_name', c.full_name, 'whatsapp', coalesce(c.whatsapp, c.phone),
                                       'last_visit', greatest(c.first_visit_at::timestamptz, lv.last_quote, lv.last_order),
                                       'last_contact_at', (select max(created_at) from public.workshop_contact_log l where l.organization_id = p_org and l.customer_id = c.id)) as x
                                from public.workshop_customers c
                                cross join lateral (select (select max(created_at) from public.workshop_quotes where customer_id = c.id and organization_id = p_org) as last_quote,
                                                           (select max(created_at) from public.workshop_service_orders where customer_id = c.id and organization_id = p_org) as last_order) lv
                               where c.organization_id = p_org and c.status = 'active'
                                 and greatest(c.first_visit_at::timestamptz, lv.last_quote, lv.last_order) < now() - make_interval(days => p_inactive_days)
                               limit 300) y), '[]'::jsonb));
end;
$$;

create or replace function public.workshop_customer_contacts(p_org uuid, p_customer uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.wq_assert(p_org, 'member');
  return jsonb_build_object(
    'contacts', coalesce((select jsonb_agg(jsonb_build_object('reason', l.reason, 'channel', l.channel, 'note', l.note, 'created_at', l.created_at,
                            'by', (select full_name from public.profiles where id = l.created_by)) order by l.created_at desc)
                           from (select * from public.workshop_contact_log where organization_id = p_org and customer_id = p_customer
                                  order by created_at desc limit 20) l), '[]'::jsonb),
    'reminders', coalesce((select jsonb_agg(to_jsonb(r) order by r.due_date nulls last) from public.workshop_reminders r
                            where r.organization_id = p_org and r.customer_id = p_customer and r.status = 'open'), '[]'::jsonb),
    'payments', case when public.has_org_permission(p_org, 'manage_finance') then
                  coalesce((select jsonb_agg(jsonb_build_object('order_number', o.number, 'amount_cents', p.amount_cents, 'method', p.method,
                              'paid_at', p.paid_at, 'voided', p.voided_at is not null) order by p.paid_at desc)
                             from public.workshop_payments p join public.workshop_service_orders o on o.id = p.order_id
                            where p.organization_id = p_org and o.customer_id = p_customer), '[]'::jsonb) end);
end;
$$;

-- -----------------------------------------------------------------------------
-- Relatórios (§24)
-- -----------------------------------------------------------------------------
create or replace function public.workshop_reports(p_org uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_from timestamptz := (p_from::timestamp at time zone 'America/Sao_Paulo');
        v_to timestamptz := ((p_to + 1)::timestamp at time zone 'America/Sao_Paulo');
        v_fin boolean;
begin
  if not (public.has_org_permission(p_org, 'manage_quotes') or public.has_org_permission(p_org, 'manage_finance')) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  v_fin := public.has_org_permission(p_org, 'manage_finance');
  return jsonb_build_object(
    'commercial', (select jsonb_build_object(
        'created', count(*) filter (where q.created_at >= v_from and q.created_at < v_to),
        'approved', count(*) filter (where q.status in ('approved', 'partially_approved') and q.decided_at >= v_from and q.decided_at < v_to),
        'rejected', count(*) filter (where q.status = 'rejected' and q.decided_at >= v_from and q.decided_at < v_to),
        'expired', count(*) filter (where q.status = 'expired' and q.updated_at >= v_from and q.updated_at < v_to),
        'avg_quote_cents', coalesce(round(avg(qv.total_cents) filter (where qv1.sent_at >= v_from and qv1.sent_at < v_to)), 0),
        'approved_cents', coalesce(sum(q.approved_total_cents) filter (where q.status in ('approved', 'partially_approved')
                                     and q.decided_at >= v_from and q.decided_at < v_to), 0))
      from public.workshop_quotes q
      join public.workshop_quote_versions qv on qv.quote_id = q.id and qv.version_no = q.current_version
      left join public.workshop_quote_versions qv1 on qv1.quote_id = q.id and qv1.version_no = 1
     where q.organization_id = p_org),
    'top_services', coalesce((select jsonb_agg(jsonb_build_object('description', d, 'count', n, 'cents', cents) order by n desc, cents desc)
                               from (select i.description as d, count(*) as n, sum(i.subtotal_cents - i.discount_cents) as cents
                                       from public.workshop_service_order_items i
                                       join public.workshop_service_orders o on o.id = i.order_id
                                      where o.organization_id = p_org and i.status = 'done' and o.completed_at >= v_from and o.completed_at < v_to
                                      group by i.description order by count(*) desc, sum(i.subtotal_cents) desc limit 10) x), '[]'::jsonb),
    'operational', (select jsonb_build_object(
        'completed', count(*) filter (where o.completed_at >= v_from and o.completed_at < v_to),
        'active', count(*) filter (where o.status not in ('completed', 'awaiting_pickup', 'delivered', 'canceled')),
        'avg_hours', coalesce(round(extract(epoch from avg(o.completed_at - o.created_at) filter (where o.completed_at >= v_from and o.completed_at < v_to)) / 3600.0, 1), 0),
        'pending_items', (select count(*) from public.workshop_service_order_items i join public.workshop_service_orders o2 on o2.id = i.order_id
                           where o2.organization_id = p_org and i.status = 'pending' and o2.status not in ('canceled')))
      from public.workshop_service_orders o where o.organization_id = p_org),
    'by_mechanic', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(p.full_name, 'Equipe'), 'items_done', n, 'cents', cents) order by n desc)
                              from (select i.executed_by, count(*) as n, sum(i.subtotal_cents - i.discount_cents) as cents
                                      from public.workshop_service_order_items i join public.workshop_service_orders o on o.id = i.order_id
                                     where o.organization_id = p_org and i.status = 'done' and i.executed_at >= v_from and i.executed_at < v_to
                                     group by i.executed_by) x left join public.profiles p on p.id = x.executed_by), '[]'::jsonb),
    'financial', case when v_fin then public.workshop_finance(p_org, p_from, p_to) - 'payments' - 'receivables' end);
end;
$$;

-- -----------------------------------------------------------------------------
-- Permissões de execução
-- -----------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'get_org_member_extra_permissions(uuid)', 'set_org_member_extra_permissions(uuid, boolean, boolean, boolean, boolean)',
    'workshop_save_part(uuid, uuid, jsonb)', 'workshop_list_parts(uuid, text, boolean)',
    'workshop_record_payment(uuid, uuid, bigint, text, date, text)', 'workshop_void_payment(uuid, uuid, text)',
    'workshop_order_payments(uuid, uuid)', 'workshop_finance(uuid, date, date)',
    'workshop_save_appointment(uuid, uuid, jsonb)', 'workshop_set_appointment_status(uuid, uuid, text, uuid, uuid)',
    'workshop_list_appointments(uuid, timestamptz, timestamptz)',
    'workshop_save_reminder(uuid, uuid, jsonb)', 'workshop_set_reminder_status(uuid, uuid, text)',
    'workshop_log_contact(uuid, uuid, text, uuid, text, text)', 'workshop_relationship(uuid, integer, integer)',
    'workshop_customer_contacts(uuid, uuid)', 'workshop_reports(uuid, date, date)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
