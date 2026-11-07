-- =============================================================================
-- Moto Passaporte — Migração: registros de manutenção e peças (Fase 2, PRD 5.4/5.5)
-- Objetivo: linha do tempo técnica da moto. Registros são imutáveis; correção e
--           anulação geram novos registros que apontam para o original (PRD 6.7, 14).
-- Dependências: motorcycles (mileage_records, is_current_owner), base (auditoria).
-- Reversão: drop view maintenance_timeline; drop functions create_maintenance_record,
--           void_maintenance_record; drop tables maintenance_items, maintenance_records;
--           drop type maintenance_category; drop function prevent_any_mutation.
-- =============================================================================

-- Categorias do PRD 5.4
create type public.maintenance_category as enum (
  'revision', 'oil_change', 'filters', 'brakes', 'tires', 'suspension', 'engine',
  'transmission', 'electrical', 'battery', 'cooling', 'accessories', 'modifications',
  'repairs', 'accident', 'inspection', 'other'
);

create or replace function public.prevent_any_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Registro histórico não pode ser alterado ou excluído (%). Use um registro de correção.', tg_table_name
    using errcode = '42501';
end;
$$;

revoke execute on function public.prevent_any_mutation() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Registros
-- -----------------------------------------------------------------------------

create table public.maintenance_records (
  id                  uuid primary key default gen_random_uuid(),
  motorcycle_id       uuid not null references public.motorcycles (id) on delete restrict,
  category            public.maintenance_category not null,
  title               text not null check (char_length(title) between 2 and 120),
  description         text check (description is null or char_length(description) <= 4000),
  service_date        date not null check (service_date >= date '1885-01-01'),
  mileage             integer check (mileage is null or mileage between 0 and 2000000),
  mileage_record_id   uuid references public.mileage_records (id) on delete restrict,
  source_type         public.record_source not null,
  -- Oficina participante que registrou/confirmou (Fase 3).
  organization_id     uuid references public.organizations (id) on delete restrict,
  -- Oficina informada pelo dono, em texto livre (não confirma nada).
  workshop_name       text check (workshop_name is null or char_length(workshop_name) <= 120),
  service_value_cents bigint check (service_value_cents is null or service_value_cents between 0 and 100000000000),
  notes               text check (notes is null or char_length(notes) <= 2000),
  corrects_record_id  uuid references public.maintenance_records (id) on delete restrict,
  correction_reason   text check (correction_reason is null or char_length(correction_reason) between 3 and 500),
  is_void             boolean not null default false,
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  check (source_type <> 'workshop' or organization_id is not null),
  check ((corrects_record_id is null) = (correction_reason is null)),
  check (not is_void or corrects_record_id is not null)
);

comment on table public.maintenance_records is
  'Linha do tempo técnica. Imutável: correções e anulações são novos registros (corrects_record_id). Origem indica evidência, não certificação.';

create index maintenance_records_timeline_idx on public.maintenance_records (motorcycle_id, service_date desc, created_at desc);
create index maintenance_records_org_idx      on public.maintenance_records (organization_id) where organization_id is not null;
create index maintenance_records_created_by_idx on public.maintenance_records (created_by);
create index maintenance_records_mileage_idx  on public.maintenance_records (mileage_record_id) where mileage_record_id is not null;
-- Cada registro pode ser corrigido/anulado uma única vez (cadeia linear de versões).
create unique index maintenance_records_corrects_uidx on public.maintenance_records (corrects_record_id) where corrects_record_id is not null;

create trigger maintenance_records_immutable
  before update or delete on public.maintenance_records
  for each row execute function public.prevent_history_mutation();

create trigger maintenance_records_audit
  after insert on public.maintenance_records
  for each row execute function public.audit_row_change('motorcycle_id', 'organization_id');

-- -----------------------------------------------------------------------------
-- Peças e componentes
-- -----------------------------------------------------------------------------

create table public.maintenance_items (
  id                    uuid primary key default gen_random_uuid(),
  maintenance_record_id uuid not null references public.maintenance_records (id) on delete restrict,
  item_name             text not null check (char_length(item_name) between 1 and 120),
  brand                 text check (brand is null or char_length(brand) <= 80),
  part_number           text check (part_number is null or char_length(part_number) <= 60),
  quantity              numeric(10, 2) not null default 1 check (quantity > 0 and quantity <= 10000),
  notes                 text check (notes is null or char_length(notes) <= 300),
  created_at            timestamptz not null default now()
);

create index maintenance_items_record_idx on public.maintenance_items (maintenance_record_id);

create trigger maintenance_items_immutable
  before update or delete on public.maintenance_items
  for each row execute function public.prevent_any_mutation();

-- -----------------------------------------------------------------------------
-- RLS — leitura pelo titular atual (oficinas autorizadas entram na Fase 3).
-- Escrita somente pelas funções abaixo.
-- -----------------------------------------------------------------------------

alter table public.maintenance_records enable row level security;
alter table public.maintenance_items   enable row level security;

revoke all on public.maintenance_records from anon, authenticated;
revoke all on public.maintenance_items   from anon, authenticated;
grant select on public.maintenance_records to authenticated;
grant select on public.maintenance_items   to authenticated;

create policy maintenance_records_select on public.maintenance_records
  for select to authenticated
  using (public.is_current_owner(motorcycle_id));

create policy maintenance_items_select on public.maintenance_items
  for select to authenticated
  using (exists (
    select 1 from public.maintenance_records r
    where r.id = maintenance_record_id and public.is_current_owner(r.motorcycle_id)
  ));

-- -----------------------------------------------------------------------------
-- Operação: criar registro (ou correção de um registro existente)
-- p_items: [{"item_name": "...", "brand": "...", "part_number": "...", "quantity": 1, "notes": "..."}]
-- Retorno: {id, below_previous}
-- -----------------------------------------------------------------------------

create or replace function public.create_maintenance_record(
  p_motorcycle_id       uuid,
  p_category            public.maintenance_category,
  p_title               text,
  p_service_date        date,
  p_description         text    default null,
  p_mileage             integer default null,
  p_workshop_name       text    default null,
  p_service_value_cents bigint  default null,
  p_notes               text    default null,
  p_items               jsonb   default '[]'::jsonb,
  p_corrects_record_id  uuid    default null,
  p_correction_reason   text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_original  public.maintenance_records;
  v_mileage   uuid;
  v_below     boolean := false;
  v_id        uuid;
  v_item      jsonb;
  v_items     jsonb := coalesce(p_items, '[]'::jsonb);
begin
  if not public.is_current_owner(p_motorcycle_id) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;

  -- Validações
  if nullif(trim(p_title), '') is null or char_length(trim(p_title)) < 2 then
    raise exception 'Informe um título para o registro.' using errcode = '22023';
  end if;
  if p_service_date is null or p_service_date > current_date then
    raise exception 'A data do serviço não pode estar no futuro.' using errcode = '22023';
  end if;
  if p_mileage is not null and p_mileage < 0 then
    raise exception 'Quilometragem inválida.' using errcode = '22023';
  end if;
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) > 50 then
    raise exception 'Informe no máximo 50 peças por registro.' using errcode = '22023';
  end if;

  -- Correção
  if p_corrects_record_id is not null then
    select * into v_original from public.maintenance_records
      where id = p_corrects_record_id and motorcycle_id = p_motorcycle_id
      for update;
    if not found then
      raise exception 'Registro a corrigir não encontrado nesta motocicleta.' using errcode = '22023';
    end if;
    if v_original.is_void then
      raise exception 'Este registro foi anulado e não pode ser corrigido.' using errcode = 'P0001';
    end if;
    if v_original.source_type = 'workshop' then
      raise exception 'Registros confirmados por oficina só podem ser corrigidos pela oficina.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.maintenance_records where corrects_record_id = p_corrects_record_id) then
      raise exception 'Este registro já foi corrigido. Corrija a versão mais recente.' using errcode = 'P0001';
    end if;
    if nullif(trim(p_correction_reason), '') is null or char_length(trim(p_correction_reason)) < 3 then
      raise exception 'Explique o motivo da correção.' using errcode = '22023';
    end if;
  end if;

  -- Quilometragem: reaproveita a leitura original se não mudou; senão registra (ou corrige) a leitura.
  if p_mileage is not null then
    if v_original.id is not null and v_original.mileage_record_id is not null and v_original.mileage = p_mileage then
      v_mileage := v_original.mileage_record_id;
    else
      insert into public.mileage_records
        (motorcycle_id, mileage, recorded_at, source_type, created_by, note, corrects_record_id)
      values (
        p_motorcycle_id, p_mileage, p_service_date, 'owner', v_uid,
        left(case when v_original.mileage_record_id is not null
                  then 'Correção: ' || trim(p_correction_reason)
                  else 'Registrada com: ' || trim(p_title) end, 500),
        v_original.mileage_record_id
      )
      returning id, below_previous into v_mileage, v_below;
    end if;
  end if;

  insert into public.maintenance_records (
    motorcycle_id, category, title, description, service_date, mileage, mileage_record_id,
    source_type, workshop_name, service_value_cents, notes,
    corrects_record_id, correction_reason, created_by
  ) values (
    p_motorcycle_id, p_category, trim(p_title), nullif(trim(p_description), ''), p_service_date, p_mileage, v_mileage,
    'owner', nullif(trim(p_workshop_name), ''), p_service_value_cents, nullif(trim(p_notes), ''),
    p_corrects_record_id, nullif(trim(p_correction_reason), ''), v_uid
  )
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(v_items) loop
    if nullif(trim(v_item ->> 'item_name'), '') is null then
      raise exception 'Cada peça precisa de um nome.' using errcode = '22023';
    end if;
    insert into public.maintenance_items (maintenance_record_id, item_name, brand, part_number, quantity, notes)
    values (
      v_id,
      trim(v_item ->> 'item_name'),
      nullif(trim(v_item ->> 'brand'), ''),
      nullif(trim(v_item ->> 'part_number'), ''),
      coalesce(nullif(v_item ->> 'quantity', '')::numeric, 1),
      nullif(trim(v_item ->> 'notes'), '')
    );
  end loop;

  return jsonb_build_object('id', v_id, 'below_previous', coalesce(v_below, false));

exception
  when unique_violation then
    raise exception 'Este registro já foi corrigido. Corrija a versão mais recente.' using errcode = 'P0001';
end;
$$;

-- -----------------------------------------------------------------------------
-- Operação: anular registro (lançado por engano). O original continua visível.
-- -----------------------------------------------------------------------------

create or replace function public.void_maintenance_record(p_record_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_original public.maintenance_records;
  v_id       uuid;
begin
  select * into v_original from public.maintenance_records where id = p_record_id for update;
  if not found or not public.is_current_owner(v_original.motorcycle_id) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  if v_original.is_void then
    raise exception 'Este registro já é uma anulação.' using errcode = 'P0001';
  end if;
  if v_original.source_type = 'workshop' then
    raise exception 'Registros confirmados por oficina só podem ser corrigidos pela oficina.' using errcode = 'P0001';
  end if;
  if nullif(trim(p_reason), '') is null or char_length(trim(p_reason)) < 3 then
    raise exception 'Explique o motivo da anulação.' using errcode = '22023';
  end if;

  insert into public.maintenance_records (
    motorcycle_id, category, title, service_date, source_type,
    corrects_record_id, correction_reason, is_void, created_by
  ) values (
    v_original.motorcycle_id, v_original.category, v_original.title, v_original.service_date, 'owner',
    v_original.id, trim(p_reason), true, auth.uid()
  )
  returning id into v_id;
  return v_id;

exception
  when unique_violation then
    raise exception 'Este registro já foi corrigido. Corrija a versão mais recente.' using errcode = 'P0001';
end;
$$;

revoke execute on function public.create_maintenance_record(uuid, public.maintenance_category, text, date, text, integer, text, bigint, text, jsonb, uuid, text) from public, anon;
revoke execute on function public.void_maintenance_record(uuid, text) from public, anon;
grant  execute on function public.create_maintenance_record(uuid, public.maintenance_category, text, date, text, integer, text, bigint, text, jsonb, uuid, text) to authenticated;
grant  execute on function public.void_maintenance_record(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- View da linha do tempo (respeita a RLS do usuário)
-- status: 'current' (vigente), 'superseded' (substituído por correção/anulação)
-- -----------------------------------------------------------------------------

create view public.maintenance_timeline
with (security_invoker = true)
as
select
  r.id,
  r.motorcycle_id,
  r.category,
  r.title,
  r.description,
  r.service_date,
  r.mileage,
  r.source_type,
  r.organization_id,
  r.workshop_name,
  r.service_value_cents,
  r.notes,
  r.corrects_record_id,
  r.correction_reason,
  r.is_void,
  r.created_at,
  case when exists (select 1 from public.maintenance_records c where c.corrects_record_id = r.id)
       then 'superseded' else 'current' end as status,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', i.id, 'item_name', i.item_name, 'brand', i.brand,
      'part_number', i.part_number, 'quantity', i.quantity, 'notes', i.notes
    ) order by i.created_at, i.item_name)
    from public.maintenance_items i
    where i.maintenance_record_id = r.id
  ), '[]'::jsonb) as items
from public.maintenance_records r;

revoke all on public.maintenance_timeline from anon, authenticated;
grant select on public.maintenance_timeline to authenticated;
