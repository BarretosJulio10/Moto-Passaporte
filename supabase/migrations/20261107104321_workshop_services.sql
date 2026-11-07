-- =============================================================================
-- Moto Passaporte — Migração: registro de serviço pela oficina (Fase 3, PRD 6.7; item 3.7; ADR-015)
-- Objetivo: oficina autorizada, por membro com permissão "registrar serviços",
--           lança serviço com peças, km, valor, observações e comprovantes.
--           Origem "workshop" (Confirmado por oficina), com oficina e funcionário
--           identificados. Só a própria oficina corrige (novo registro).
--           A oficina vê o histórico técnico da moto; valor, observações e
--           comprovantes só dos próprios registros. Comprovantes da oficina
--           contam na cota da oficina, não do titular.
-- Dependências: maintenance, attachments, diary, workshop_access, workshop_team.
-- Reversão: drop functions create_workshop_service, get_workshop_timeline,
--           register_workshop_attachment, get_workshop_storage_usage; recriar
--           can_upload_attachment_object, can_access_attachment_object,
--           get_storage_usage, política attachments_select e view
--           maintenance_timeline das migrações anteriores; alter table drop column
--           maintenance_records.recorded_by_name, attachments.organization_id;
--           delete setting workshop_storage_quota_mb.
-- =============================================================================

insert into public.system_settings (key, value, description, is_public) values
  ('workshop_storage_quota_mb', '500', 'Espaço para comprovantes enviados por cada oficina, em MB.', false)
on conflict (key) do nothing;

alter table public.maintenance_records
  add column recorded_by_name text check (recorded_by_name is null or char_length(recorded_by_name) <= 120);
comment on column public.maintenance_records.recorded_by_name is
  'Nome de quem registrou pela oficina, no momento do registro (PRD 6.7: identificar o funcionário).';

alter table public.attachments
  add column organization_id uuid references public.organizations (id) on delete restrict;
create index attachments_org_idx on public.attachments (organization_id) where organization_id is not null;
comment on column public.attachments.organization_id is
  'Oficina que enviou o comprovante (conta na cota da oficina).';

-- -----------------------------------------------------------------------------
-- Linha do tempo (titular) passa a mostrar quem registrou pela oficina.
-- -----------------------------------------------------------------------------

drop view public.maintenance_timeline;

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
  ), '[]'::jsonb) as items,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'storage_path', a.storage_path, 'file_name', a.file_name,
      'mime_type', a.mime_type, 'file_size', a.file_size, 'kind', a.kind, 'created_at', a.created_at
    ) order by a.created_at)
    from public.attachments a
    where a.maintenance_record_id = r.id
  ), '[]'::jsonb) as attachments,
  case
    when r.source_type = 'workshop' then 'workshop'
    when r.source_type = 'document'
      or exists (select 1 from public.attachments a where a.maintenance_record_id = r.id) then 'document'
    else 'owner'
  end::public.record_source as evidence_level,
  r.recorded_by_name
from public.maintenance_records r;

revoke all on public.maintenance_timeline from anon, authenticated;
grant select on public.maintenance_timeline to authenticated;

-- -----------------------------------------------------------------------------
-- Registrar serviço pela oficina
-- -----------------------------------------------------------------------------

create or replace function public.create_workshop_service(
  p_organization_id     uuid,
  p_motorcycle_id       uuid,
  p_category            public.maintenance_category,
  p_title               text,
  p_service_date        date,
  p_description         text    default null,
  p_mileage             integer default null,
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
  v_uid      uuid := auth.uid();
  v_original public.maintenance_records;
  v_mileage  uuid;
  v_below    boolean := false;
  v_id       uuid;
  v_item     jsonb;
  v_items    jsonb := coalesce(p_items, '[]'::jsonb);
  v_shop     text;
  v_person   text;
begin
  if not public.workshop_has_access(p_motorcycle_id, p_organization_id)
     or not public.has_org_permission(p_organization_id, 'register_services') then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;

  if nullif(trim(p_title), '') is null or char_length(trim(p_title)) < 2 then
    raise exception 'Informe um título para o serviço.' using errcode = '22023';
  end if;
  if p_service_date is null or p_service_date > current_date then
    raise exception 'A data do serviço não pode estar no futuro.' using errcode = '22023';
  end if;
  if p_mileage is not null and p_mileage < 0 then
    raise exception 'Quilometragem inválida.' using errcode = '22023';
  end if;
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) > 50 then
    raise exception 'Informe no máximo 50 peças por serviço.' using errcode = '22023';
  end if;

  if p_corrects_record_id is not null then
    select * into v_original from public.maintenance_records
      where id = p_corrects_record_id and motorcycle_id = p_motorcycle_id
      for update;
    if not found then
      raise exception 'Registro a corrigir não encontrado nesta motocicleta.' using errcode = '22023';
    end if;
    if v_original.source_type <> 'workshop' or v_original.organization_id is distinct from p_organization_id then
      raise exception 'A oficina só corrige os próprios registros.' using errcode = '42501';
    end if;
    if v_original.is_void then
      raise exception 'Este registro foi anulado e não pode ser corrigido.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.maintenance_records where corrects_record_id = p_corrects_record_id) then
      raise exception 'Este registro já foi corrigido. Corrija a versão mais recente.' using errcode = 'P0001';
    end if;
    if nullif(trim(p_correction_reason), '') is null or char_length(trim(p_correction_reason)) < 3 then
      raise exception 'Explique o motivo da correção.' using errcode = '22023';
    end if;
  end if;

  select coalesce(w.business_name, o.name) into v_shop
    from public.organizations o left join public.workshops w on w.organization_id = o.id
   where o.id = p_organization_id;
  select left(nullif(trim(full_name), ''), 120) into v_person from public.profiles where id = v_uid;

  if p_mileage is not null then
    if v_original.id is not null and v_original.mileage_record_id is not null and v_original.mileage = p_mileage then
      v_mileage := v_original.mileage_record_id;
    else
      insert into public.mileage_records
        (motorcycle_id, mileage, recorded_at, source_type, organization_id, created_by, note, corrects_record_id)
      values (
        p_motorcycle_id, p_mileage, p_service_date, 'workshop', p_organization_id, v_uid,
        left(case when v_original.mileage_record_id is not null
                  then 'Correção: ' || trim(p_correction_reason)
                  else 'Registrada pela oficina com: ' || trim(p_title) end, 500),
        v_original.mileage_record_id
      )
      returning id, below_previous into v_mileage, v_below;
    end if;
  end if;

  insert into public.maintenance_records (
    motorcycle_id, category, title, description, service_date, mileage, mileage_record_id,
    source_type, organization_id, workshop_name, service_value_cents, notes,
    corrects_record_id, correction_reason, created_by, recorded_by_name
  ) values (
    p_motorcycle_id, p_category, trim(p_title), nullif(trim(p_description), ''), p_service_date, p_mileage, v_mileage,
    'workshop', p_organization_id, left(v_shop, 120), p_service_value_cents, nullif(trim(p_notes), ''),
    p_corrects_record_id, nullif(trim(p_correction_reason), ''), v_uid, v_person
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
revoke execute on function public.create_workshop_service(uuid, uuid, public.maintenance_category, text, date, text, integer, bigint, text, jsonb, uuid, text) from public, anon;
grant  execute on function public.create_workshop_service(uuid, uuid, public.maintenance_category, text, date, text, integer, bigint, text, jsonb, uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Histórico visto pela oficina autorizada (ADR-015)
-- -----------------------------------------------------------------------------

create or replace function public.get_workshop_timeline(p_organization_id uuid, p_motorcycle_id uuid)
returns table (
  id uuid, category public.maintenance_category, title text, description text, service_date date,
  mileage integer, source_type public.record_source, evidence_level public.record_source,
  workshop_name text, is_own boolean, service_value_cents bigint, notes text,
  corrects_record_id uuid, correction_reason text, is_void boolean, status text, created_at timestamptz,
  recorded_by_name text, items jsonb, attachments jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.workshop_has_access(p_motorcycle_id, p_organization_id) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  return query
    select t.id, t.category, t.title, t.description, t.service_date, t.mileage, t.source_type, t.evidence_level,
           t.workshop_name, own.v,
           case when own.v then t.service_value_cents end,
           case when own.v then t.notes end,
           t.corrects_record_id, t.correction_reason, t.is_void, t.status, t.created_at,
           case when own.v then t.recorded_by_name end,
           t.items,
           case when own.v then t.attachments else '[]'::jsonb end
      from public.maintenance_timeline t
      cross join lateral (select t.organization_id is not distinct from p_organization_id and t.source_type = 'workshop' as v) own
     where t.motorcycle_id = p_motorcycle_id
     order by t.service_date desc, t.created_at desc;
end;
$$;
revoke execute on function public.get_workshop_timeline(uuid, uuid) from public, anon;
grant  execute on function public.get_workshop_timeline(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Comprovantes enviados pela oficina
-- -----------------------------------------------------------------------------

create or replace function public.get_workshop_storage_usage(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_org_member(p_organization_id) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'used_bytes', coalesce((select sum(file_size) from public.attachments where organization_id = p_organization_id), 0),
    'quota_bytes', public.setting_int('workshop_storage_quota_mb', 500)::bigint * 1048576,
    'max_file_bytes', public.setting_int('attachment_max_file_mb', 10)::bigint * 1048576
  );
end;
$$;
revoke execute on function public.get_workshop_storage_usage(uuid) from public, anon;
grant  execute on function public.get_workshop_storage_usage(uuid) to authenticated;

-- Cota do titular não conta comprovantes enviados por oficinas.
create or replace function public.get_storage_usage()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
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
    'quota_bytes', coalesce((select (value #>> '{}')::bigint from public.system_settings where key = 'free_plan_storage_quota_mb'), 100) * 1048576,
    'max_file_bytes', coalesce((select (value #>> '{}')::bigint from public.system_settings where key = 'attachment_max_file_mb'), 10) * 1048576
  );
$$;

create or replace function public.register_workshop_attachment(
  p_organization_id       uuid,
  p_storage_path          text,
  p_file_name             text,
  p_kind                  public.attachment_kind,
  p_maintenance_record_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_rec   public.maintenance_records;
  v_size  bigint;
  v_mime  text;
  v_owner text;
  v_usage jsonb;
  v_id    uuid;
begin
  select * into v_rec from public.maintenance_records where id = p_maintenance_record_id;
  if not found or v_rec.source_type <> 'workshop' or v_rec.organization_id is distinct from p_organization_id or v_rec.is_void
     or not public.workshop_has_access(v_rec.motorcycle_id, p_organization_id)
     or not public.has_org_permission(p_organization_id, 'register_services') then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  if split_part(coalesce(p_storage_path, ''), '/', 1) <> v_rec.motorcycle_id::text then
    raise exception 'Arquivo enviado para a pasta errada.' using errcode = '22023';
  end if;

  select (o.metadata ->> 'size')::bigint, o.metadata ->> 'mimetype', coalesce(o.owner_id, o.owner::text)
    into v_size, v_mime, v_owner
    from storage.objects o
    where o.bucket_id = 'attachments' and o.name = p_storage_path;
  if not found then
    raise exception 'Arquivo não encontrado. Envie de novo.' using errcode = '22023';
  end if;
  if v_owner is distinct from v_uid::text then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  if v_mime not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') then
    raise exception 'Tipo de arquivo não permitido. Envie foto (JPG, PNG, WEBP) ou PDF.' using errcode = '22023';
  end if;

  v_usage := public.get_workshop_storage_usage(p_organization_id);
  if v_size is null or v_size <= 0 or v_size > (v_usage ->> 'max_file_bytes')::bigint then
    raise exception 'Arquivo maior que o permitido.' using errcode = '22023';
  end if;
  if (v_usage ->> 'used_bytes')::bigint + v_size > (v_usage ->> 'quota_bytes')::bigint then
    raise exception 'O espaço para comprovantes da oficina acabou.' using errcode = 'P0001';
  end if;

  insert into public.attachments
    (motorcycle_id, maintenance_record_id, organization_id, storage_path, file_name, mime_type, file_size, kind, uploaded_by)
  values
    (v_rec.motorcycle_id, v_rec.id, p_organization_id, p_storage_path, left(trim(p_file_name), 200), v_mime, v_size, p_kind, v_uid)
  returning id into v_id;
  return v_id;

exception
  when unique_violation then
    raise exception 'Este arquivo já foi registrado.' using errcode = 'P0001';
end;
$$;
revoke execute on function public.register_workshop_attachment(uuid, text, text, public.attachment_kind, uuid) from public, anon;
grant  execute on function public.register_workshop_attachment(uuid, text, text, public.attachment_kind, uuid) to authenticated;

-- Envio: titular atual ou membro com permissão de oficina autorizada.
create or replace function public.can_upload_attachment_object(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_folder text := split_part(coalesce(p_name, ''), '/', 1);
begin
  if v_folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.is_current_owner(v_folder::uuid)
      or exists (
        select 1 from public.motorcycle_workshop_access a
         where a.motorcycle_id = v_folder::uuid and a.status = 'approved'
           and public.workshop_has_access(a.motorcycle_id, a.organization_id)
           and public.has_org_permission(a.organization_id, 'register_services'));
end;
$$;

-- Leitura: regras anteriores e, para comprovantes da oficina, a própria oficina autorizada.
create or replace function public.can_access_attachment_object(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a record;
begin
  if auth.uid() is null then
    return false;
  end if;
  select motorcycle_id, diary_entry_id, organization_id into a from public.attachments where storage_path = p_name;
  if found then
    return public.can_view_attachment(a.motorcycle_id, a.diary_entry_id)
        or (a.organization_id is not null and public.workshop_has_access(a.motorcycle_id, a.organization_id));
  end if;
  return exists (
    select 1 from storage.objects o
    where o.bucket_id = 'attachments' and o.name = p_name
      and coalesce(o.owner_id, o.owner::text) = auth.uid()::text);
end;
$$;

drop policy attachments_select on public.attachments;
create policy attachments_select on public.attachments
  for select to authenticated
  using (
    public.can_view_attachment(motorcycle_id, diary_entry_id)
    or (organization_id is not null and public.workshop_has_access(motorcycle_id, organization_id))
  );
