-- =============================================================================
-- Moto Passaporte — Migração: módulo Oficina, Fase 2 (PRD 2.1 §8, §9 e §25 — ordem de serviço)
-- Objetivo: OS a partir do orçamento aprovado (só itens aprovados) ou aberta manualmente com
--           autorização registrada; status com autor e hora; mecânico designado; checklists de
--           entrada e saída; fotos em bucket privado; peças e execução por item; conclusão com
--           comprovante; entrega; links para o cliente dar ciência da entrada e ver o comprovante.
-- Regras: item sem autorização válida nunca existe na OS (recusado não entra); só item da OS pode
--         ser marcado como executado. OS concluída NÃO gera manutenção nesta fase (§17: Fase 3).
-- Permissão nova: can_execute_orders (mecânico: atualizar execução, checklist, fotos e peças).
-- Reversão: supabase/rollback/20261108191115_workshop_service_orders.down.sql
-- =============================================================================

alter table public.organization_members
  add column if not exists can_execute_orders boolean not null default true;
comment on column public.organization_members.can_execute_orders is
  'Funcionário pode atualizar a execução das ordens de serviço: itens, peças, checklist e fotos (PRD 2.1 §16, mecânico).';

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
           or (p_permission = 'execute_orders' and m.can_execute_orders))
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
    'user_id', auth.uid());
end;
$$;

drop function if exists public.get_org_member_extra_permissions(uuid);
create function public.get_org_member_extra_permissions(p_org uuid)
returns table (member_id uuid, can_manage_quotes boolean, can_manage_prices boolean, can_execute_orders boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_org_responsible(p_org) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  return query select m.id, m.can_manage_quotes, m.can_manage_prices, m.can_execute_orders
    from public.organization_members m where m.organization_id = p_org and m.status = 'active';
end;
$$;

drop function if exists public.set_org_member_extra_permissions(uuid, boolean, boolean);
create function public.set_org_member_extra_permissions(p_member uuid, p_manage_quotes boolean, p_manage_prices boolean,
                                                        p_execute_orders boolean default null)
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
         can_execute_orders = coalesce(p_execute_orders, can_execute_orders)
   where id = p_member;
end;
$$;

-- -----------------------------------------------------------------------------
-- Tabelas
-- -----------------------------------------------------------------------------
create table public.workshop_service_orders (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete restrict,
  number              integer not null,
  customer_id         uuid not null,
  vehicle_id          uuid,
  quote_id            uuid,
  status              text not null default 'open' check (status in (
                        'open', 'awaiting_diagnosis', 'awaiting_approval', 'awaiting_parts', 'awaiting_execution',
                        'in_progress', 'paused', 'awaiting_complement', 'completed', 'awaiting_pickup', 'delivered', 'canceled')),
  mechanic_user_id    uuid references auth.users (id) on delete set null,
  due_date            date,
  km_in               integer check (km_in is null or km_in between 0 and 9999999),
  km_out              integer check (km_out is null or km_out between 0 and 9999999),
  notes               text check (notes is null or char_length(notes) <= 2000),
  technical_notes     text check (technical_notes is null or char_length(technical_notes) <= 4000),
  auth_method         text check (auth_method is null or auth_method in ('presencial', 'telefone', 'whatsapp', 'outro')),
  auth_by_name        text check (auth_by_name is null or char_length(auth_by_name) between 3 and 120),
  auth_note           text check (auth_note is null or char_length(auth_note) <= 500),
  adjustment_cents    bigint not null default 0,
  adjustment_reason   text check (adjustment_reason is null or char_length(adjustment_reason) <= 300),
  final_total_cents   bigint,
  completion_notes    text check (completion_notes is null or char_length(completion_notes) <= 2000),
  completed_at        timestamptz,
  completed_by        uuid references auth.users (id) on delete set null,
  receipt_code        text unique,
  delivered_at        timestamptz,
  delivered_by        uuid references auth.users (id) on delete set null,
  delivered_to_name   text check (delivered_to_name is null or char_length(delivered_to_name) between 3 and 120),
  canceled_reason     text check (canceled_reason is null or char_length(canceled_reason) <= 500),
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (organization_id, number),
  unique (organization_id, id),
  check (quote_id is not null or (auth_method is not null and auth_by_name is not null)),
  check (adjustment_cents = 0 or adjustment_reason is not null),
  foreign key (organization_id, customer_id) references public.workshop_customers (organization_id, id) on delete restrict,
  foreign key (organization_id, vehicle_id) references public.workshop_vehicles (organization_id, id) on delete restrict,
  foreign key (organization_id, quote_id) references public.workshop_quotes (organization_id, id) on delete restrict
);
comment on table public.workshop_service_orders is
  'Ordem de serviço (PRD 2.1 §8). Sem orçamento, exige autorização registrada (forma e quem autorizou). Não gera manutenção nesta fase.';
create unique index workshop_service_orders_one_per_quote on public.workshop_service_orders (quote_id)
  where quote_id is not null and status <> 'canceled';
create index workshop_service_orders_org_status_idx on public.workshop_service_orders (organization_id, status, created_at desc);
create index workshop_service_orders_mechanic_idx on public.workshop_service_orders (mechanic_user_id) where mechanic_user_id is not null;

create table public.workshop_service_order_items (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null,
  order_id            uuid not null,
  position            integer not null check (position between 1 and 300),
  kind                text not null check (kind in ('labor', 'part', 'product', 'material', 'outsourced', 'other')),
  description         text not null check (char_length(description) between 2 and 300),
  quantity            numeric(10, 3) not null check (quantity > 0 and quantity <= 100000),
  unit_price_cents    bigint not null check (unit_price_cents between 0 and 100000000),
  subtotal_cents      bigint not null,
  discount_cents      bigint not null default 0,
  source              text not null check (source in ('quote', 'complement', 'manual')),
  quote_id            uuid,
  quote_position      integer,
  auth_method         text check (auth_method is null or auth_method in ('presencial', 'telefone', 'whatsapp', 'outro')),
  auth_by_name        text check (auth_by_name is null or char_length(auth_by_name) between 3 and 120),
  auth_note           text check (auth_note is null or char_length(auth_note) <= 500),
  status              text not null default 'pending' check (status in ('pending', 'done', 'not_done')),
  part_brand          text check (part_brand is null or char_length(part_brand) <= 80),
  part_code           text check (part_code is null or char_length(part_code) <= 80),
  notes               text check (notes is null or char_length(notes) <= 1000),
  executed_at         timestamptz,
  executed_by         uuid references auth.users (id) on delete set null,
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  unique (order_id, position),
  check ((source = 'manual' and auth_method is not null and auth_by_name is not null)
         or (source <> 'manual' and quote_id is not null and quote_position is not null)),
  foreign key (organization_id, order_id) references public.workshop_service_orders (organization_id, id) on delete restrict,
  foreign key (organization_id, quote_id) references public.workshop_quotes (organization_id, id) on delete restrict
);
comment on table public.workshop_service_order_items is
  'Itens autorizados da OS: vindos do aceite do orçamento (posição aprovada) ou manuais com autorização registrada. Itens recusados nunca entram (PRD 2.1 §8.4).';
create unique index workshop_service_order_items_quote_pos on public.workshop_service_order_items (order_id, quote_id, quote_position)
  where quote_id is not null;
create index workshop_service_order_items_order_idx on public.workshop_service_order_items (order_id);

create table public.workshop_service_order_events (
  id              bigint generated always as identity primary key,
  organization_id uuid not null,
  order_id        uuid not null,
  kind            text not null check (kind in (
                    'created', 'status_changed', 'assigned', 'item_added', 'item_updated', 'complement_added',
                    'checklist_saved', 'photo_added', 'photo_removed', 'link_created', 'customer_ack', 'completed',
                    'pickup_notified', 'delivered', 'canceled', 'notes_updated')),
  from_status     text,
  to_status       text,
  actor_user_id   uuid references auth.users (id) on delete set null,
  actor_label     text,
  data            jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  foreign key (organization_id, order_id) references public.workshop_service_orders (organization_id, id) on delete restrict
);
create index workshop_service_order_events_order_idx on public.workshop_service_order_events (order_id, created_at);

create table public.workshop_inspections (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  order_id        uuid not null,
  phase           text not null check (phase in ('entry', 'exit')),
  items           jsonb not null default '{}' check (jsonb_typeof(items) = 'object'),
  fuel_level      text check (fuel_level is null or fuel_level in ('reserva', '1/4', '1/2', '3/4', 'cheio')),
  keys_count      integer check (keys_count is null or keys_count between 0 and 10),
  km              integer check (km is null or km between 0 and 9999999),
  notes           text check (notes is null or char_length(notes) <= 2000),
  recorded_by     uuid references auth.users (id) on delete set null,
  recorded_at     timestamptz not null default now(),
  customer_ack_at   timestamptz,
  customer_ack_name text check (customer_ack_name is null or char_length(customer_ack_name) between 3 and 120),
  customer_ack_ip   text,
  unique (order_id, phase),
  unique (organization_id, id),
  foreign key (organization_id, order_id) references public.workshop_service_orders (organization_id, id) on delete restrict
);
comment on table public.workshop_inspections is
  'Checklist de entrada e de saída da OS (PRD 2.1 §9). items = {chave: {estado: ok|atencao|avaria|na, obs}}. Entrada trava após a ciência do cliente.';

create table public.workshop_os_photos (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  order_id        uuid not null,
  phase           text not null check (phase in ('entry', 'work', 'exit')),
  storage_path    text not null unique,
  mime_type       text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  file_size       bigint not null check (file_size > 0),
  caption         text check (caption is null or char_length(caption) <= 200),
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  removed_at      timestamptz,
  removed_by      uuid references auth.users (id) on delete set null,
  foreign key (organization_id, order_id) references public.workshop_service_orders (organization_id, id) on delete restrict
);
create index workshop_os_photos_order_idx on public.workshop_os_photos (order_id);

create table public.workshop_os_shares (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  order_id        uuid not null,
  purpose         text not null check (purpose in ('entry_ack', 'receipt')),
  token_hash      text not null unique,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  revoked_at      timestamptz,
  first_viewed_at timestamptz,
  view_count      integer not null default 0,
  foreign key (organization_id, order_id) references public.workshop_service_orders (organization_id, id) on delete restrict
);
create index workshop_os_shares_order_idx on public.workshop_os_shares (order_id, purpose);

-- Gatilhos: updated_at, organização fixa, auditoria, eventos imutáveis.
create trigger workshop_service_orders_updated_at before update on public.workshop_service_orders
  for each row execute function public.set_updated_at();
create trigger workshop_service_orders_protect_org before update on public.workshop_service_orders
  for each row execute function public.wq_protect_org();
create trigger workshop_service_orders_audit after insert or update or delete on public.workshop_service_orders
  for each row execute function public.audit_row_change('', 'organization_id');
create trigger workshop_service_order_items_protect_org before update on public.workshop_service_order_items
  for each row execute function public.wq_protect_org();
create trigger workshop_service_order_events_immutable before update or delete on public.workshop_service_order_events
  for each row execute function public.wq_immutable();

-- Item recusado ou sem autorização não muda de origem/valor; OS fechada não muda itens.
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
revoke execute on function public.wo_protect_item() from public, anon, authenticated;
create trigger workshop_service_order_items_protect before update or delete on public.workshop_service_order_items
  for each row execute function public.wo_protect_item();

-- RLS
do $$
declare t text;
begin
  foreach t in array array['workshop_service_orders', 'workshop_service_order_items', 'workshop_service_order_events',
                           'workshop_inspections', 'workshop_os_photos', 'workshop_os_shares'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
  foreach t in array array['workshop_service_orders', 'workshop_service_order_items', 'workshop_service_order_events',
                           'workshop_inspections', 'workshop_os_photos'] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy %1$s_select_member on public.%1$s for select to authenticated using (public.has_org_permission(organization_id, %2$L))',
                   t, 'member');
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Fotos: bucket privado por oficina (pasta = id da oficina)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('workshop-files', 'workshop-files', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_access_workshop_object(p_name text, p_permission text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_folder text := split_part(p_name, '/', 1);
begin
  if v_folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or p_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$' then
    return false;
  end if;
  return public.has_org_permission(v_folder::uuid, p_permission);
end;
$$;
revoke execute on function public.can_access_workshop_object(text, text) from public, anon;
grant execute on function public.can_access_workshop_object(text, text) to authenticated;

create policy workshop_files_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'workshop-files' and public.can_access_workshop_object(name, 'execute_orders'));
create policy workshop_files_select on storage.objects
  for select to authenticated
  using (bucket_id = 'workshop-files' and public.can_access_workshop_object(name, 'member'));

-- Conferência do conteúdo (ADR-033) também para este bucket: informações do arquivo para a Edge Function.
create or replace function public.workshop_file_object_info(p_path text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('owner', coalesce(o.owner_id, o.owner::text), 'mime', o.metadata ->> 'mimetype',
                            'size', (o.metadata ->> 'size')::bigint,
                            'registered', exists (select 1 from public.workshop_os_photos p where p.storage_path = o.name))
    from storage.objects o where o.bucket_id = 'workshop-files' and o.name = p_path;
$$;
revoke execute on function public.workshop_file_object_info(text) from public, anon, authenticated;
grant execute on function public.workshop_file_object_info(text) to service_role;

-- -----------------------------------------------------------------------------
-- Apoio
-- -----------------------------------------------------------------------------
create or replace function public.wo_event(p_org uuid, p_order uuid, p_kind text, p_from text default null, p_to text default null,
                                           p_data jsonb default '{}', p_actor_label text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.workshop_service_order_events (organization_id, order_id, kind, from_status, to_status, actor_user_id, actor_label, data)
  values (p_org, p_order, p_kind, p_from, p_to, auth.uid(),
          coalesce(p_actor_label, case when auth.uid() is not null then public.wq_actor_label() end), coalesce(p_data, '{}'));
$$;
revoke execute on function public.wo_event(uuid, uuid, text, text, text, jsonb, text) from public, anon, authenticated;

-- Carrega a OS travada e confere a permissão (gerente da OS ou mecânico).
create or replace function public.wo_lock(p_org uuid, p_order uuid, p_permission text)
returns public.workshop_service_orders
language plpgsql
security definer
set search_path = ''
as $$
declare o public.workshop_service_orders;
begin
  perform public.wq_assert(p_org, p_permission);
  select * into o from public.workshop_service_orders where id = p_order and organization_id = p_org for update;
  if not found then raise exception 'Ordem de serviço não encontrada.' using errcode = 'P0002'; end if;
  return o;
end;
$$;
revoke execute on function public.wo_lock(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.wo_is_closed(p_status text)
returns boolean
language sql
immutable
set search_path = ''
as $$ select p_status in ('completed', 'awaiting_pickup', 'delivered', 'canceled') $$;
revoke execute on function public.wo_is_closed(text) from public, anon, authenticated;

-- Copia do aceite só os itens aprovados de um orçamento, com desconto proporcional.
create or replace function public.wo_copy_quote_items(p_org uuid, p_order uuid, p_quote uuid, p_source text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare a public.workshop_quote_approvals;
        v public.workshop_quote_versions;
        n int;
        v_pos int := coalesce((select max(position) from public.workshop_service_order_items where order_id = p_order), 0);
begin
  select * into a from public.workshop_quote_approvals
   where quote_id = p_quote and organization_id = p_org and decision in ('approved', 'partial')
   order by created_at desc limit 1;
  if not found then raise exception 'Este orçamento não tem itens aprovados pelo cliente.' using errcode = 'P0001'; end if;
  select * into v from public.workshop_quote_versions where id = a.version_id;
  insert into public.workshop_service_order_items (organization_id, order_id, position, kind, description, quantity,
                                                   unit_price_cents, subtotal_cents, discount_cents, source, quote_id,
                                                   quote_position, notes, created_by)
  select p_org, p_order, v_pos + row_number() over (order by i.position), i.kind, i.description, i.quantity,
         i.unit_price_cents, i.subtotal_cents,
         case when v.subtotal_cents > 0 then round(v.discount_cents::numeric * i.subtotal_cents / v.subtotal_cents) else 0 end,
         p_source, p_quote, i.position, i.notes, auth.uid()
    from public.workshop_quote_items i
   where i.version_id = v.id and i.position = any (a.approved_positions)
   order by i.position;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.wo_copy_quote_items(uuid, uuid, uuid, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Abertura
-- -----------------------------------------------------------------------------
create or replace function public.workshop_create_order_from_quote(p_org uuid, p_quote uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare q public.workshop_quotes;
        v_id uuid;
        v_km int;
begin
  perform public.wq_assert(p_org, 'manage_quotes');
  select * into q from public.workshop_quotes where id = p_quote and organization_id = p_org for update;
  if not found then raise exception 'Orçamento não encontrado.' using errcode = 'P0002'; end if;
  if q.status not in ('approved', 'partially_approved') then
    raise exception 'Só orçamento aprovado (total ou em parte) vira ordem de serviço.' using errcode = 'P0001';
  end if;
  if q.parent_quote_id is not null then
    raise exception 'Orçamento complementar entra na ordem de serviço do orçamento original.' using errcode = 'P0001';
  end if;
  select id into v_id from public.workshop_service_orders where quote_id = q.id and status <> 'canceled';
  if v_id is not null then return v_id; end if;
  select km into v_km from public.workshop_quote_versions where quote_id = q.id and version_no = q.current_version;
  insert into public.workshop_service_orders (organization_id, number, customer_id, vehicle_id, quote_id, status, km_in, due_date, created_by)
  values (p_org, public.wq_next_number(p_org, 'service_order'), q.customer_id, q.vehicle_id, q.id, 'awaiting_execution', v_km,
          current_date + coalesce((select estimated_days from public.workshop_quote_versions where quote_id = q.id and version_no = q.current_version), 0),
          auth.uid())
  returning id into v_id;
  perform public.wo_copy_quote_items(p_org, v_id, q.id, 'quote');
  perform public.wo_event(p_org, v_id, 'created', null, 'awaiting_execution', jsonb_build_object('quote_number', q.number));
  return v_id;
end;
$$;

-- Abertura manual (sem orçamento) com autorização registrada (PRD 2.1 §8.1).
create or replace function public.workshop_create_order_manual(p_org uuid, p_customer uuid, p_vehicle uuid, p_auth_method text,
                                                               p_auth_by text, p_auth_note text, p_items jsonb, p_km int default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
        it jsonb;
        n int := 0;
        v_qty numeric;
        v_unit bigint;
begin
  perform public.wq_assert(p_org, 'manage_quotes');
  if not exists (select 1 from public.workshop_customers where id = p_customer and organization_id = p_org and status = 'active') then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;
  if p_vehicle is not null and not exists (select 1 from public.workshop_vehicles where id = p_vehicle and organization_id = p_org and customer_id = p_customer) then
    raise exception 'A moto não pertence a este cliente.' using errcode = '22023';
  end if;
  if coalesce(p_auth_method, '') not in ('presencial', 'telefone', 'whatsapp', 'outro') or char_length(btrim(coalesce(p_auth_by, ''))) < 3 then
    raise exception 'Sem orçamento, registre como o cliente autorizou e quem autorizou.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'Inclua os serviços autorizados.' using errcode = '22023';
  end if;
  insert into public.workshop_service_orders (organization_id, number, customer_id, vehicle_id, status, km_in, auth_method, auth_by_name, auth_note, created_by)
  values (p_org, public.wq_next_number(p_org, 'service_order'), p_customer, p_vehicle, 'open', p_km, p_auth_method, btrim(p_auth_by),
          nullif(btrim(coalesce(p_auth_note, '')), ''), auth.uid())
  returning id into v_id;
  for it in select * from jsonb_array_elements(p_items) loop
    n := n + 1;
    v_qty := coalesce(nullif(it ->> 'quantity', '')::numeric, 1);
    v_unit := coalesce(nullif(it ->> 'unit_price_cents', '')::bigint, 0);
    insert into public.workshop_service_order_items (organization_id, order_id, position, kind, description, quantity, unit_price_cents,
                                                     subtotal_cents, source, auth_method, auth_by_name, auth_note, notes, created_by)
    values (p_org, v_id, n, coalesce(public.wq_txt(it, 'kind'), 'labor'), public.wq_txt(it, 'description'), v_qty, v_unit,
            round(v_qty * v_unit), 'manual', p_auth_method, btrim(p_auth_by), nullif(btrim(coalesce(p_auth_note, '')), ''),
            public.wq_txt(it, 'notes'), auth.uid());
  end loop;
  perform public.wo_event(p_org, v_id, 'created', null, 'open',
                          jsonb_build_object('manual', true, 'auth_method', p_auth_method, 'auth_by', btrim(p_auth_by)));
  return v_id;
end;
$$;

-- Item extra sem orçamento, com autorização registrada.
create or replace function public.workshop_add_order_item(p_org uuid, p_order uuid, p_item jsonb, p_auth_method text, p_auth_by text, p_auth_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare o public.workshop_service_orders;
        v_qty numeric := coalesce(nullif(p_item ->> 'quantity', '')::numeric, 1);
        v_unit bigint := coalesce(nullif(p_item ->> 'unit_price_cents', '')::bigint, 0);
        v_pos int;
begin
  o := public.wo_lock(p_org, p_order, 'manage_quotes');
  if public.wo_is_closed(o.status) then raise exception 'Ordem de serviço encerrada.' using errcode = 'P0001'; end if;
  if coalesce(p_auth_method, '') not in ('presencial', 'telefone', 'whatsapp', 'outro') or char_length(btrim(coalesce(p_auth_by, ''))) < 3 then
    raise exception 'Item novo sem orçamento: registre como o cliente autorizou e quem autorizou. Se preferir, faça um orçamento complementar.' using errcode = '22023';
  end if;
  select coalesce(max(position), 0) + 1 into v_pos from public.workshop_service_order_items where order_id = o.id;
  insert into public.workshop_service_order_items (organization_id, order_id, position, kind, description, quantity, unit_price_cents,
                                                   subtotal_cents, source, auth_method, auth_by_name, auth_note, notes, created_by)
  values (p_org, o.id, v_pos, coalesce(public.wq_txt(p_item, 'kind'), 'labor'), public.wq_txt(p_item, 'description'), v_qty, v_unit,
          round(v_qty * v_unit), 'manual', p_auth_method, btrim(p_auth_by), nullif(btrim(coalesce(p_auth_note, '')), ''),
          public.wq_txt(p_item, 'notes'), auth.uid());
  perform public.wo_event(p_org, o.id, 'item_added', null, null,
                          jsonb_build_object('description', public.wq_txt(p_item, 'description'), 'auth_method', p_auth_method, 'auth_by', btrim(p_auth_by)));
end;
$$;

-- Itens aprovados de um orçamento complementar do original (§7.6).
create or replace function public.workshop_add_complement_to_order(p_org uuid, p_order uuid, p_quote uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare o public.workshop_service_orders;
        q public.workshop_quotes;
        n int;
begin
  o := public.wo_lock(p_org, p_order, 'manage_quotes');
  if public.wo_is_closed(o.status) then raise exception 'Ordem de serviço encerrada.' using errcode = 'P0001'; end if;
  select * into q from public.workshop_quotes where id = p_quote and organization_id = p_org;
  if not found or q.parent_quote_id is distinct from o.quote_id or o.quote_id is null then
    raise exception 'Este orçamento não é complementar do orçamento desta OS.' using errcode = 'P0001';
  end if;
  if q.status not in ('approved', 'partially_approved') then
    raise exception 'O orçamento complementar ainda não foi aprovado pelo cliente.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.workshop_service_order_items where order_id = o.id and quote_id = q.id) then
    raise exception 'Os itens deste complementar já estão na OS.' using errcode = 'P0001';
  end if;
  n := public.wo_copy_quote_items(p_org, o.id, q.id, 'complement');
  if o.status = 'awaiting_complement' then
    update public.workshop_service_orders set status = 'awaiting_execution' where id = o.id;
  end if;
  perform public.wo_event(p_org, o.id, 'complement_added', o.status,
                          case when o.status = 'awaiting_complement' then 'awaiting_execution' else o.status end,
                          jsonb_build_object('quote_number', q.number, 'items', n));
  return n;
end;
$$;

-- -----------------------------------------------------------------------------
-- Andamento
-- -----------------------------------------------------------------------------
create or replace function public.workshop_set_order_status(p_org uuid, p_order uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare o public.workshop_service_orders;
begin
  o := public.wo_lock(p_org, p_order, 'execute_orders');
  if p_status not in ('open', 'awaiting_diagnosis', 'awaiting_approval', 'awaiting_parts', 'awaiting_execution',
                      'in_progress', 'paused', 'awaiting_complement') then
    raise exception 'Situação inválida. Conclusão, entrega e cancelamento têm botões próprios.' using errcode = '22023';
  end if;
  if public.wo_is_closed(o.status) then raise exception 'Ordem de serviço encerrada.' using errcode = 'P0001'; end if;
  if o.status = p_status then return; end if;
  update public.workshop_service_orders set status = p_status where id = o.id;
  perform public.wo_event(p_org, o.id, 'status_changed', o.status, p_status,
                          jsonb_build_object('note', nullif(btrim(coalesce(p_note, '')), '')));
end;
$$;

create or replace function public.workshop_update_order(p_org uuid, p_order uuid, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare o public.workshop_service_orders;
        v_mech uuid := nullif(p_data ->> 'mechanic_user_id', '')::uuid;
begin
  o := public.wo_lock(p_org, p_order, 'manage_quotes');
  if public.wo_is_closed(o.status) then raise exception 'Ordem de serviço encerrada.' using errcode = 'P0001'; end if;
  if v_mech is not null and not exists (select 1 from public.organization_members
                                         where organization_id = p_org and user_id = v_mech and status = 'active'
                                           and (role = 'responsible' or can_execute_orders)) then
    raise exception 'O mecânico precisa ser da equipe e ter permissão de executar serviços.' using errcode = '22023';
  end if;
  update public.workshop_service_orders
     set mechanic_user_id = case when p_data ? 'mechanic_user_id' then v_mech else mechanic_user_id end,
         due_date = case when p_data ? 'due_date' then nullif(p_data ->> 'due_date', '')::date else due_date end,
         km_in = case when p_data ? 'km_in' then nullif(p_data ->> 'km_in', '')::int else km_in end,
         notes = case when p_data ? 'notes' then public.wq_txt(p_data, 'notes') else notes end
   where id = o.id;
  if p_data ? 'mechanic_user_id' and v_mech is distinct from o.mechanic_user_id then
    perform public.wo_event(p_org, o.id, 'assigned', null, null,
                            jsonb_build_object('mechanic', (select full_name from public.profiles where id = v_mech)));
    if v_mech is not null and v_mech <> auth.uid() then
      perform public.notify(v_mech, 'service_order_assigned', 'OS nº ' || o.number || ' designada para você',
        'Abra a ordem de serviço para ver os serviços autorizados.', '/oficina/' || p_org || '/os/' || o.id,
        'os_assigned:' || o.id || ':' || v_mech);
    end if;
  else
    perform public.wo_event(p_org, o.id, 'notes_updated');
  end if;
end;
$$;

-- Execução por item e observações técnicas (mecânico).
create or replace function public.workshop_update_order_item(p_org uuid, p_order uuid, p_item uuid, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare o public.workshop_service_orders;
        i public.workshop_service_order_items;
        v_status text := coalesce(public.wq_txt(p_data, 'status'), null);
begin
  o := public.wo_lock(p_org, p_order, 'execute_orders');
  if public.wo_is_closed(o.status) then raise exception 'Ordem de serviço encerrada.' using errcode = 'P0001'; end if;
  select * into i from public.workshop_service_order_items where id = p_item and order_id = o.id;
  if not found then raise exception 'Item não encontrado nesta OS.' using errcode = 'P0002'; end if;
  if v_status is not null and v_status not in ('pending', 'done', 'not_done') then
    raise exception 'Situação do item inválida.' using errcode = '22023';
  end if;
  update public.workshop_service_order_items
     set status = coalesce(v_status, status),
         executed_at = case when v_status = 'done' and i.status <> 'done' then now() when v_status in ('pending', 'not_done') then null else executed_at end,
         executed_by = case when v_status = 'done' and i.status <> 'done' then auth.uid() when v_status in ('pending', 'not_done') then null else executed_by end,
         part_brand = case when p_data ? 'part_brand' then public.wq_txt(p_data, 'part_brand') else part_brand end,
         part_code = case when p_data ? 'part_code' then public.wq_txt(p_data, 'part_code') else part_code end,
         notes = case when p_data ? 'notes' then public.wq_txt(p_data, 'notes') else notes end
   where id = i.id;
  if v_status = 'done' and o.status in ('open', 'awaiting_execution', 'awaiting_parts', 'awaiting_diagnosis', 'paused') then
    update public.workshop_service_orders set status = 'in_progress' where id = o.id;
    perform public.wo_event(p_org, o.id, 'status_changed', o.status, 'in_progress', '{"auto": true}');
  end if;
  perform public.wo_event(p_org, o.id, 'item_updated', null, null,
                          jsonb_build_object('position', i.position, 'description', i.description, 'status', coalesce(v_status, i.status)));
end;
$$;

create or replace function public.workshop_set_technical_notes(p_org uuid, p_order uuid, p_notes text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare o public.workshop_service_orders;
begin
  o := public.wo_lock(p_org, p_order, 'execute_orders');
  if public.wo_is_closed(o.status) then raise exception 'Ordem de serviço encerrada.' using errcode = 'P0001'; end if;
  update public.workshop_service_orders set technical_notes = nullif(btrim(coalesce(p_notes, '')), '') where id = o.id;
  perform public.wo_event(p_org, o.id, 'notes_updated', null, null, '{"technical": true}');
end;
$$;

-- -----------------------------------------------------------------------------
-- Checklists e fotos
-- -----------------------------------------------------------------------------
create or replace function public.workshop_save_inspection(p_org uuid, p_order uuid, p_phase text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare o public.workshop_service_orders;
        cur public.workshop_inspections;
        v_items jsonb := coalesce(p_data -> 'items', '{}'::jsonb);
        k text;
begin
  o := public.wo_lock(p_org, p_order, 'execute_orders');
  if p_phase not in ('entry', 'exit') then raise exception 'Checklist inválido.' using errcode = '22023'; end if;
  if jsonb_typeof(v_items) <> 'object' or (select count(*) from jsonb_object_keys(v_items)) > 60 then
    raise exception 'Itens do checklist inválidos.' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(v_items) loop
    if char_length(k) > 60 or coalesce(v_items -> k ->> 'state', '') not in ('ok', 'atencao', 'avaria', 'na')
       or char_length(coalesce(v_items -> k ->> 'note', '')) > 300 then
      raise exception 'Item "%" do checklist inválido.', left(k, 40) using errcode = '22023';
    end if;
  end loop;
  select * into cur from public.workshop_inspections where order_id = o.id and phase = p_phase;
  if p_phase = 'entry' and (cur.customer_ack_at is not null or public.wo_is_closed(o.status)) then
    raise exception 'O checklist de entrada já foi confirmado pelo cliente ou a OS foi encerrada; registre observações na OS.' using errcode = 'P0001';
  end if;
  if p_phase = 'exit' and o.status in ('delivered', 'canceled') then
    raise exception 'A moto já foi entregue.' using errcode = 'P0001';
  end if;
  insert into public.workshop_inspections (organization_id, order_id, phase, items, fuel_level, keys_count, km, notes, recorded_by, recorded_at)
  values (p_org, o.id, p_phase, v_items, public.wq_txt(p_data, 'fuel_level'), nullif(p_data ->> 'keys_count', '')::int,
          nullif(p_data ->> 'km', '')::int, public.wq_txt(p_data, 'notes'), auth.uid(), now())
  on conflict (order_id, phase) do update
     set items = excluded.items, fuel_level = excluded.fuel_level, keys_count = excluded.keys_count, km = excluded.km,
         notes = excluded.notes, recorded_by = excluded.recorded_by, recorded_at = now();
  if p_phase = 'entry' and nullif(p_data ->> 'km', '') is not null and o.km_in is null then
    update public.workshop_service_orders set km_in = (p_data ->> 'km')::int where id = o.id;
  end if;
  perform public.wo_event(p_org, o.id, 'checklist_saved', null, null, jsonb_build_object('phase', p_phase));
end;
$$;

create or replace function public.workshop_register_os_photo(p_org uuid, p_order uuid, p_path text, p_phase text, p_caption text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare o public.workshop_service_orders;
        v_obj record;
        v_id uuid;
begin
  o := public.wo_lock(p_org, p_order, 'execute_orders');
  if o.status in ('delivered', 'canceled') then raise exception 'Ordem de serviço encerrada.' using errcode = 'P0001'; end if;
  if p_phase not in ('entry', 'work', 'exit') then raise exception 'Etapa inválida.' using errcode = '22023'; end if;
  if split_part(coalesce(p_path, ''), '/', 1) <> p_org::text then raise exception 'Arquivo de outra oficina.' using errcode = '42501'; end if;
  select o2.metadata ->> 'mimetype' as mime, (o2.metadata ->> 'size')::bigint as size, coalesce(o2.owner_id, o2.owner::text) as owner
    into v_obj from storage.objects o2 where o2.bucket_id = 'workshop-files' and o2.name = p_path;
  if v_obj is null or v_obj.owner is distinct from auth.uid()::text then
    raise exception 'Arquivo não encontrado.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.attachment_checks c where c.storage_path = p_path and c.ok and c.mime_type = v_obj.mime
                   and c.checked_at > now() - interval '2 hours') then
    raise exception 'O arquivo ainda não foi conferido. Envie de novo.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.workshop_os_photos where order_id = o.id and removed_at is null) >= 60 then
    raise exception 'Limite de 60 fotos por ordem de serviço.' using errcode = 'P0001';
  end if;
  insert into public.workshop_os_photos (organization_id, order_id, phase, storage_path, mime_type, file_size, caption, created_by)
  values (p_org, o.id, p_phase, p_path, v_obj.mime, v_obj.size, nullif(btrim(coalesce(p_caption, '')), ''), auth.uid())
  returning id into v_id;
  perform public.wo_event(p_org, o.id, 'photo_added', null, null, jsonb_build_object('phase', p_phase));
  return v_id;
end;
$$;

create or replace function public.workshop_remove_os_photo(p_org uuid, p_order uuid, p_photo uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare o public.workshop_service_orders;
begin
  o := public.wo_lock(p_org, p_order, 'execute_orders');
  if public.wo_is_closed(o.status) then raise exception 'Ordem de serviço encerrada: as fotos ficam preservadas.' using errcode = 'P0001'; end if;
  update public.workshop_os_photos set removed_at = now(), removed_by = auth.uid()
   where id = p_photo and order_id = o.id and removed_at is null;
  if found then perform public.wo_event(p_org, o.id, 'photo_removed'); end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Conclusão, retirada, entrega, cancelamento
-- -----------------------------------------------------------------------------
create or replace function public.workshop_complete_order(p_org uuid, p_order uuid, p_km_out int, p_notes text,
                                                          p_adjustment_cents bigint default 0, p_adjustment_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare o public.workshop_service_orders;
        v_pending int;
        v_done int;
        v_total bigint;
        v_code text := upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 10));
begin
  o := public.wo_lock(p_org, p_order, 'manage_quotes');
  if public.wo_is_closed(o.status) then raise exception 'Ordem de serviço já encerrada.' using errcode = 'P0001'; end if;
  select count(*) filter (where status = 'pending'), count(*) filter (where status = 'done'),
         coalesce(sum(subtotal_cents - discount_cents) filter (where status = 'done'), 0)
    into v_pending, v_done, v_total
    from public.workshop_service_order_items where order_id = o.id;
  if v_pending > 0 then
    raise exception 'Confira todos os serviços: marque cada item como executado ou não executado (% pendente%).', v_pending,
      case when v_pending = 1 then '' else 's' end using errcode = 'P0001';
  end if;
  if v_done = 0 then raise exception 'Nenhum serviço executado. Se nada foi feito, cancele a OS.' using errcode = 'P0001'; end if;
  if p_km_out is null or p_km_out < 0 then raise exception 'Informe a quilometragem final.' using errcode = '22023'; end if;
  if o.km_in is not null and p_km_out < o.km_in then
    raise exception 'A quilometragem final (%) é menor que a de entrada (%).', p_km_out, o.km_in using errcode = '22023';
  end if;
  if coalesce(p_adjustment_cents, 0) <> 0 and char_length(btrim(coalesce(p_adjustment_reason, ''))) < 3 then
    raise exception 'Explique o ajuste no valor final.' using errcode = '22023';
  end if;
  if v_total + coalesce(p_adjustment_cents, 0) < 0 then raise exception 'Valor final não pode ser negativo.' using errcode = '22023'; end if;
  update public.workshop_service_orders
     set status = 'completed', km_out = p_km_out, completion_notes = nullif(btrim(coalesce(p_notes, '')), ''),
         adjustment_cents = coalesce(p_adjustment_cents, 0),
         adjustment_reason = case when coalesce(p_adjustment_cents, 0) <> 0 then btrim(p_adjustment_reason) end,
         final_total_cents = v_total + coalesce(p_adjustment_cents, 0),
         completed_at = now(), completed_by = auth.uid(), receipt_code = v_code
   where id = o.id;
  if o.vehicle_id is not null then
    update public.workshop_vehicles set km = greatest(coalesce(km, 0), p_km_out) where id = o.vehicle_id and organization_id = p_org;
  end if;
  perform public.wo_event(p_org, o.id, 'completed', o.status, 'completed',
                          jsonb_build_object('final_total_cents', v_total + coalesce(p_adjustment_cents, 0), 'km_out', p_km_out, 'receipt_code', v_code));
  return jsonb_build_object('final_total_cents', v_total + coalesce(p_adjustment_cents, 0), 'receipt_code', v_code);
end;
$$;

create or replace function public.workshop_notify_pickup(p_org uuid, p_order uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare o public.workshop_service_orders;
begin
  o := public.wo_lock(p_org, p_order, 'manage_quotes');
  if o.status not in ('completed', 'awaiting_pickup') then
    raise exception 'Conclua a OS antes de avisar a retirada.' using errcode = 'P0001';
  end if;
  if o.status = 'completed' then
    update public.workshop_service_orders set status = 'awaiting_pickup' where id = o.id;
  end if;
  perform public.wo_event(p_org, o.id, 'pickup_notified', o.status, 'awaiting_pickup');
end;
$$;

create or replace function public.workshop_deliver_order(p_org uuid, p_order uuid, p_delivered_to text, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare o public.workshop_service_orders;
begin
  o := public.wo_lock(p_org, p_order, 'manage_quotes');
  if o.status not in ('completed', 'awaiting_pickup') then
    raise exception 'Só OS concluída pode ser entregue.' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_delivered_to, ''))) < 3 then
    raise exception 'Informe quem retirou a moto.' using errcode = '22023';
  end if;
  update public.workshop_service_orders
     set status = 'delivered', delivered_at = now(), delivered_by = auth.uid(), delivered_to_name = btrim(p_delivered_to),
         completion_notes = coalesce(completion_notes, '') || case when nullif(btrim(coalesce(p_notes, '')), '') is not null
                                                                   then E'\nEntrega: ' || btrim(p_notes) else '' end
   where id = o.id;
  perform public.wo_event(p_org, o.id, 'delivered', o.status, 'delivered', jsonb_build_object('delivered_to', btrim(p_delivered_to)));
end;
$$;

create or replace function public.workshop_cancel_order(p_org uuid, p_order uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare o public.workshop_service_orders;
begin
  o := public.wo_lock(p_org, p_order, 'manage_quotes');
  if o.status in ('completed', 'awaiting_pickup', 'delivered') then
    raise exception 'OS concluída não pode ser cancelada.' using errcode = 'P0001';
  end if;
  if o.status = 'canceled' then return; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Informe o motivo do cancelamento.' using errcode = '22023'; end if;
  update public.workshop_service_orders set status = 'canceled', canceled_reason = btrim(p_reason) where id = o.id;
  update public.workshop_os_shares set revoked_at = now() where order_id = o.id and revoked_at is null;
  perform public.wo_event(p_org, o.id, 'canceled', o.status, 'canceled', jsonb_build_object('reason', btrim(p_reason)));
end;
$$;

-- -----------------------------------------------------------------------------
-- Leitura
-- -----------------------------------------------------------------------------
create or replace function public.workshop_list_orders(p_org uuid, p_status text default null, p_search text default null, p_mine boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_q text := nullif(lower(btrim(coalesce(p_search, ''))), '');
        v_num int := case when coalesce(p_search, '') ~ '^\s*#?[0-9]{1,9}\s*$' then regexp_replace(p_search, '[^0-9]', '', 'g')::int end;
        v_plate text := nullif(public.normalize_plate(coalesce(p_search, '')), '');
        v_manager boolean;
begin
  perform public.wq_assert(p_org, 'member');
  v_manager := public.has_org_permission(p_org, 'manage_quotes');
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.created_at desc)
      from (
        select o.id, o.number, o.status, o.created_at, o.due_date, o.completed_at, o.delivered_at, o.final_total_cents,
               o.quote_id, (select q.number from public.workshop_quotes q where q.id = o.quote_id) as quote_number,
               c.id as customer_id, c.full_name as customer_name, v.brand, v.model, v.plate,
               o.mechanic_user_id, (select full_name from public.profiles where id = o.mechanic_user_id) as mechanic_name,
               (select count(*) from public.workshop_service_order_items i where i.order_id = o.id) as items,
               (select count(*) from public.workshop_service_order_items i where i.order_id = o.id and i.status = 'done') as items_done,
               (select coalesce(sum(i.subtotal_cents - i.discount_cents), 0) from public.workshop_service_order_items i
                 where i.order_id = o.id and i.status <> 'not_done') as authorized_cents
          from public.workshop_service_orders o
          join public.workshop_customers c on c.id = o.customer_id and c.organization_id = p_org
          left join public.workshop_vehicles v on v.id = o.vehicle_id and v.organization_id = p_org
         where o.organization_id = p_org
           and (v_manager is true and not coalesce(p_mine, false) or o.mechanic_user_id = auth.uid())
           and (p_status is null or p_status = ''
                or (p_status = 'active' and o.status not in ('completed', 'awaiting_pickup', 'delivered', 'canceled'))
                or (p_status = 'ready' and o.status in ('completed', 'awaiting_pickup'))
                or o.status = p_status)
           and (v_q is null or v_num = o.number or lower(c.full_name) like '%' || v_q || '%'
                or lower(coalesce(v.brand, '') || ' ' || coalesce(v.model, '')) like '%' || v_q || '%'
                or (v_plate is not null and v.plate like v_plate || '%'))
         limit 500
      ) x), '[]'::jsonb);
end;
$$;

create or replace function public.workshop_get_order(p_org uuid, p_order uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare o public.workshop_service_orders;
begin
  perform public.wq_assert(p_org, 'member');
  select * into o from public.workshop_service_orders where id = p_order and organization_id = p_org;
  if not found then raise exception 'Ordem de serviço não encontrada.' using errcode = 'P0002'; end if;
  return to_jsonb(o) || jsonb_build_object(
    'mechanic_name', (select full_name from public.profiles where id = o.mechanic_user_id),
    'created_by_name', (select full_name from public.profiles where id = o.created_by),
    'completed_by_name', (select full_name from public.profiles where id = o.completed_by),
    'delivered_by_name', (select full_name from public.profiles where id = o.delivered_by),
    'customer', (select to_jsonb(c) - 'cpf' - 'notes' from public.workshop_customers c where c.id = o.customer_id and c.organization_id = p_org),
    'vehicle', (select to_jsonb(v) from public.workshop_vehicles v where v.id = o.vehicle_id and v.organization_id = p_org),
    'quote', (select jsonb_build_object('id', q.id, 'number', q.number, 'status', q.status) from public.workshop_quotes q where q.id = o.quote_id),
    'complements', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'number', q.number, 'status', q.status,
                                'included', exists (select 1 from public.workshop_service_order_items i where i.order_id = o.id and i.quote_id = q.id))
                              order by q.number)
                               from public.workshop_quotes q where o.quote_id is not null and q.parent_quote_id = o.quote_id
                                and q.organization_id = p_org and q.status <> 'canceled'), '[]'::jsonb),
    'workshop', (select jsonb_build_object('business_name', w.business_name, 'cnpj', w.cnpj, 'phone', w.phone, 'whatsapp', w.whatsapp,
                          'email', w.email, 'address', w.address, 'city', w.city, 'state', w.state, 'logo_url', w.logo_url)
                   from public.workshops w where w.organization_id = p_org),
    'items', coalesce((select jsonb_agg(to_jsonb(i) || jsonb_build_object(
                         'executed_by_name', (select full_name from public.profiles where id = i.executed_by),
                         'quote_number', (select q.number from public.workshop_quotes q where q.id = i.quote_id))
                       order by i.position)
                        from public.workshop_service_order_items i where i.order_id = o.id), '[]'::jsonb),
    'inspections', coalesce((select jsonb_object_agg(x.phase, to_jsonb(x) - 'customer_ack_ip' || jsonb_build_object(
                               'recorded_by_name', (select full_name from public.profiles where id = x.recorded_by)))
                               from public.workshop_inspections x where x.order_id = o.id), '{}'::jsonb),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'phase', p.phase, 'storage_path', p.storage_path,
                          'caption', p.caption, 'created_at', p.created_at,
                          'created_by_name', (select full_name from public.profiles where id = p.created_by)) order by p.created_at)
                         from public.workshop_os_photos p where p.order_id = o.id and p.removed_at is null), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(e) - 'actor_user_id' order by e.created_at desc)
                         from public.workshop_service_order_events e where e.order_id = o.id), '[]'::jsonb),
    'links', coalesce((select jsonb_agg(jsonb_build_object('purpose', s.purpose, 'created_at', s.created_at, 'expires_at', s.expires_at,
                          'first_viewed_at', s.first_viewed_at, 'view_count', s.view_count,
                          'active', s.revoked_at is null and s.expires_at > now()) order by s.created_at desc)
                        from public.workshop_os_shares s where s.order_id = o.id), '[]'::jsonb),
    'team', (select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'name', coalesce(p.full_name, 'Membro da equipe')) order by p.full_name), '[]'::jsonb)
               from public.organization_members m left join public.profiles p on p.id = m.user_id
              where m.organization_id = p_org and m.status = 'active' and (m.role = 'responsible' or m.can_execute_orders)));
end;
$$;

-- -----------------------------------------------------------------------------
-- Links para o cliente: ciência da entrada e comprovante de conclusão
-- -----------------------------------------------------------------------------
create or replace function public.workshop_create_order_link(p_org uuid, p_order uuid, p_purpose text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare o public.workshop_service_orders;
        v_token text := public.wq_new_token();
        v_exp timestamptz := now() + interval '30 days';
begin
  o := public.wo_lock(p_org, p_order, 'manage_quotes');
  if p_purpose not in ('entry_ack', 'receipt') then raise exception 'Link inválido.' using errcode = '22023'; end if;
  if o.status = 'canceled' then raise exception 'OS cancelada.' using errcode = 'P0001'; end if;
  if p_purpose = 'entry_ack' and not exists (select 1 from public.workshop_inspections where order_id = o.id and phase = 'entry') then
    raise exception 'Preencha o checklist de entrada antes de pedir a ciência do cliente.' using errcode = 'P0001';
  end if;
  if p_purpose = 'receipt' and o.status not in ('completed', 'awaiting_pickup', 'delivered') then
    raise exception 'O comprovante fica disponível depois da conclusão.' using errcode = 'P0001';
  end if;
  update public.workshop_os_shares set revoked_at = now() where order_id = o.id and purpose = p_purpose and revoked_at is null;
  insert into public.workshop_os_shares (organization_id, order_id, purpose, token_hash, created_by, expires_at)
  values (p_org, o.id, p_purpose, encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid(), v_exp);
  perform public.wo_event(p_org, o.id, 'link_created', null, null, jsonb_build_object('purpose', p_purpose));
  return jsonb_build_object('token', v_token, 'expires_at', v_exp);
end;
$$;

create or replace function public.wo_share_by_token(p_token text)
returns public.workshop_os_shares
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare s public.workshop_os_shares;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then return null; end if;
  if not public.anon_rate_limit_ok('quote_link', 'quote_link_requests_per_hour') then
    raise exception 'Muitas consultas a partir desta conexão. Tente de novo em alguns minutos.' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  select * into s from public.workshop_os_shares where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  return s;
end;
$$;
revoke execute on function public.wo_share_by_token(text) from public, anon, authenticated;

create or replace function public.get_service_order_by_token(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare s public.workshop_os_shares;
        o public.workshop_service_orders;
begin
  s := public.wo_share_by_token(p_token);
  if s.id is null then return jsonb_build_object('state', 'not_found'); end if;
  if s.revoked_at is not null or s.expires_at <= now() then
    return jsonb_build_object('state', 'inactive', 'workshop', (select business_name from public.workshops where organization_id = s.organization_id));
  end if;
  select * into o from public.workshop_service_orders where id = s.order_id;
  update public.workshop_os_shares set first_viewed_at = coalesce(first_viewed_at, now()), view_count = view_count + 1 where id = s.id;
  return jsonb_build_object(
    'state', 'open', 'purpose', s.purpose, 'number', o.number, 'status', o.status, 'opened_at', o.created_at,
    'km_in', o.km_in, 'km_out', o.km_out, 'completed_at', o.completed_at, 'delivered_at', o.delivered_at,
    'delivered_to_name', o.delivered_to_name, 'receipt_code', case when s.purpose = 'receipt' then o.receipt_code end,
    'completion_notes', case when s.purpose = 'receipt' then o.completion_notes end,
    'final_total_cents', case when s.purpose = 'receipt' then o.final_total_cents end,
    'adjustment_cents', case when s.purpose = 'receipt' then o.adjustment_cents end,
    'adjustment_reason', case when s.purpose = 'receipt' then o.adjustment_reason end,
    'customer_name', (select full_name from public.workshop_customers where id = o.customer_id),
    'vehicle', (select jsonb_build_object('brand', v.brand, 'model', v.model, 'version', v.version, 'year', v.year, 'plate', v.plate, 'color', v.color)
                  from public.workshop_vehicles v where v.id = o.vehicle_id),
    'workshop', (select jsonb_build_object('business_name', w.business_name, 'cnpj', w.cnpj, 'phone', w.phone, 'whatsapp', w.whatsapp,
                          'email', w.email, 'address', w.address, 'city', w.city, 'state', w.state, 'logo_url', w.logo_url)
                   from public.workshops w where w.organization_id = o.organization_id),
    'entry', (select jsonb_build_object('items', x.items, 'fuel_level', x.fuel_level, 'keys_count', x.keys_count, 'km', x.km, 'notes', x.notes,
                       'recorded_at', x.recorded_at, 'customer_ack_at', x.customer_ack_at, 'customer_ack_name', x.customer_ack_name)
                from public.workshop_inspections x where x.order_id = o.id and x.phase = 'entry'),
    'exit', case when s.purpose = 'receipt' then (select jsonb_build_object('items', x.items, 'km', x.km, 'notes', x.notes, 'recorded_at', x.recorded_at)
                from public.workshop_inspections x where x.order_id = o.id and x.phase = 'exit') end,
    'photos_count', (select count(*) from public.workshop_os_photos p where p.order_id = o.id and p.removed_at is null),
    'items', case when s.purpose = 'receipt' then coalesce((select jsonb_agg(jsonb_build_object('position', i.position, 'kind', i.kind,
                       'description', i.description, 'quantity', i.quantity, 'subtotal_cents', i.subtotal_cents - i.discount_cents,
                       'status', i.status, 'part_brand', i.part_brand, 'part_code', i.part_code, 'notes', i.notes,
                       'origin', case i.source when 'manual' then 'Autorizado ' || coalesce(i.auth_method, '') ||
                                  ' por ' || coalesce(i.auth_by_name, '') else 'Orçamento nº ' ||
                                  (select q.number from public.workshop_quotes q where q.id = i.quote_id) end) order by i.position)
                       from public.workshop_service_order_items i where i.order_id = o.id), '[]'::jsonb) end);
end;
$$;

create or replace function public.ack_service_order_entry(p_token text, p_name text, p_confirmed boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare s public.workshop_os_shares;
        x public.workshop_inspections;
        v_headers jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
        v_name text := btrim(coalesce(p_name, ''));
begin
  s := public.wo_share_by_token(p_token);
  if s.id is null or s.purpose <> 'entry_ack' then raise exception 'Link inválido.' using errcode = 'P0002'; end if;
  if s.revoked_at is not null or s.expires_at <= now() then raise exception 'Este link não vale mais. Peça um novo à oficina.' using errcode = 'P0001'; end if;
  if not coalesce(p_confirmed, false) then raise exception 'Confirme que conferiu o estado da moto.' using errcode = '22023'; end if;
  if char_length(v_name) < 3 or char_length(v_name) > 120 then raise exception 'Informe o seu nome completo.' using errcode = '22023'; end if;
  select * into x from public.workshop_inspections where order_id = s.order_id and phase = 'entry' for update;
  if not found then raise exception 'Checklist não encontrado.' using errcode = 'P0002'; end if;
  if x.customer_ack_at is not null then raise exception 'A ciência já foi registrada.' using errcode = 'P0001'; end if;
  update public.workshop_inspections
     set customer_ack_at = now(), customer_ack_name = v_name,
         customer_ack_ip = left(nullif(trim(coalesce(v_headers ->> 'cf-connecting-ip', split_part(v_headers ->> 'x-forwarded-for', ',', 1), v_headers ->> 'x-real-ip')), ''), 64)
   where id = x.id;
  perform public.wo_event(s.organization_id, s.order_id, 'customer_ack', null, null, jsonb_build_object('name', v_name), 'Cliente: ' || v_name);
  return public.get_service_order_by_token(p_token);
end;
$$;

-- -----------------------------------------------------------------------------
-- Painel e ficha do cliente com as OS
-- -----------------------------------------------------------------------------
create or replace function public.workshop_orders_summary(p_org uuid, p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_from timestamptz := ((coalesce(p_from, date_trunc('month', now() at time zone 'America/Sao_Paulo')::date))::timestamp at time zone 'America/Sao_Paulo');
        v_to   timestamptz := ((coalesce(p_to, (now() at time zone 'America/Sao_Paulo')::date) + 1)::timestamp at time zone 'America/Sao_Paulo');
begin
  perform public.wq_assert(p_org, 'member');
  return (
    select jsonb_build_object(
      'active', count(*) filter (where o.status not in ('completed', 'awaiting_pickup', 'delivered', 'canceled')),
      'in_progress', count(*) filter (where o.status = 'in_progress'),
      'awaiting_diagnosis', count(*) filter (where o.status = 'awaiting_diagnosis'),
      'awaiting_parts', count(*) filter (where o.status = 'awaiting_parts'),
      'ready_pickup', count(*) filter (where o.status in ('completed', 'awaiting_pickup')),
      'late', count(*) filter (where o.status not in ('completed', 'awaiting_pickup', 'delivered', 'canceled')
                                 and o.due_date < (now() at time zone 'America/Sao_Paulo')::date),
      'completed_period', count(*) filter (where o.completed_at >= v_from and o.completed_at < v_to),
      'completed_cents_period', coalesce(sum(o.final_total_cents) filter (where o.completed_at >= v_from and o.completed_at < v_to), 0),
      'in_execution_cents', coalesce(sum((select coalesce(sum(i.subtotal_cents - i.discount_cents), 0) from public.workshop_service_order_items i
                                           where i.order_id = o.id and i.status <> 'not_done'))
                                     filter (where o.status not in ('completed', 'awaiting_pickup', 'delivered', 'canceled')), 0),
      'mine', count(*) filter (where o.mechanic_user_id = auth.uid() and o.status not in ('completed', 'awaiting_pickup', 'delivered', 'canceled')))
      from public.workshop_service_orders o where o.organization_id = p_org);
end;
$$;

create or replace function public.workshop_customer_orders(p_org uuid, p_customer uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.wq_assert(p_org, 'member');
  return coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'number', o.number, 'status', o.status, 'created_at', o.created_at,
                                     'final_total_cents', o.final_total_cents, 'vehicle_id', o.vehicle_id) order by o.created_at desc)
                     from public.workshop_service_orders o where o.organization_id = p_org and o.customer_id = p_customer), '[]'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------
-- Aviso novo: OS designada ao mecânico
-- -----------------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'workshop_access_request', 'workshop_access_decided', 'workshop_access_revoked', 'workshop_service',
  'transfer_received', 'transfer_decided', 'reminder_due', 'subscription_ending', 'payment_approved',
  'payment_failed', 'storage_limit', 'claim_decided', 'ownership_notice', 'admin_notice',
  'care_checkup', 'oil_change', 'quote_viewed', 'quote_decided', 'quote_expired', 'service_order_assigned'));

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
                      'payment_approved', 'payment_failed', 'storage_limit', 'claim_decided', 'ownership_notice', 'admin_notice',
                      'quote_viewed', 'quote_decided', 'quote_expired', 'service_order_assigned']) k(kind)
    left join public.notification_preferences p on p.user_id = auth.uid() and p.kind = k.kind;
$$;

-- -----------------------------------------------------------------------------
-- Permissões de execução
-- -----------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'get_org_member_extra_permissions(uuid)', 'set_org_member_extra_permissions(uuid, boolean, boolean, boolean)',
    'workshop_create_order_from_quote(uuid, uuid)', 'workshop_create_order_manual(uuid, uuid, uuid, text, text, text, jsonb, integer)',
    'workshop_add_order_item(uuid, uuid, jsonb, text, text, text)', 'workshop_add_complement_to_order(uuid, uuid, uuid)',
    'workshop_set_order_status(uuid, uuid, text, text)', 'workshop_update_order(uuid, uuid, jsonb)',
    'workshop_update_order_item(uuid, uuid, uuid, jsonb)', 'workshop_set_technical_notes(uuid, uuid, text)',
    'workshop_save_inspection(uuid, uuid, text, jsonb)', 'workshop_register_os_photo(uuid, uuid, text, text, text)',
    'workshop_remove_os_photo(uuid, uuid, uuid)', 'workshop_complete_order(uuid, uuid, integer, text, bigint, text)',
    'workshop_notify_pickup(uuid, uuid)', 'workshop_deliver_order(uuid, uuid, text, text)', 'workshop_cancel_order(uuid, uuid, text)',
    'workshop_list_orders(uuid, text, text, boolean)', 'workshop_get_order(uuid, uuid)', 'workshop_create_order_link(uuid, uuid, text)',
    'workshop_orders_summary(uuid, date, date)', 'workshop_customer_orders(uuid, uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['get_service_order_by_token(text)', 'ack_service_order_entry(text, text, boolean)'] loop
    execute format('revoke execute on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
  foreach f in array array['wo_copy_quote_items(uuid, uuid, uuid, text)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
