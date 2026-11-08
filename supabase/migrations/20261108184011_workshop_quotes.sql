-- =============================================================================
-- Moto Passaporte — Migração: módulo Oficina, Fase 1 (PRD 2.1 §25 — atendimento e orçamento)
-- Objetivo: clientes e motos da própria oficina (independentes do passaporte), catálogo de
--           serviços, tabelas de preço com sugestão do preço mais específico, orçamentos com
--           versões imutáveis depois de enviados, link seguro de aprovação (sem conta),
--           aprovação integral/parcial/recusa com registro de aceite e trilha de eventos.
-- Regras: orçamento NUNCA gera manutenção (PRD 2.1 §17.4). Nada é gravado direto pelo
--         navegador: só por funções que conferem a organização pela sessão (§19.9).
--         Uma oficina nunca enxerga dados de outra (§20.1). Gratuito, sem limites (§29).
-- Permissões novas em organization_members (o responsável tem todas):
--   can_manage_quotes — clientes, motos e orçamentos (atendente). Padrão: ligado.
--   can_manage_prices — catálogo de serviços e tabelas de preço. Padrão: desligado.
-- Reversão: supabase/rollback/20261108184011_workshop_quotes.down.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Permissões da equipe
-- -----------------------------------------------------------------------------
alter table public.organization_members
  add column if not exists can_manage_quotes boolean not null default true,
  add column if not exists can_manage_prices boolean not null default false;

comment on column public.organization_members.can_manage_quotes is
  'Funcionário pode cadastrar clientes e motos da oficina e fazer orçamentos (PRD 2.1 §16).';
comment on column public.organization_members.can_manage_prices is
  'Funcionário pode mexer no catálogo de serviços e nas tabelas de preço (PRD 2.1 §16).';

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
           or (p_permission = 'manage_prices' and m.can_manage_prices))
  );
$$;

create or replace function public.wq_assert(p_org uuid, p_permission text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or p_org is null or not public.has_org_permission(p_org, p_permission) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function public.wq_assert(uuid, text) from public, anon, authenticated;

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
    'manage_prices', m.role = 'responsible' or m.can_manage_prices);
end;
$$;

create or replace function public.get_org_member_extra_permissions(p_org uuid)
returns table (member_id uuid, can_manage_quotes boolean, can_manage_prices boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_org_responsible(p_org) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  return query select m.id, m.can_manage_quotes, m.can_manage_prices
    from public.organization_members m where m.organization_id = p_org and m.status = 'active';
end;
$$;

create or replace function public.set_org_member_extra_permissions(p_member uuid, p_manage_quotes boolean, p_manage_prices boolean)
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
         can_manage_prices = coalesce(p_manage_prices, can_manage_prices)
   where id = p_member;
end;
$$;

-- -----------------------------------------------------------------------------
-- Numeração por oficina
-- -----------------------------------------------------------------------------
create table public.workshop_counters (
  organization_id uuid not null references public.organizations (id) on delete restrict,
  kind            text not null check (kind in ('quote', 'service_order')),
  last_value      integer not null default 0,
  primary key (organization_id, kind)
);
alter table public.workshop_counters enable row level security;
revoke all on public.workshop_counters from anon, authenticated;

create or replace function public.wq_next_number(p_org uuid, p_kind text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v int;
begin
  insert into public.workshop_counters (organization_id, kind, last_value) values (p_org, p_kind, 1)
  on conflict (organization_id, kind) do update set last_value = public.workshop_counters.last_value + 1
  returning last_value into v;
  return v;
end;
$$;
revoke execute on function public.wq_next_number(uuid, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Clientes da oficina (PRD 2.1 §4) — não dependem de conta no Moto Passaporte
-- -----------------------------------------------------------------------------
create table public.workshop_customers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  full_name       text not null check (char_length(full_name) between 2 and 120),
  phone           text check (phone is null or phone ~ '^[0-9]{10,13}$'),
  whatsapp        text check (whatsapp is null or whatsapp ~ '^[0-9]{10,13}$'),
  email           text check (email is null or (char_length(email) <= 160 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  cpf             text check (cpf is null or cpf ~ '^[0-9]{11}$'),
  address         text check (address is null or char_length(address) <= 240),
  birth_date      date check (birth_date is null or birth_date between date '1900-01-01' and current_date),
  notes           text check (notes is null or char_length(notes) <= 2000),
  first_visit_at  date not null default current_date,
  source          text not null default 'balcao'
                  check (source in ('balcao', 'whatsapp', 'indicacao', 'redes_sociais', 'google', 'passaporte', 'outro')),
  status          text not null default 'active' check (status in ('active', 'archived')),
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, id)
);
comment on table public.workshop_customers is
  'Clientes de cada oficina (PRD 2.1 §4). Dado comercial da oficina; não é vínculo com conta do Moto Passaporte. CPF é opcional.';
create index workshop_customers_org_name_idx on public.workshop_customers (organization_id, lower(full_name));

-- Motos atendidas pela oficina (PRD 2.1 §5.2). Não cria passaporte nem titularidade.
create table public.workshop_vehicles (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  customer_id     uuid not null,
  motorcycle_id   uuid references public.motorcycles (id) on delete set null,
  brand           text not null check (char_length(brand) between 1 and 60),
  model           text not null check (char_length(model) between 1 and 80),
  version         text check (version is null or char_length(version) <= 80),
  year            smallint check (year is null or year between 1900 and 2100),
  displacement_cc integer check (displacement_cc is null or displacement_cc between 1 and 10000),
  plate           text check (plate is null or plate ~ '^[A-Z0-9]{7}$'),
  km              integer check (km is null or km between 0 and 9999999),
  color           text check (color is null or char_length(color) <= 40),
  notes           text check (notes is null or char_length(notes) <= 2000),
  status          text not null default 'active' check (status in ('active', 'archived')),
  linked_by       uuid references auth.users (id) on delete set null,
  linked_at       timestamptz,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, customer_id) references public.workshop_customers (organization_id, id) on delete restrict
);
comment on table public.workshop_vehicles is
  'Motos atendidas pela oficina (registro comercial). motorcycle_id só é preenchido com autorização aprovada do titular (PRD 2.1 §5).';
comment on column public.workshop_vehicles.motorcycle_id is
  'Vínculo com o passaporte. Só por workshop_link_vehicle_passport, com acesso aprovado; nunca por coincidência de placa.';
create index workshop_vehicles_customer_idx on public.workshop_vehicles (organization_id, customer_id);
create index workshop_vehicles_plate_idx on public.workshop_vehicles (organization_id, plate) where plate is not null;
create index workshop_vehicles_moto_idx on public.workshop_vehicles (motorcycle_id) where motorcycle_id is not null;

-- -----------------------------------------------------------------------------
-- Catálogo de serviços e tabelas de preço (PRD 2.1 §10)
-- -----------------------------------------------------------------------------
create table public.workshop_service_catalog (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete restrict,
  name                text not null check (char_length(name) between 2 and 120),
  category            text not null default 'outros' check (category in (
                        'motor', 'lubrificacao', 'transmissao', 'freios', 'pneus', 'suspensao', 'eletrica', 'injecao',
                        'arrefecimento', 'embreagem', 'revisoes', 'acessorios', 'estetica', 'outros')),
  description         text check (description is null or char_length(description) <= 1000),
  estimated_minutes   integer check (estimated_minutes is null or estimated_minutes between 1 and 10000),
  default_price_cents bigint check (default_price_cents is null or default_price_cents between 0 and 100000000),
  charge_type         text not null default 'fixed' check (charge_type in ('fixed', 'hourly', 'from')),
  active              boolean not null default true,
  notes               text check (notes is null or char_length(notes) <= 1000),
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (organization_id, id)
);
create index workshop_service_catalog_org_idx on public.workshop_service_catalog (organization_id, active, lower(name));

create table public.workshop_price_tables (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name            text not null check (char_length(name) between 2 and 80),
  description     text check (description is null or char_length(description) <= 500),
  is_default      boolean not null default false,
  active          boolean not null default true,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, id)
);
create unique index workshop_price_tables_one_default on public.workshop_price_tables (organization_id) where is_default;

create table public.workshop_service_prices (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  table_id        uuid not null,
  service_id      uuid not null,
  brand           text check (brand is null or char_length(brand) between 1 and 60),
  model           text check (model is null or char_length(model) between 1 and 80),
  year_from       smallint check (year_from is null or year_from between 1900 and 2100),
  year_to         smallint check (year_to is null or year_to between 1900 and 2100),
  cc_min          integer check (cc_min is null or cc_min between 0 and 10000),
  cc_max          integer check (cc_max is null or cc_max between 0 and 10000),
  complexity      text check (complexity is null or complexity in ('simples', 'media', 'alta')),
  price_cents     bigint not null check (price_cents between 0 and 100000000),
  notes           text check (notes is null or char_length(notes) <= 300),
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (model is null or brand is not null),
  check (year_from is null or year_to is null or year_from <= year_to),
  check (cc_min is null or cc_max is null or cc_min <= cc_max),
  foreign key (organization_id, table_id) references public.workshop_price_tables (organization_id, id) on delete cascade,
  foreign key (organization_id, service_id) references public.workshop_service_catalog (organization_id, id) on delete cascade
);
comment on table public.workshop_service_prices is
  'Preço de um serviço numa tabela, opcionalmente por marca/modelo/ano/cilindrada/complexidade (PRD 2.1 §10.2). Campo vazio vale para todos.';
create index workshop_service_prices_lookup_idx on public.workshop_service_prices (organization_id, table_id, service_id);

-- -----------------------------------------------------------------------------
-- Orçamentos (PRD 2.1 §6 e §7)
-- -----------------------------------------------------------------------------
create table public.workshop_quotes (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations (id) on delete restrict,
  number               integer not null,
  customer_id          uuid not null,
  vehicle_id           uuid,
  parent_quote_id      uuid,
  complement_reason    text check (complement_reason is null or char_length(complement_reason) between 3 and 500),
  status               text not null default 'draft' check (status in (
                         'draft', 'sent', 'viewed', 'partially_approved', 'approved', 'rejected', 'expired', 'canceled')),
  current_version      integer not null default 1,
  approved_total_cents bigint,
  decided_at           timestamptz,
  canceled_reason      text check (canceled_reason is null or char_length(canceled_reason) <= 500),
  created_by           uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (organization_id, number),
  unique (organization_id, id),
  check (parent_quote_id is null or complement_reason is not null),
  foreign key (organization_id, customer_id) references public.workshop_customers (organization_id, id) on delete restrict,
  foreign key (organization_id, vehicle_id) references public.workshop_vehicles (organization_id, id) on delete restrict,
  foreign key (organization_id, parent_quote_id) references public.workshop_quotes (organization_id, id) on delete restrict
);
comment on table public.workshop_quotes is
  'Orçamento da oficina. Nunca gera registro de manutenção (PRD 2.1 §17.4). Complementar aponta para o orçamento original (§7.6).';
create index workshop_quotes_org_status_idx on public.workshop_quotes (organization_id, status, created_at desc);
create index workshop_quotes_customer_idx on public.workshop_quotes (organization_id, customer_id);

create table public.workshop_quote_versions (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  quote_id         uuid not null,
  version_no       integer not null check (version_no >= 1),
  status           text not null default 'draft' check (status in ('draft', 'sent', 'decided', 'superseded', 'canceled')),
  km               integer check (km is null or km between 0 and 9999999),
  problem          text check (problem is null or char_length(problem) <= 2000),
  diagnosis        text check (diagnosis is null or char_length(diagnosis) <= 2000),
  notes            text check (notes is null or char_length(notes) <= 2000),
  payment_terms    text check (payment_terms is null or char_length(payment_terms) <= 500),
  estimated_days   integer check (estimated_days is null or estimated_days between 0 and 365),
  valid_until      date not null,
  price_table_id   uuid,
  discount_type    text not null default 'none' check (discount_type in ('none', 'percent', 'amount')),
  discount_value   numeric(12, 2) not null default 0 check (discount_value >= 0),
  discount_set_by  uuid references auth.users (id) on delete set null,
  subtotal_cents   bigint not null default 0,
  discount_cents   bigint not null default 0,
  total_cents      bigint not null default 0,
  change_reason    text check (change_reason is null or char_length(change_reason) <= 500),
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  sent_at          timestamptz,
  sent_by          uuid references auth.users (id) on delete set null,
  unique (quote_id, version_no),
  unique (organization_id, id),
  check (discount_type <> 'percent' or discount_value <= 100),
  foreign key (organization_id, quote_id) references public.workshop_quotes (organization_id, id) on delete restrict,
  foreign key (organization_id, price_table_id) references public.workshop_price_tables (organization_id, id) on delete set null (price_table_id)
);
comment on table public.workshop_quote_versions is
  'Versões do orçamento. Só a versão em rascunho é editável; enviada vira registro fixo e mudanças geram nova versão (PRD 2.1 §6.4).';

create table public.workshop_quote_items (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  version_id       uuid not null,
  position         integer not null check (position between 1 and 200),
  kind             text not null check (kind in ('labor', 'part', 'product', 'material', 'outsourced', 'other')),
  description      text not null check (char_length(description) between 2 and 300),
  service_id       uuid,
  quantity         numeric(10, 3) not null check (quantity > 0 and quantity <= 100000),
  unit_price_cents bigint not null check (unit_price_cents between 0 and 100000000),
  subtotal_cents   bigint not null,
  notes            text check (notes is null or char_length(notes) <= 500),
  unique (version_id, position),
  foreign key (organization_id, version_id) references public.workshop_quote_versions (organization_id, id) on delete cascade,
  foreign key (organization_id, service_id) references public.workshop_service_catalog (organization_id, id) on delete set null (service_id)
);
create index workshop_quote_items_version_idx on public.workshop_quote_items (version_id);

-- Links de aprovação (PRD 2.1 §13.3 e §20.2). Só o hash do token é guardado.
create table public.workshop_quote_shares (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  quote_id        uuid not null,
  version_id      uuid not null,
  token_hash      text not null unique,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  revoked_at      timestamptz,
  revoked_reason  text check (revoked_reason is null or revoked_reason in ('resent', 'revised', 'manual', 'canceled')),
  first_viewed_at timestamptz,
  last_viewed_at  timestamptz,
  view_count      integer not null default 0,
  decided_at      timestamptz,
  foreign key (organization_id, quote_id) references public.workshop_quotes (organization_id, id) on delete restrict,
  foreign key (organization_id, version_id) references public.workshop_quote_versions (organization_id, id) on delete restrict
);
create index workshop_quote_shares_quote_idx on public.workshop_quote_shares (quote_id);

-- Registro de aceite (PRD 2.1 §7.5). Imutável.
create table public.workshop_quote_approvals (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null,
  quote_id             uuid not null,
  version_id           uuid not null,
  share_id             uuid not null references public.workshop_quote_shares (id) on delete restrict,
  decision             text not null check (decision in ('approved', 'partial', 'rejected')),
  approved_positions   integer[] not null default '{}',
  rejected_positions   integer[] not null default '{}',
  approved_total_cents bigint not null default 0,
  signer_name          text not null check (char_length(signer_name) between 3 and 120),
  reason               text check (reason is null or char_length(reason) <= 1000),
  confirmation_text    text not null,
  terms_version        text not null,
  session_id           text check (session_id is null or session_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  ip                   text check (ip is null or char_length(ip) <= 64),
  user_agent           text check (user_agent is null or char_length(user_agent) <= 300),
  receipt_code         text not null unique,
  created_at           timestamptz not null default now(),
  foreign key (organization_id, quote_id) references public.workshop_quotes (organization_id, id) on delete restrict,
  foreign key (organization_id, version_id) references public.workshop_quote_versions (organization_id, id) on delete restrict
);
comment on table public.workshop_quote_approvals is
  'Evidência documental do aceite comercial (PRD 2.1 §7.5). Não equivale a assinatura qualificada ICP-Brasil.';
create unique index workshop_quote_approvals_one_per_version on public.workshop_quote_approvals (version_id);

-- Trilha do orçamento (PRD 2.1 §6.5 e §13.3).
create table public.workshop_quote_events (
  id              bigint generated always as identity primary key,
  organization_id uuid not null,
  quote_id        uuid not null,
  version_no      integer,
  kind            text not null check (kind in (
                    'created', 'complement_created', 'version_created', 'discount_set', 'link_created', 'link_revoked',
                    'whatsapp_prepared', 'printed', 'viewed', 'approved', 'partially_approved', 'rejected',
                    'expired', 'canceled')),
  actor_user_id   uuid references auth.users (id) on delete set null,
  actor_label     text,
  data            jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  foreign key (organization_id, quote_id) references public.workshop_quotes (organization_id, id) on delete restrict
);
create index workshop_quote_events_quote_idx on public.workshop_quote_events (quote_id, created_at);

-- -----------------------------------------------------------------------------
-- updated_at, auditoria, proteção da organização
-- -----------------------------------------------------------------------------
create or replace function public.wq_protect_org()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id <> old.organization_id then
    raise exception 'A oficina de um registro não pode ser trocada.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.wq_protect_org() from public, anon, authenticated;

-- Versões enviadas são registro fixo: só muda a situação (sent → decided/superseded/canceled).
create or replace function public.wq_protect_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Versões de orçamento não são apagadas.' using errcode = '42501';
  end if;
  if old.status <> 'draft' and (
       new.km is distinct from old.km or new.problem is distinct from old.problem
       or new.diagnosis is distinct from old.diagnosis or new.notes is distinct from old.notes
       or new.payment_terms is distinct from old.payment_terms or new.estimated_days is distinct from old.estimated_days
       or new.valid_until is distinct from old.valid_until or new.discount_type is distinct from old.discount_type
       or new.discount_value is distinct from old.discount_value or new.total_cents is distinct from old.total_cents
       or new.subtotal_cents is distinct from old.subtotal_cents) then
    raise exception 'Orçamento enviado não pode ser alterado; crie uma nova versão.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.wq_protect_version() from public, anon, authenticated;

create or replace function public.wq_protect_items()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_status text;
begin
  select status into v_status from public.workshop_quote_versions
   where id = coalesce(new.version_id, old.version_id);
  if v_status is distinct from 'draft' then
    raise exception 'Itens de orçamento enviado não podem ser alterados.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
revoke execute on function public.wq_protect_items() from public, anon, authenticated;

create or replace function public.wq_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Registro permanente: não pode ser alterado nem apagado.' using errcode = '42501';
end;
$$;
revoke execute on function public.wq_immutable() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['workshop_customers', 'workshop_vehicles', 'workshop_service_catalog', 'workshop_price_tables',
                           'workshop_service_prices', 'workshop_quotes', 'workshop_quote_versions'] loop
    execute format('create trigger %1$s_updated_at before update on public.%1$s for each row execute function public.set_updated_at()', t);
    execute format('create trigger %1$s_protect_org before update on public.%1$s for each row execute function public.wq_protect_org()', t);
  end loop;
  foreach t in array array['workshop_customers', 'workshop_vehicles', 'workshop_service_catalog', 'workshop_price_tables',
                           'workshop_service_prices', 'workshop_quotes'] loop
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$s for each row execute function public.audit_row_change(%2$L, %3$L)',
                   t, '', 'organization_id');
  end loop;
end $$;

create trigger workshop_quote_versions_protect before update or delete on public.workshop_quote_versions
  for each row execute function public.wq_protect_version();
create trigger workshop_quote_items_protect before insert or update or delete on public.workshop_quote_items
  for each row execute function public.wq_protect_items();
create trigger workshop_quote_approvals_immutable before update or delete on public.workshop_quote_approvals
  for each row execute function public.wq_immutable();
create trigger workshop_quote_events_immutable before update or delete on public.workshop_quote_events
  for each row execute function public.wq_immutable();

-- -----------------------------------------------------------------------------
-- RLS: leitura só por membros da própria oficina; escrita só pelas funções
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['workshop_customers', 'workshop_vehicles', 'workshop_service_catalog', 'workshop_price_tables',
                           'workshop_service_prices', 'workshop_quotes', 'workshop_quote_versions', 'workshop_quote_items',
                           'workshop_quote_shares', 'workshop_quote_approvals', 'workshop_quote_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
  -- Membros leem os dados comerciais da oficina (exceto shares: só pelas funções, sem hash).
  foreach t in array array['workshop_customers', 'workshop_vehicles', 'workshop_service_catalog', 'workshop_price_tables',
                           'workshop_service_prices', 'workshop_quotes', 'workshop_quote_versions', 'workshop_quote_items',
                           'workshop_quote_approvals', 'workshop_quote_events'] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy %1$s_select_member on public.%1$s for select to authenticated using (public.has_org_permission(organization_id, %2$L))',
                   t, 'member');
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Funções de apoio
-- -----------------------------------------------------------------------------
create or replace function public.wq_txt(p jsonb, k text)
returns text
language sql
immutable
set search_path = ''
as $$ select nullif(btrim(p ->> k), '') $$;

create or replace function public.wq_digits(p jsonb, k text)
returns text
language sql
immutable
set search_path = ''
as $$ select nullif(regexp_replace(coalesce(p ->> k, ''), '[^0-9]', '', 'g'), '') $$;

create or replace function public.wq_actor_label()
returns text
language sql
stable
security definer
set search_path = ''
as $$ select coalesce((select full_name from public.profiles where id = auth.uid()), 'Equipe da oficina') $$;

create or replace function public.wq_event(p_org uuid, p_quote uuid, p_version int, p_kind text, p_data jsonb default '{}', p_actor_label text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.workshop_quote_events (organization_id, quote_id, version_no, kind, actor_user_id, actor_label, data)
  values (p_org, p_quote, p_version, p_kind, auth.uid(),
          coalesce(p_actor_label, case when auth.uid() is not null then public.wq_actor_label() end), coalesce(p_data, '{}'));
$$;

-- Avisa quem cuida de orçamentos na oficina.
create or replace function public.wq_notify_team(p_org uuid, p_kind text, p_title text, p_body text, p_link text, p_dedupe text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare r record;
begin
  for r in select m.user_id from public.organization_members m
            where m.organization_id = p_org and m.status = 'active'
              and (m.role = 'responsible' or m.can_manage_quotes) loop
    perform public.notify(r.user_id, p_kind, p_title, p_body, p_link, p_dedupe || ':' || r.user_id::text);
  end loop;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['wq_txt(jsonb, text)', 'wq_digits(jsonb, text)', 'wq_actor_label()',
                           'wq_event(uuid, uuid, integer, text, jsonb, text)',
                           'wq_notify_team(uuid, text, text, text, text, text)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Clientes
-- -----------------------------------------------------------------------------
create or replace function public.workshop_save_customer(p_org uuid, p_id uuid, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  perform public.wq_assert(p_org, 'manage_quotes');
  if p_id is null then
    insert into public.workshop_customers (organization_id, full_name, phone, whatsapp, email, cpf, address, birth_date,
                                           notes, first_visit_at, source, created_by)
    values (p_org, public.wq_txt(p_data, 'full_name'), public.wq_digits(p_data, 'phone'), public.wq_digits(p_data, 'whatsapp'),
            lower(public.wq_txt(p_data, 'email')), public.wq_digits(p_data, 'cpf'), public.wq_txt(p_data, 'address'),
            nullif(p_data ->> 'birth_date', '')::date, public.wq_txt(p_data, 'notes'),
            coalesce(nullif(p_data ->> 'first_visit_at', '')::date, current_date),
            coalesce(public.wq_txt(p_data, 'source'), 'balcao'), auth.uid())
    returning id into v_id;
  else
    update public.workshop_customers
       set full_name = public.wq_txt(p_data, 'full_name'), phone = public.wq_digits(p_data, 'phone'),
           whatsapp = public.wq_digits(p_data, 'whatsapp'), email = lower(public.wq_txt(p_data, 'email')),
           cpf = public.wq_digits(p_data, 'cpf'), address = public.wq_txt(p_data, 'address'),
           birth_date = nullif(p_data ->> 'birth_date', '')::date, notes = public.wq_txt(p_data, 'notes'),
           first_visit_at = coalesce(nullif(p_data ->> 'first_visit_at', '')::date, first_visit_at),
           source = coalesce(public.wq_txt(p_data, 'source'), source)
     where id = p_id and organization_id = p_org
    returning id into v_id;
    if v_id is null then raise exception 'Cliente não encontrado.' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.workshop_set_customer_status(p_org uuid, p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.wq_assert(p_org, 'manage_quotes');
  if p_status not in ('active', 'archived') then raise exception 'Situação inválida.' using errcode = '22023'; end if;
  update public.workshop_customers set status = p_status where id = p_id and organization_id = p_org;
  if not found then raise exception 'Cliente não encontrado.' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.workshop_list_customers(p_org uuid, p_search text default null, p_include_archived boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_q text := nullif(lower(btrim(coalesce(p_search, ''))), '');
        v_digits text := nullif(regexp_replace(coalesce(p_search, ''), '[^0-9]', '', 'g'), '');
        v_plate text := nullif(public.normalize_plate(coalesce(p_search, '')), '');
begin
  perform public.wq_assert(p_org, 'member');
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.full_name)
      from (
        select c.id, c.full_name, c.phone, c.whatsapp, c.email, c.status, c.first_visit_at, c.source,
               (select count(*) from public.workshop_vehicles v where v.customer_id = c.id and v.organization_id = p_org and v.status = 'active') as vehicles,
               (select count(*) from public.workshop_quotes q where q.customer_id = c.id and q.organization_id = p_org) as quotes,
               (select max(q.created_at) from public.workshop_quotes q where q.customer_id = c.id and q.organization_id = p_org) as last_quote_at,
               (select string_agg(v.brand || ' ' || v.model || coalesce(' · ' || v.plate, ''), ', ')
                  from public.workshop_vehicles v where v.customer_id = c.id and v.organization_id = p_org and v.status = 'active') as vehicle_labels
          from public.workshop_customers c
         where c.organization_id = p_org
           and (p_include_archived or c.status = 'active')
           and (v_q is null
                or lower(c.full_name) like '%' || v_q || '%'
                or (v_digits is not null and length(v_digits) >= 4 and (c.phone like '%' || v_digits || '%' or c.whatsapp like '%' || v_digits || '%'))
                or (v_plate is not null and exists (select 1 from public.workshop_vehicles v
                                                   where v.customer_id = c.id and v.organization_id = p_org and v.plate like v_plate || '%')))
         limit 500
      ) x), '[]'::jsonb);
end;
$$;

create or replace function public.workshop_get_customer(p_org uuid, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare c public.workshop_customers;
begin
  perform public.wq_assert(p_org, 'member');
  select * into c from public.workshop_customers where id = p_id and organization_id = p_org;
  if not found then raise exception 'Cliente não encontrado.' using errcode = 'P0002'; end if;
  return to_jsonb(c) || jsonb_build_object(
    'vehicles', coalesce((select jsonb_agg(to_jsonb(v) order by v.created_at)
                            from public.workshop_vehicles v where v.customer_id = c.id and v.organization_id = p_org), '[]'::jsonb),
    'quotes', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'number', q.number, 'status', q.status,
                                  'created_at', q.created_at, 'total_cents', qv.total_cents,
                                  'approved_total_cents', q.approved_total_cents, 'vehicle_id', q.vehicle_id) order by q.created_at desc)
                          from public.workshop_quotes q
                          join public.workshop_quote_versions qv on qv.quote_id = q.id and qv.version_no = q.current_version
                         where q.customer_id = c.id and q.organization_id = p_org), '[]'::jsonb));
end;
$$;

-- -----------------------------------------------------------------------------
-- Motos da oficina
-- -----------------------------------------------------------------------------
create or replace function public.workshop_save_vehicle(p_org uuid, p_id uuid, p_customer uuid, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
        v_plate text := nullif(public.normalize_plate(coalesce(p_data ->> 'plate', '')), '');
begin
  perform public.wq_assert(p_org, 'manage_quotes');
  if not exists (select 1 from public.workshop_customers where id = p_customer and organization_id = p_org) then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;
  if p_id is null then
    insert into public.workshop_vehicles (organization_id, customer_id, brand, model, version, year, displacement_cc, plate, km, color, notes, created_by)
    values (p_org, p_customer, public.wq_txt(p_data, 'brand'), public.wq_txt(p_data, 'model'), public.wq_txt(p_data, 'version'),
            nullif(p_data ->> 'year', '')::smallint, nullif(p_data ->> 'displacement_cc', '')::int, v_plate,
            nullif(p_data ->> 'km', '')::int, public.wq_txt(p_data, 'color'), public.wq_txt(p_data, 'notes'), auth.uid())
    returning id into v_id;
  else
    update public.workshop_vehicles
       set customer_id = p_customer, brand = public.wq_txt(p_data, 'brand'), model = public.wq_txt(p_data, 'model'),
           version = public.wq_txt(p_data, 'version'), year = nullif(p_data ->> 'year', '')::smallint,
           displacement_cc = nullif(p_data ->> 'displacement_cc', '')::int, plate = v_plate,
           km = nullif(p_data ->> 'km', '')::int, color = public.wq_txt(p_data, 'color'), notes = public.wq_txt(p_data, 'notes'),
           status = coalesce(public.wq_txt(p_data, 'status'), status)
     where id = p_id and organization_id = p_org
    returning id into v_id;
    if v_id is null then raise exception 'Moto não encontrada.' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.workshop_list_vehicles(p_org uuid, p_search text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_q text := nullif(lower(btrim(coalesce(p_search, ''))), '');
        v_plate text := nullif(public.normalize_plate(coalesce(p_search, '')), '');
begin
  perform public.wq_assert(p_org, 'member');
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.updated_at desc)
      from (
        select v.id, v.customer_id, c.full_name as customer_name, v.brand, v.model, v.version, v.year, v.displacement_cc,
               v.plate, v.km, v.color, v.status, v.motorcycle_id is not null as linked, v.updated_at,
               (select count(*) from public.workshop_quotes q where q.vehicle_id = v.id and q.organization_id = p_org) as quotes
          from public.workshop_vehicles v
          join public.workshop_customers c on c.id = v.customer_id and c.organization_id = p_org
         where v.organization_id = p_org and v.status = 'active'
           and (v_q is null or lower(v.brand || ' ' || v.model) like '%' || v_q || '%'
                or lower(c.full_name) like '%' || v_q || '%'
                or (v_plate is not null and v.plate like v_plate || '%'))
         limit 500
      ) x), '[]'::jsonb);
end;
$$;

-- Vincula a moto da oficina ao passaporte, só com autorização aprovada (PRD 2.1 §4.3 e §5).
create or replace function public.workshop_link_vehicle_passport(p_org uuid, p_vehicle uuid, p_motorcycle uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.wq_assert(p_org, 'manage_quotes');
  if p_motorcycle is not null and not public.workshop_has_access(p_motorcycle, p_org) then
    raise exception 'A oficina precisa de autorização aprovada do titular para vincular o passaporte.' using errcode = '42501';
  end if;
  update public.workshop_vehicles
     set motorcycle_id = p_motorcycle, linked_by = case when p_motorcycle is null then null else auth.uid() end,
         linked_at = case when p_motorcycle is null then null else now() end
   where id = p_vehicle and organization_id = p_org;
  if not found then raise exception 'Moto não encontrada.' using errcode = 'P0002'; end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Catálogo e preços
-- -----------------------------------------------------------------------------
create or replace function public.workshop_save_service(p_org uuid, p_id uuid, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  perform public.wq_assert(p_org, 'manage_prices');
  if p_id is null then
    insert into public.workshop_service_catalog (organization_id, name, category, description, estimated_minutes,
                                                 default_price_cents, charge_type, active, notes, created_by)
    values (p_org, public.wq_txt(p_data, 'name'), coalesce(public.wq_txt(p_data, 'category'), 'outros'),
            public.wq_txt(p_data, 'description'), nullif(p_data ->> 'estimated_minutes', '')::int,
            nullif(p_data ->> 'default_price_cents', '')::bigint, coalesce(public.wq_txt(p_data, 'charge_type'), 'fixed'),
            coalesce((p_data ->> 'active')::boolean, true), public.wq_txt(p_data, 'notes'), auth.uid())
    returning id into v_id;
  else
    update public.workshop_service_catalog
       set name = public.wq_txt(p_data, 'name'), category = coalesce(public.wq_txt(p_data, 'category'), category),
           description = public.wq_txt(p_data, 'description'), estimated_minutes = nullif(p_data ->> 'estimated_minutes', '')::int,
           default_price_cents = nullif(p_data ->> 'default_price_cents', '')::bigint,
           charge_type = coalesce(public.wq_txt(p_data, 'charge_type'), charge_type),
           active = coalesce((p_data ->> 'active')::boolean, active), notes = public.wq_txt(p_data, 'notes')
     where id = p_id and organization_id = p_org
    returning id into v_id;
    if v_id is null then raise exception 'Serviço não encontrado.' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.workshop_save_price_table(p_org uuid, p_id uuid, p_name text, p_description text,
                                                            p_is_default boolean, p_active boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  perform public.wq_assert(p_org, 'manage_prices');
  if coalesce(p_is_default, false) then
    update public.workshop_price_tables set is_default = false
     where organization_id = p_org and is_default and id is distinct from p_id;
  end if;
  if p_id is null then
    insert into public.workshop_price_tables (organization_id, name, description, is_default, active, created_by)
    values (p_org, btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''),
            coalesce(p_is_default, false) or not exists (select 1 from public.workshop_price_tables where organization_id = p_org),
            coalesce(p_active, true), auth.uid())
    returning id into v_id;
  else
    update public.workshop_price_tables
       set name = btrim(p_name), description = nullif(btrim(coalesce(p_description, '')), ''),
           is_default = coalesce(p_is_default, is_default), active = coalesce(p_active, active)
     where id = p_id and organization_id = p_org
    returning id into v_id;
    if v_id is null then raise exception 'Tabela não encontrada.' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.workshop_save_price_rule(p_org uuid, p_id uuid, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  perform public.wq_assert(p_org, 'manage_prices');
  if p_id is null then
    insert into public.workshop_service_prices (organization_id, table_id, service_id, brand, model, year_from, year_to,
                                                cc_min, cc_max, complexity, price_cents, notes, created_by)
    values (p_org, (p_data ->> 'table_id')::uuid, (p_data ->> 'service_id')::uuid, public.wq_txt(p_data, 'brand'),
            public.wq_txt(p_data, 'model'), nullif(p_data ->> 'year_from', '')::smallint, nullif(p_data ->> 'year_to', '')::smallint,
            nullif(p_data ->> 'cc_min', '')::int, nullif(p_data ->> 'cc_max', '')::int, public.wq_txt(p_data, 'complexity'),
            (p_data ->> 'price_cents')::bigint, public.wq_txt(p_data, 'notes'), auth.uid())
    returning id into v_id;
  else
    update public.workshop_service_prices
       set brand = public.wq_txt(p_data, 'brand'), model = public.wq_txt(p_data, 'model'),
           year_from = nullif(p_data ->> 'year_from', '')::smallint, year_to = nullif(p_data ->> 'year_to', '')::smallint,
           cc_min = nullif(p_data ->> 'cc_min', '')::int, cc_max = nullif(p_data ->> 'cc_max', '')::int,
           complexity = public.wq_txt(p_data, 'complexity'), price_cents = (p_data ->> 'price_cents')::bigint,
           notes = public.wq_txt(p_data, 'notes')
     where id = p_id and organization_id = p_org
    returning id into v_id;
    if v_id is null then raise exception 'Preço não encontrado.' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.workshop_delete_price_rule(p_org uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.wq_assert(p_org, 'manage_prices');
  delete from public.workshop_service_prices where id = p_id and organization_id = p_org;
end;
$$;

create or replace function public.workshop_list_catalog(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.wq_assert(p_org, 'member');
  return jsonb_build_object(
    'services', coalesce((select jsonb_agg(to_jsonb(s) order by s.active desc, lower(s.name))
                            from public.workshop_service_catalog s where s.organization_id = p_org), '[]'::jsonb),
    'tables', coalesce((select jsonb_agg(to_jsonb(t) order by t.is_default desc, lower(t.name))
                          from public.workshop_price_tables t where t.organization_id = p_org), '[]'::jsonb),
    'rules', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at)
                         from public.workshop_service_prices r where r.organization_id = p_org), '[]'::jsonb));
end;
$$;

-- Preço mais específico para a moto (PRD 2.1 §10.3). Critério vazio vale para todos; o que estiver
-- preenchido precisa bater. Ordem: marca+modelo+ano > marca+modelo > faixa de cilindrada > marca > padrão.
create or replace function public.workshop_suggest_price(p_org uuid, p_service uuid, p_vehicle uuid default null,
                                                         p_table uuid default null, p_complexity text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v public.workshop_vehicles;
        s public.workshop_service_catalog;
        v_table uuid;
        r record;
begin
  perform public.wq_assert(p_org, 'member');
  select * into s from public.workshop_service_catalog where id = p_service and organization_id = p_org;
  if not found then raise exception 'Serviço não encontrado.' using errcode = 'P0002'; end if;
  if p_vehicle is not null then
    select * into v from public.workshop_vehicles where id = p_vehicle and organization_id = p_org;
  end if;
  v_table := coalesce(p_table, (select id from public.workshop_price_tables where organization_id = p_org and is_default and active));
  if v_table is not null then
    select sp.*, (case when sp.model is not null then 2 else 0 end
                + case when sp.brand is not null then 1 else 0 end
                + case when sp.year_from is not null or sp.year_to is not null then 2 else 0 end
                + case when sp.cc_min is not null or sp.cc_max is not null then 1 else 0 end
                + case when sp.complexity is not null then 1 else 0 end) as score
      into r
      from public.workshop_service_prices sp
     where sp.organization_id = p_org and sp.table_id = v_table and sp.service_id = p_service
       and (sp.brand is null or lower(sp.brand) = lower(v.brand))
       and (sp.model is null or lower(sp.model) = lower(v.model))
       and (sp.year_from is null or v.year >= sp.year_from)
       and (sp.year_to is null or v.year <= sp.year_to)
       and (sp.cc_min is null or v.displacement_cc >= sp.cc_min)
       and (sp.cc_max is null or v.displacement_cc <= sp.cc_max)
       and (sp.complexity is null or sp.complexity = p_complexity)
     order by score desc, sp.price_cents desc
     limit 1;
    if found then
      return jsonb_build_object('price_cents', r.price_cents, 'source', 'rule', 'rule_id', r.id, 'table_id', v_table,
        'label', concat_ws(' · ', nullif(concat_ws(' ', r.brand, r.model), ''),
                           case when r.year_from is not null or r.year_to is not null
                                then concat(coalesce(r.year_from::text, '…'), '–', coalesce(r.year_to::text, '…')) end,
                           case when r.cc_min is not null or r.cc_max is not null
                                then concat(coalesce(r.cc_min::text, '0'), '–', coalesce(r.cc_max::text, '…'), ' cc') end,
                           r.complexity));
    end if;
  end if;
  if s.default_price_cents is not null then
    return jsonb_build_object('price_cents', s.default_price_cents, 'source', 'default', 'table_id', v_table, 'label', 'valor padrão do serviço');
  end if;
  return jsonb_build_object('price_cents', null, 'source', 'none', 'table_id', v_table, 'label', 'sem preço cadastrado');
end;
$$;

-- -----------------------------------------------------------------------------
-- Orçamentos
-- -----------------------------------------------------------------------------
create or replace function public.wq_recalc(p_version uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v public.workshop_quote_versions;
        v_sub bigint;
        v_disc bigint;
begin
  select * into v from public.workshop_quote_versions where id = p_version;
  select coalesce(sum(subtotal_cents), 0) into v_sub from public.workshop_quote_items where version_id = p_version;
  v_disc := case v.discount_type
              when 'percent' then round(v_sub * v.discount_value / 100.0)
              when 'amount' then least(round(v.discount_value * 100), v_sub)
              else 0 end;
  update public.workshop_quote_versions
     set subtotal_cents = v_sub, discount_cents = v_disc, total_cents = v_sub - v_disc
   where id = p_version;
end;
$$;
revoke execute on function public.wq_recalc(uuid) from public, anon, authenticated;

create or replace function public.workshop_create_quote(p_org uuid, p_customer uuid, p_vehicle uuid default null,
                                                        p_parent uuid default null, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
        v_parent public.workshop_quotes;
        v_km int;
        v_days int := greatest(1, least(90, public.setting_int('workshop_quote_valid_days', 7)));
begin
  perform public.wq_assert(p_org, 'manage_quotes');
  if not exists (select 1 from public.workshop_customers where id = p_customer and organization_id = p_org and status = 'active') then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;
  if p_vehicle is not null then
    select km into v_km from public.workshop_vehicles where id = p_vehicle and organization_id = p_org and customer_id = p_customer;
    if not found then raise exception 'A moto não pertence a este cliente.' using errcode = '22023'; end if;
  end if;
  if p_parent is not null then
    select * into v_parent from public.workshop_quotes where id = p_parent and organization_id = p_org;
    if not found then raise exception 'Orçamento original não encontrado.' using errcode = 'P0002'; end if;
    if v_parent.status not in ('approved', 'partially_approved') then
      raise exception 'Orçamento complementar só depois que o original foi aprovado.' using errcode = 'P0001';
    end if;
    if char_length(btrim(coalesce(p_reason, ''))) < 3 then
      raise exception 'Informe o motivo do orçamento complementar.' using errcode = '22023';
    end if;
  end if;
  insert into public.workshop_quotes (organization_id, number, customer_id, vehicle_id, parent_quote_id, complement_reason, created_by)
  values (p_org, public.wq_next_number(p_org, 'quote'), p_customer, coalesce(p_vehicle, v_parent.vehicle_id), p_parent,
          case when p_parent is not null then btrim(p_reason) end, auth.uid())
  returning id into v_id;
  insert into public.workshop_quote_versions (organization_id, quote_id, version_no, km, valid_until, price_table_id, created_by)
  values (p_org, v_id, 1, v_km, current_date + v_days,
          (select id from public.workshop_price_tables where organization_id = p_org and is_default and active), auth.uid());
  perform public.wq_event(p_org, v_id, 1, case when p_parent is null then 'created' else 'complement_created' end,
                          case when p_parent is null then '{}'::jsonb
                               else jsonb_build_object('parent_number', v_parent.number, 'reason', btrim(p_reason)) end);
  return v_id;
end;
$$;

-- Salva o rascunho (cabeçalho + itens). Totais são sempre calculados aqui (PRD 2.1 §6.2).
create or replace function public.workshop_save_quote_draft(p_org uuid, p_quote uuid, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare q public.workshop_quotes;
        v public.workshop_quote_versions;
        it jsonb;
        n int := 0;
        v_qty numeric;
        v_unit bigint;
        v_dtype text := coalesce(public.wq_txt(p_data, 'discount_type'), 'none');
        v_dval numeric := coalesce(nullif(p_data ->> 'discount_value', '')::numeric, 0);
begin
  perform public.wq_assert(p_org, 'manage_quotes');
  select * into q from public.workshop_quotes where id = p_quote and organization_id = p_org for update;
  if not found then raise exception 'Orçamento não encontrado.' using errcode = 'P0002'; end if;
  select * into v from public.workshop_quote_versions where quote_id = q.id and version_no = q.current_version;
  if v.status <> 'draft' then
    raise exception 'Este orçamento já foi enviado. Para mudar, crie uma nova versão.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(coalesce(p_data -> 'items', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_data -> 'items', '[]'::jsonb)) > 200 then
    raise exception 'Itens inválidos.' using errcode = '22023';
  end if;
  if v_dtype = 'none' then v_dval := 0; end if;

  if p_data ? 'vehicle_id' then
    if nullif(p_data ->> 'vehicle_id', '') is not null and not exists (
         select 1 from public.workshop_vehicles where id = (p_data ->> 'vehicle_id')::uuid and organization_id = p_org and customer_id = q.customer_id) then
      raise exception 'A moto não pertence a este cliente.' using errcode = '22023';
    end if;
    update public.workshop_quotes set vehicle_id = nullif(p_data ->> 'vehicle_id', '')::uuid where id = q.id;
  end if;

  update public.workshop_quote_versions
     set km = nullif(p_data ->> 'km', '')::int, problem = public.wq_txt(p_data, 'problem'),
         diagnosis = public.wq_txt(p_data, 'diagnosis'), notes = public.wq_txt(p_data, 'notes'),
         payment_terms = public.wq_txt(p_data, 'payment_terms'), estimated_days = nullif(p_data ->> 'estimated_days', '')::int,
         valid_until = coalesce(nullif(p_data ->> 'valid_until', '')::date, valid_until),
         price_table_id = case when p_data ? 'price_table_id' then nullif(p_data ->> 'price_table_id', '')::uuid else price_table_id end,
         discount_type = v_dtype, discount_value = v_dval,
         discount_set_by = case when v_dtype is distinct from discount_type or v_dval is distinct from discount_value
                                then auth.uid() else discount_set_by end
   where id = v.id;
  if (select valid_until from public.workshop_quote_versions where id = v.id) < current_date then
    raise exception 'A validade não pode ser no passado.' using errcode = '22023';
  end if;

  delete from public.workshop_quote_items where version_id = v.id;
  for it in select * from jsonb_array_elements(coalesce(p_data -> 'items', '[]'::jsonb)) loop
    n := n + 1;
    v_qty := coalesce(nullif(it ->> 'quantity', '')::numeric, 1);
    v_unit := coalesce(nullif(it ->> 'unit_price_cents', '')::bigint, 0);
    if nullif(it ->> 'service_id', '') is not null and not exists (
         select 1 from public.workshop_service_catalog where id = (it ->> 'service_id')::uuid and organization_id = p_org) then
      raise exception 'Serviço do item % não pertence à oficina.', n using errcode = '22023';
    end if;
    insert into public.workshop_quote_items (organization_id, version_id, position, kind, description, service_id,
                                             quantity, unit_price_cents, subtotal_cents, notes)
    values (p_org, v.id, n, coalesce(public.wq_txt(it, 'kind'), 'labor'), public.wq_txt(it, 'description'),
            nullif(it ->> 'service_id', '')::uuid, v_qty, v_unit, round(v_qty * v_unit), public.wq_txt(it, 'notes'));
  end loop;
  perform public.wq_recalc(v.id);

  if v_dtype is distinct from v.discount_type or v_dval is distinct from v.discount_value then
    perform public.wq_event(p_org, q.id, v.version_no, 'discount_set', jsonb_build_object('type', v_dtype, 'value', v_dval));
  end if;
  return (select jsonb_build_object('subtotal_cents', subtotal_cents, 'discount_cents', discount_cents, 'total_cents', total_cents)
            from public.workshop_quote_versions where id = v.id);
end;
$$;

create or replace function public.wq_new_token()
returns text
language sql
volatile
set search_path = ''
as $$ select translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_') $$;
revoke execute on function public.wq_new_token() from public, anon, authenticated;

create or replace function public.wq_issue_link(p_org uuid, p_quote uuid, p_version uuid, p_version_no int, p_valid_until date, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_token text := public.wq_new_token();
        v_exp timestamptz := ((p_valid_until + 1)::timestamp at time zone 'America/Sao_Paulo');
begin
  update public.workshop_quote_shares set revoked_at = now(), revoked_reason = 'resent'
   where quote_id = p_quote and revoked_at is null;
  insert into public.workshop_quote_shares (organization_id, quote_id, version_id, token_hash, created_by, expires_at)
  values (p_org, p_quote, p_version, encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid(), v_exp);
  perform public.wq_event(p_org, p_quote, p_version_no, 'link_created', jsonb_build_object('resend', p_kind = 'resend', 'expires_at', v_exp));
  return jsonb_build_object('token', v_token, 'expires_at', v_exp);
end;
$$;
revoke execute on function public.wq_issue_link(uuid, uuid, uuid, integer, date, text) from public, anon, authenticated;

-- Envia (fecha a versão) e devolve o link. O token só aparece agora; o banco guarda o hash.
create or replace function public.workshop_send_quote(p_org uuid, p_quote uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare q public.workshop_quotes;
        v public.workshop_quote_versions;
begin
  perform public.wq_assert(p_org, 'manage_quotes');
  select * into q from public.workshop_quotes where id = p_quote and organization_id = p_org for update;
  if not found then raise exception 'Orçamento não encontrado.' using errcode = 'P0002'; end if;
  select * into v from public.workshop_quote_versions where quote_id = q.id and version_no = q.current_version;
  if q.status in ('sent', 'viewed') and v.status = 'sent' then
    return public.wq_issue_link(p_org, q.id, v.id, v.version_no, v.valid_until, 'resend');
  end if;
  if v.status <> 'draft' then
    raise exception 'Este orçamento não pode ser enviado na situação atual.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.workshop_quote_items where version_id = v.id) then
    raise exception 'Inclua pelo menos um item antes de enviar.' using errcode = 'P0001';
  end if;
  if v.valid_until < current_date then
    raise exception 'A validade já passou. Ajuste a data antes de enviar.' using errcode = 'P0001';
  end if;
  update public.workshop_quote_versions set status = 'sent', sent_at = now(), sent_by = auth.uid() where id = v.id;
  update public.workshop_quotes set status = 'sent' where id = q.id;
  return public.wq_issue_link(p_org, q.id, v.id, v.version_no, v.valid_until, 'send');
end;
$$;

-- Nova versão a partir da atual (enviada, recusada ou vencida). A anterior fica preservada.
create or replace function public.workshop_revise_quote(p_org uuid, p_quote uuid, p_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare q public.workshop_quotes;
        v public.workshop_quote_versions;
        v_new uuid;
        v_days int := greatest(1, least(90, public.setting_int('workshop_quote_valid_days', 7)));
begin
  perform public.wq_assert(p_org, 'manage_quotes');
  select * into q from public.workshop_quotes where id = p_quote and organization_id = p_org for update;
  if not found then raise exception 'Orçamento não encontrado.' using errcode = 'P0002'; end if;
  if q.status not in ('sent', 'viewed', 'rejected', 'expired') then
    raise exception 'Só dá para criar nova versão de orçamento enviado, recusado ou vencido. Depois de aprovado, use um orçamento complementar.' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Informe o motivo da nova versão.' using errcode = '22023';
  end if;
  select * into v from public.workshop_quote_versions where quote_id = q.id and version_no = q.current_version;
  if v.status = 'sent' then
    update public.workshop_quote_versions set status = 'superseded' where id = v.id;
  end if;
  update public.workshop_quote_shares set revoked_at = now(), revoked_reason = 'revised'
   where quote_id = q.id and revoked_at is null;
  insert into public.workshop_quote_versions (organization_id, quote_id, version_no, km, problem, diagnosis, notes, payment_terms,
                                              estimated_days, valid_until, price_table_id, discount_type, discount_value,
                                              discount_set_by, change_reason, created_by)
  values (p_org, q.id, v.version_no + 1, v.km, v.problem, v.diagnosis, v.notes, v.payment_terms, v.estimated_days,
          greatest(v.valid_until, current_date + v_days), v.price_table_id, v.discount_type, v.discount_value,
          v.discount_set_by, btrim(p_reason), auth.uid())
  returning id into v_new;
  insert into public.workshop_quote_items (organization_id, version_id, position, kind, description, service_id,
                                           quantity, unit_price_cents, subtotal_cents, notes)
  select p_org, v_new, position, kind, description, service_id, quantity, unit_price_cents, subtotal_cents, notes
    from public.workshop_quote_items where version_id = v.id;
  perform public.wq_recalc(v_new);
  update public.workshop_quotes set current_version = v.version_no + 1, status = 'draft',
         approved_total_cents = null, decided_at = null where id = q.id;
  perform public.wq_event(p_org, q.id, v.version_no + 1, 'version_created',
                          jsonb_build_object('from_version', v.version_no, 'reason', btrim(p_reason)));
  return v.version_no + 1;
end;
$$;

create or replace function public.workshop_revoke_quote_link(p_org uuid, p_quote uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare q public.workshop_quotes;
begin
  perform public.wq_assert(p_org, 'manage_quotes');
  select * into q from public.workshop_quotes where id = p_quote and organization_id = p_org;
  if not found then raise exception 'Orçamento não encontrado.' using errcode = 'P0002'; end if;
  update public.workshop_quote_shares set revoked_at = now(), revoked_reason = 'manual'
   where quote_id = q.id and revoked_at is null;
  if found then perform public.wq_event(p_org, q.id, q.current_version, 'link_revoked'); end if;
end;
$$;

create or replace function public.workshop_cancel_quote(p_org uuid, p_quote uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare q public.workshop_quotes;
begin
  perform public.wq_assert(p_org, 'manage_quotes');
  select * into q from public.workshop_quotes where id = p_quote and organization_id = p_org for update;
  if not found then raise exception 'Orçamento não encontrado.' using errcode = 'P0002'; end if;
  if q.status = 'canceled' then return; end if;
  update public.workshop_quote_shares set revoked_at = now(), revoked_reason = 'canceled'
   where quote_id = q.id and revoked_at is null;
  update public.workshop_quote_versions set status = 'canceled'
   where quote_id = q.id and version_no = q.current_version and status in ('draft', 'sent');
  update public.workshop_quotes set status = 'canceled',
         canceled_reason = nullif(btrim(coalesce(p_reason, '')), '') where id = q.id;
  perform public.wq_event(p_org, q.id, q.current_version, 'canceled', jsonb_build_object('reason', nullif(btrim(coalesce(p_reason, '')), '')));
end;
$$;

-- Registro de "mensagem preparada" e "impresso". Abrir o WhatsApp não prova envio (PRD 2.1 §13.3).
create or replace function public.workshop_log_quote_event(p_org uuid, p_quote uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare q public.workshop_quotes;
begin
  perform public.wq_assert(p_org, 'member');
  if p_kind not in ('whatsapp_prepared', 'printed') then raise exception 'Evento inválido.' using errcode = '22023'; end if;
  select * into q from public.workshop_quotes where id = p_quote and organization_id = p_org;
  if not found then raise exception 'Orçamento não encontrado.' using errcode = 'P0002'; end if;
  perform public.wq_event(p_org, q.id, q.current_version, p_kind);
end;
$$;

create or replace function public.workshop_list_quotes(p_org uuid, p_status text default null, p_search text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_q text := nullif(lower(btrim(coalesce(p_search, ''))), '');
        v_num int := case when coalesce(p_search, '') ~ '^\s*#?[0-9]{1,9}\s*$' then regexp_replace(p_search, '[^0-9]', '', 'g')::int end;
        v_plate text := nullif(public.normalize_plate(coalesce(p_search, '')), '');
begin
  perform public.wq_assert(p_org, 'member');
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.created_at desc)
      from (
        select q.id, q.number, q.status, q.current_version, q.created_at, q.updated_at, q.decided_at,
               q.approved_total_cents, q.parent_quote_id, qv.total_cents, qv.valid_until, qv.sent_at,
               c.id as customer_id, c.full_name as customer_name,
               v.brand, v.model, v.plate,
               (select s.first_viewed_at from public.workshop_quote_shares s where s.quote_id = q.id order by s.created_at desc limit 1) as viewed_at
          from public.workshop_quotes q
          join public.workshop_customers c on c.id = q.customer_id and c.organization_id = p_org
          join public.workshop_quote_versions qv on qv.quote_id = q.id and qv.version_no = q.current_version
          left join public.workshop_vehicles v on v.id = q.vehicle_id and v.organization_id = p_org
         where q.organization_id = p_org
           and (p_status is null or p_status = ''
                or (p_status = 'open' and q.status in ('sent', 'viewed'))
                or (p_status = 'won' and q.status in ('approved', 'partially_approved'))
                or q.status = p_status)
           and (v_q is null or v_num = q.number or lower(c.full_name) like '%' || v_q || '%'
                or lower(coalesce(v.brand, '') || ' ' || coalesce(v.model, '')) like '%' || v_q || '%'
                or (v_plate is not null and v.plate like v_plate || '%'))
         limit 500
      ) x), '[]'::jsonb);
end;
$$;

create or replace function public.workshop_get_quote(p_org uuid, p_quote uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare q public.workshop_quotes;
begin
  perform public.wq_assert(p_org, 'member');
  select * into q from public.workshop_quotes where id = p_quote and organization_id = p_org;
  if not found then raise exception 'Orçamento não encontrado.' using errcode = 'P0002'; end if;
  return to_jsonb(q) || jsonb_build_object(
    'customer', (select to_jsonb(c) - 'cpf' - 'notes' || jsonb_build_object('has_cpf', c.cpf is not null)
                   from public.workshop_customers c where c.id = q.customer_id and c.organization_id = p_org),
    'vehicle', (select to_jsonb(v) from public.workshop_vehicles v where v.id = q.vehicle_id and v.organization_id = p_org),
    'parent', (select jsonb_build_object('id', p.id, 'number', p.number) from public.workshop_quotes p
                where p.id = q.parent_quote_id and p.organization_id = p_org),
    'complements', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'number', c.number, 'status', c.status) order by c.number)
                               from public.workshop_quotes c where c.parent_quote_id = q.id and c.organization_id = p_org), '[]'::jsonb),
    'workshop', (select jsonb_build_object('business_name', w.business_name, 'legal_name', w.legal_name, 'cnpj', w.cnpj,
                          'phone', w.phone, 'whatsapp', w.whatsapp, 'email', w.email, 'address', w.address, 'city', w.city,
                          'state', w.state, 'logo_url', w.logo_url)
                   from public.workshops w where w.organization_id = p_org),
    'versions', coalesce((select jsonb_agg(to_jsonb(qv) || jsonb_build_object(
                             'created_by_name', (select full_name from public.profiles where id = qv.created_by),
                             'discount_set_by_name', (select full_name from public.profiles where id = qv.discount_set_by),
                             'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.position)
                                                  from public.workshop_quote_items i where i.version_id = qv.id), '[]'::jsonb))
                             order by qv.version_no desc)
                            from public.workshop_quote_versions qv where qv.quote_id = q.id), '[]'::jsonb),
    'approvals', coalesce((select jsonb_agg(to_jsonb(a) - 'ip' - 'user_agent' order by a.created_at desc)
                             from public.workshop_quote_approvals a where a.quote_id = q.id and a.organization_id = p_org), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(e) - 'actor_user_id' order by e.created_at desc)
                          from public.workshop_quote_events e where e.quote_id = q.id and e.organization_id = p_org), '[]'::jsonb),
    'link', (select jsonb_build_object('created_at', s.created_at, 'expires_at', s.expires_at, 'revoked_at', s.revoked_at,
                       'revoked_reason', s.revoked_reason, 'first_viewed_at', s.first_viewed_at,
                       'last_viewed_at', s.last_viewed_at, 'view_count', s.view_count, 'decided_at', s.decided_at,
                       'active', s.revoked_at is null and s.decided_at is null and s.expires_at > now())
               from public.workshop_quote_shares s where s.quote_id = q.id order by s.created_at desc limit 1));
end;
$$;

-- Painel da oficina (PRD 2.1 §3, parte que existe na Fase 1). Valor orçado ≠ recebido.
create or replace function public.workshop_dashboard(p_org uuid, p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_from timestamptz := ((coalesce(p_from, date_trunc('month', now() at time zone 'America/Sao_Paulo')::date))::timestamp at time zone 'America/Sao_Paulo');
        v_to   timestamptz := ((coalesce(p_to, (now() at time zone 'America/Sao_Paulo')::date) + 1)::timestamp at time zone 'America/Sao_Paulo');
        v_today timestamptz := (((now() at time zone 'America/Sao_Paulo')::date)::timestamp at time zone 'America/Sao_Paulo');
begin
  perform public.wq_assert(p_org, 'member');
  return (
    select jsonb_build_object(
      'today_quotes', count(*) filter (where q.created_at >= v_today),
      'drafts', count(*) filter (where q.status = 'draft'),
      'awaiting', count(*) filter (where q.status in ('sent', 'viewed')),
      'awaiting_no_view', count(*) filter (where q.status = 'sent' and qv.sent_at < now() - interval '2 days'),
      'expiring_soon', count(*) filter (where q.status in ('sent', 'viewed') and qv.valid_until <= (now() at time zone 'America/Sao_Paulo')::date + 1),
      'expired_period', count(*) filter (where q.status = 'expired' and q.updated_at >= v_from and q.updated_at < v_to),
      'approved_period', count(*) filter (where q.status in ('approved', 'partially_approved') and q.decided_at >= v_from and q.decided_at < v_to),
      'rejected_period', count(*) filter (where q.status = 'rejected' and q.decided_at >= v_from and q.decided_at < v_to),
      'sent_period', count(*) filter (where qv1.sent_at >= v_from and qv1.sent_at < v_to),
      'quoted_cents_period', coalesce(sum(qv.total_cents) filter (where qv1.sent_at >= v_from and qv1.sent_at < v_to), 0),
      'approved_cents_period', coalesce(sum(q.approved_total_cents) filter (where q.status in ('approved', 'partially_approved')
                                         and q.decided_at >= v_from and q.decided_at < v_to), 0),
      'awaiting_cents', coalesce(sum(qv.total_cents) filter (where q.status in ('sent', 'viewed')), 0),
      'customers', (select count(*) from public.workshop_customers c where c.organization_id = p_org and c.status = 'active'),
      'new_customers_period', (select count(*) from public.workshop_customers c where c.organization_id = p_org
                                 and c.created_at >= v_from and c.created_at < v_to),
      'vehicles', (select count(*) from public.workshop_vehicles v where v.organization_id = p_org and v.status = 'active'),
      'services', (select count(*) from public.workshop_service_catalog s where s.organization_id = p_org and s.active),
      'from', v_from, 'to', v_to)
      from public.workshop_quotes q
      join public.workshop_quote_versions qv on qv.quote_id = q.id and qv.version_no = q.current_version
      left join public.workshop_quote_versions qv1 on qv1.quote_id = q.id and qv1.version_no = 1
     where q.organization_id = p_org);
end;
$$;

-- -----------------------------------------------------------------------------
-- Página pública de aprovação (sem conta). Rate limit por conexão.
-- -----------------------------------------------------------------------------
create or replace function public.wq_share_by_token(p_token text)
returns public.workshop_quote_shares
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare s public.workshop_quote_shares;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then return null; end if;
  if not public.anon_rate_limit_ok('quote_link', 'quote_link_requests_per_hour') then
    raise exception 'Muitas consultas a partir desta conexão. Tente de novo em alguns minutos.' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  select * into s from public.workshop_quote_shares where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  return s;
end;
$$;
revoke execute on function public.wq_share_by_token(text) from public, anon, authenticated;

create or replace function public.wq_public_payload(s public.workshop_quote_shares)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'number', q.number, 'version_no', qv.version_no, 'status', q.status,
    'is_complement', q.parent_quote_id is not null, 'complement_reason', q.complement_reason,
    'parent_number', (select p.number from public.workshop_quotes p where p.id = q.parent_quote_id),
    'issued_at', qv.sent_at, 'valid_until', qv.valid_until, 'km', qv.km, 'problem', qv.problem, 'diagnosis', qv.diagnosis,
    'notes', qv.notes, 'payment_terms', qv.payment_terms, 'estimated_days', qv.estimated_days,
    'subtotal_cents', qv.subtotal_cents, 'discount_type', qv.discount_type, 'discount_value', qv.discount_value,
    'discount_cents', qv.discount_cents, 'total_cents', qv.total_cents,
    'customer_name', c.full_name,
    'vehicle', case when v.id is not null then jsonb_build_object('brand', v.brand, 'model', v.model, 'version', v.version,
                    'year', v.year, 'plate', v.plate, 'color', v.color) end,
    'workshop', jsonb_build_object('business_name', w.business_name, 'cnpj', w.cnpj, 'phone', w.phone, 'whatsapp', w.whatsapp,
                    'email', w.email, 'address', w.address, 'city', w.city, 'state', w.state, 'logo_url', w.logo_url,
                    'public_slug', case when w.is_public then w.public_slug end),
    'items', coalesce((select jsonb_agg(jsonb_build_object('position', i.position, 'kind', i.kind, 'description', i.description,
                         'quantity', i.quantity, 'unit_price_cents', i.unit_price_cents, 'subtotal_cents', i.subtotal_cents,
                         'notes', i.notes) order by i.position)
                         from public.workshop_quote_items i where i.version_id = qv.id), '[]'::jsonb),
    'decision', (select jsonb_build_object('decision', a.decision, 'approved_positions', a.approved_positions,
                         'rejected_positions', a.rejected_positions, 'approved_total_cents', a.approved_total_cents,
                         'signer_name', a.signer_name, 'reason', a.reason, 'receipt_code', a.receipt_code,
                         'created_at', a.created_at, 'terms_version', a.terms_version)
                   from public.workshop_quote_approvals a where a.version_id = qv.id))
    from public.workshop_quote_versions qv
    join public.workshop_quotes q on q.id = qv.quote_id
    join public.workshop_customers c on c.id = q.customer_id
    left join public.workshop_vehicles v on v.id = q.vehicle_id
    join public.workshops w on w.organization_id = q.organization_id
   where qv.id = s.version_id;
$$;
revoke execute on function public.wq_public_payload(public.workshop_quote_shares) from public, anon, authenticated;

create or replace function public.get_quote_by_token(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare s public.workshop_quote_shares;
        q public.workshop_quotes;
        v_state text;
begin
  s := public.wq_share_by_token(p_token);
  if s.id is null then return jsonb_build_object('state', 'not_found'); end if;
  select * into q from public.workshop_quotes where id = s.quote_id;
  if s.decided_at is not null or exists (select 1 from public.workshop_quote_approvals a where a.version_id = s.version_id) then
    v_state := 'decided';
  elsif s.revoked_at is not null then
    return jsonb_build_object('state', case when s.revoked_reason in ('resent', 'revised') then 'replaced' else 'revoked' end,
                              'workshop', (select business_name from public.workshops where organization_id = s.organization_id));
  elsif q.status = 'canceled' then
    return jsonb_build_object('state', 'revoked', 'workshop', (select business_name from public.workshops where organization_id = s.organization_id));
  elsif s.expires_at <= now() or q.status = 'expired' then
    v_state := 'expired';
  else
    v_state := 'open';
  end if;

  update public.workshop_quote_shares
     set first_viewed_at = coalesce(first_viewed_at, now()), last_viewed_at = now(), view_count = view_count + 1
   where id = s.id;
  if v_state = 'open' and q.status = 'sent' then
    update public.workshop_quotes set status = 'viewed' where id = q.id;
    perform public.wq_event(q.organization_id, q.id, q.current_version, 'viewed', '{}', 'Cliente');
    perform public.wq_notify_team(q.organization_id, 'quote_viewed', 'Orçamento #' || q.number || ' visualizado',
      'O cliente abriu o orçamento.', '/oficina/' || q.organization_id || '/orcamentos/' || q.id,
      'quote_viewed:' || s.id::text);
  end if;
  return jsonb_build_object('state', v_state, 'terms_version', 'orcamento-v1') || public.wq_public_payload(s);
end;
$$;

create or replace function public.decide_quote_by_token(p_token text, p_approved_positions integer[], p_signer_name text,
                                                        p_confirmed boolean, p_reason text default null,
                                                        p_session text default null, p_terms_version text default 'orcamento-v1')
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare s public.workshop_quote_shares;
        q public.workshop_quotes;
        v public.workshop_quote_versions;
        v_all int[];
        v_ok int[];
        v_no int[];
        v_sub bigint;
        v_total bigint;
        v_decision text;
        v_code text := upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 10));
        v_headers jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
        v_ip text;
        v_name text := btrim(coalesce(p_signer_name, ''));
        v_confirm text;
begin
  s := public.wq_share_by_token(p_token);
  if s.id is null then raise exception 'Link inválido.' using errcode = 'P0002'; end if;
  select * into q from public.workshop_quotes where id = s.quote_id for update;
  select * into v from public.workshop_quote_versions where id = s.version_id;
  if s.decided_at is not null or exists (select 1 from public.workshop_quote_approvals where version_id = v.id) then
    raise exception 'Este orçamento já recebeu uma resposta.' using errcode = 'P0001';
  end if;
  if s.revoked_at is not null or q.status = 'canceled' then
    raise exception 'Este link não vale mais. Peça um novo à oficina.' using errcode = 'P0001';
  end if;
  if s.expires_at <= now() or q.status = 'expired' or v.valid_until < (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'O prazo deste orçamento venceu. Peça um novo à oficina.' using errcode = 'P0001';
  end if;
  if v.status <> 'sent' or q.status not in ('sent', 'viewed') or q.current_version <> v.version_no then
    raise exception 'Este orçamento não está aguardando resposta.' using errcode = 'P0001';
  end if;
  if not coalesce(p_confirmed, false) then
    raise exception 'Confirme a sua decisão.' using errcode = '22023';
  end if;
  if char_length(v_name) < 3 or char_length(v_name) > 120 then
    raise exception 'Informe o seu nome completo.' using errcode = '22023';
  end if;

  select array_agg(position order by position) into v_all from public.workshop_quote_items where version_id = v.id;
  select coalesce(array_agg(x order by x), '{}') into v_ok from (select distinct unnest(coalesce(p_approved_positions, '{}')) x) t
   where x = any (v_all);
  if cardinality(v_ok) <> cardinality(array(select distinct unnest(coalesce(p_approved_positions, '{}')))) then
    raise exception 'Itens inválidos.' using errcode = '22023';
  end if;
  select coalesce(array_agg(x order by x), '{}') into v_no from unnest(v_all) x where not (x = any (v_ok));
  select coalesce(sum(subtotal_cents), 0) into v_sub from public.workshop_quote_items where version_id = v.id and position = any (v_ok);
  -- Desconto proporcional aos itens aprovados.
  v_total := case v.discount_type
               when 'percent' then v_sub - round(v_sub * v.discount_value / 100.0)
               when 'amount' then v_sub - case when v.subtotal_cents > 0 then round(v.discount_cents::numeric * v_sub / v.subtotal_cents) else 0 end
               else v_sub end;
  v_decision := case when cardinality(v_ok) = 0 then 'rejected'
                     when cardinality(v_ok) = cardinality(v_all) then 'approved' else 'partial' end;
  v_confirm := case v_decision
                 when 'approved' then 'Autorizo a execução de todos os itens deste orçamento.'
                 when 'partial' then 'Autorizo somente a execução dos itens marcados; os demais estão recusados.'
                 else 'Recuso este orçamento.' end;
  v_ip := nullif(trim(coalesce(v_headers ->> 'cf-connecting-ip', split_part(v_headers ->> 'x-forwarded-for', ',', 1), v_headers ->> 'x-real-ip')), '');

  insert into public.workshop_quote_approvals (organization_id, quote_id, version_id, share_id, decision, approved_positions,
                                               rejected_positions, approved_total_cents, signer_name, reason, confirmation_text,
                                               terms_version, session_id, ip, user_agent, receipt_code)
  values (q.organization_id, q.id, v.id, s.id, v_decision, v_ok, v_no, case when v_decision = 'rejected' then 0 else v_total end,
          v_name, nullif(btrim(coalesce(p_reason, '')), ''), v_confirm, coalesce(nullif(p_terms_version, ''), 'orcamento-v1'),
          case when p_session ~ '^[A-Za-z0-9_-]{8,64}$' then p_session end, left(v_ip, 64), left(v_headers ->> 'user-agent', 300), v_code);
  update public.workshop_quote_shares set decided_at = now() where id = s.id;
  update public.workshop_quote_versions set status = 'decided' where id = v.id;
  update public.workshop_quotes
     set status = case v_decision when 'approved' then 'approved' when 'partial' then 'partially_approved' else 'rejected' end,
         approved_total_cents = case when v_decision = 'rejected' then 0 else v_total end, decided_at = now()
   where id = q.id;
  perform public.wq_event(q.organization_id, q.id, v.version_no,
          case v_decision when 'approved' then 'approved' when 'partial' then 'partially_approved' else 'rejected' end,
          jsonb_build_object('signer_name', v_name, 'approved_positions', v_ok, 'rejected_positions', v_no,
                             'approved_total_cents', v_total, 'receipt_code', v_code), 'Cliente: ' || v_name);
  perform public.wq_notify_team(q.organization_id, 'quote_decided',
    'Orçamento #' || q.number || ' ' || case v_decision when 'approved' then 'aprovado' when 'partial' then 'aprovado em parte' else 'recusado' end,
    v_name || case v_decision when 'rejected' then ' recusou o orçamento.'
                              else ' autorizou ' || cardinality(v_ok) || ' de ' || cardinality(v_all) || ' itens.' end,
    '/oficina/' || q.organization_id || '/orcamentos/' || q.id, 'quote_decided:' || v.id::text);
  return jsonb_build_object('state', 'decided', 'terms_version', 'orcamento-v1') || public.wq_public_payload(s);
end;
$$;

-- Vencimento diário (só o servidor).
create or replace function public.workshop_expire_quotes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare r record;
        n int := 0;
begin
  for r in select q.id, q.organization_id, q.number, q.current_version
             from public.workshop_quotes q
             join public.workshop_quote_versions v on v.quote_id = q.id and v.version_no = q.current_version
            where q.status in ('sent', 'viewed') and v.valid_until < (now() at time zone 'America/Sao_Paulo')::date
            for update of q skip locked loop
    update public.workshop_quotes set status = 'expired' where id = r.id;
    perform public.wq_event(r.organization_id, r.id, r.current_version, 'expired', '{}', 'Sistema');
    perform public.wq_notify_team(r.organization_id, 'quote_expired', 'Orçamento #' || r.number || ' venceu',
      'O prazo terminou sem resposta do cliente. Você pode criar uma nova versão e reenviar.',
      '/oficina/' || r.organization_id || '/orcamentos/' || r.id, 'quote_expired:' || r.id::text || ':' || r.current_version);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- -----------------------------------------------------------------------------
-- Avisos novos
-- -----------------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'workshop_access_request', 'workshop_access_decided', 'workshop_access_revoked', 'workshop_service',
  'transfer_received', 'transfer_decided', 'reminder_due', 'subscription_ending', 'payment_approved',
  'payment_failed', 'storage_limit', 'claim_decided', 'ownership_notice', 'admin_notice',
  'care_checkup', 'oil_change', 'quote_viewed', 'quote_decided', 'quote_expired'));

create or replace function public.notification_kind_optional(p_kind text)
returns boolean
language sql
immutable
set search_path = ''
as $$ select p_kind in ('reminder_due', 'storage_limit', 'subscription_ending', 'workshop_service', 'care_checkup', 'oil_change',
                        'quote_viewed', 'quote_expired') $$;

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
                      'quote_viewed', 'quote_decided', 'quote_expired']) k(kind)
    left join public.notification_preferences p on p.user_id = auth.uid() and p.kind = k.kind;
$$;

-- -----------------------------------------------------------------------------
-- Permissões de execução
-- -----------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'get_my_workshop_permissions(uuid)', 'get_org_member_extra_permissions(uuid)',
    'set_org_member_extra_permissions(uuid, boolean, boolean)',
    'workshop_save_customer(uuid, uuid, jsonb)', 'workshop_set_customer_status(uuid, uuid, text)',
    'workshop_list_customers(uuid, text, boolean)', 'workshop_get_customer(uuid, uuid)',
    'workshop_save_vehicle(uuid, uuid, uuid, jsonb)', 'workshop_list_vehicles(uuid, text)',
    'workshop_link_vehicle_passport(uuid, uuid, uuid)',
    'workshop_save_service(uuid, uuid, jsonb)', 'workshop_save_price_table(uuid, uuid, text, text, boolean, boolean)',
    'workshop_save_price_rule(uuid, uuid, jsonb)', 'workshop_delete_price_rule(uuid, uuid)', 'workshop_list_catalog(uuid)',
    'workshop_suggest_price(uuid, uuid, uuid, uuid, text)',
    'workshop_create_quote(uuid, uuid, uuid, uuid, text)', 'workshop_save_quote_draft(uuid, uuid, jsonb)',
    'workshop_send_quote(uuid, uuid)', 'workshop_revise_quote(uuid, uuid, text)', 'workshop_revoke_quote_link(uuid, uuid)',
    'workshop_cancel_quote(uuid, uuid, text)', 'workshop_log_quote_event(uuid, uuid, text)',
    'workshop_list_quotes(uuid, text, text)', 'workshop_get_quote(uuid, uuid)', 'workshop_dashboard(uuid, date, date)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['get_quote_by_token(text)',
                           'decide_quote_by_token(text, integer[], text, boolean, text, text, text)'] loop
    execute format('revoke execute on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
  revoke execute on function public.workshop_expire_quotes() from public, anon, authenticated;
  grant execute on function public.workshop_expire_quotes() to service_role;
end $$;

-- Vencimento: todo dia 00:20 em Brasília.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'moto-passaporte-quotes-expire';
    perform cron.schedule('moto-passaporte-quotes-expire', '20 3 * * *', 'select public.workshop_expire_quotes()');
  end if;
end $$;
