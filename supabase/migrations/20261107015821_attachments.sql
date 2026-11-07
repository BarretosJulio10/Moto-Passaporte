-- =============================================================================
-- Moto Passaporte — Migração: anexos (Fase 2, PRD 13, 5.5)
-- Objetivo: fotos e comprovantes em bucket PRIVADO, com metadados no banco,
--           cota por plano, acesso só do titular atual e URLs temporárias.
--           Anexos são permanentes no histórico (não podem ser apagados pelo usuário).
-- Dependências: motorcycles, maintenance.
-- Reversão: drop view maintenance_timeline e recriar a versão anterior; drop policies
--           em storage.objects (attachments_*); drop functions register_attachment,
--           get_storage_usage, can_access_attachment_object; drop table attachments;
--           drop type attachment_kind; delete bucket 'attachments' (após mover arquivos);
--           delete settings free_plan_storage_quota_mb e attachment_max_file_mb.
-- =============================================================================

insert into public.system_settings (key, value, description, is_public) values
  ('free_plan_storage_quota_mb', '100', 'Espaço para anexos no plano gratuito, em MB (hipótese PRD 13 — validar custos).', true),
  ('attachment_max_file_mb', '10', 'Tamanho máximo por arquivo, em MB.', true)
on conflict (key) do nothing;

-- Bucket privado. Tipos aceitos: imagens comuns e PDF. Sem vídeo (PRD 13.2).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create type public.attachment_kind as enum ('photo', 'invoice', 'service_order', 'receipt', 'document', 'other');

create table public.attachments (
  id                    uuid primary key default gen_random_uuid(),
  motorcycle_id         uuid not null references public.motorcycles (id) on delete restrict,
  maintenance_record_id uuid references public.maintenance_records (id) on delete restrict,
  storage_path          text not null unique
                        check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$'),
  file_name             text not null check (char_length(file_name) between 1 and 200),
  mime_type             text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  file_size             bigint not null check (file_size > 0),
  kind                  public.attachment_kind not null,
  uploaded_by           uuid references auth.users (id) on delete set null,
  created_at            timestamptz not null default now()
);

comment on table public.attachments is
  'Metadados de arquivos no bucket privado "attachments". O caminho começa pelo id da moto. Arquivos não têm URL pública permanente.';

create index attachments_motorcycle_idx  on public.attachments (motorcycle_id, created_at desc);
create index attachments_record_idx      on public.attachments (maintenance_record_id) where maintenance_record_id is not null;
create index attachments_uploaded_by_idx on public.attachments (uploaded_by);

-- Imutável; única exceção: uploaded_by vira null se a conta for excluída.
create or replace function public.protect_attachment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'uploaded_by') = (to_jsonb(old) - 'uploaded_by')
     and new.uploaded_by is null then
    return new;
  end if;
  raise exception 'Anexos fazem parte do histórico e não podem ser alterados ou excluídos.' using errcode = '42501';
end;
$$;

revoke execute on function public.protect_attachment() from public, anon, authenticated;

create trigger attachments_immutable
  before update or delete on public.attachments
  for each row execute function public.protect_attachment();

create trigger attachments_audit
  after insert on public.attachments
  for each row execute function public.audit_row_change('motorcycle_id', '');

alter table public.attachments enable row level security;
revoke all on public.attachments from anon, authenticated;
grant select on public.attachments to authenticated;

create policy attachments_select on public.attachments
  for select to authenticated
  using (public.is_current_owner(motorcycle_id));

-- -----------------------------------------------------------------------------
-- Storage: só o titular atual envia e lê arquivos da pasta da própria moto.
-- Nenhuma política de update/delete: arquivos não são substituídos nem apagados.
-- -----------------------------------------------------------------------------

create or replace function public.can_access_attachment_object(p_name text)
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
  return public.is_current_owner(v_folder::uuid);
end;
$$;

revoke execute on function public.can_access_attachment_object(text) from public, anon;
grant  execute on function public.can_access_attachment_object(text) to authenticated;

create policy attachments_objects_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments' and public.can_access_attachment_object(name));

create policy attachments_objects_select on storage.objects
  for select to authenticated
  using (bucket_id = 'attachments' and public.can_access_attachment_object(name));

-- -----------------------------------------------------------------------------
-- Cota de armazenamento (por conta, somando as motos sob titularidade atual)
-- -----------------------------------------------------------------------------

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
    ), 0),
    'quota_bytes', coalesce((select (value #>> '{}')::bigint from public.system_settings where key = 'free_plan_storage_quota_mb'), 100) * 1048576,
    'max_file_bytes', coalesce((select (value #>> '{}')::bigint from public.system_settings where key = 'attachment_max_file_mb'), 10) * 1048576
  );
$$;

revoke execute on function public.get_storage_usage() from public, anon;
grant  execute on function public.get_storage_usage() to authenticated;

-- -----------------------------------------------------------------------------
-- Registrar anexo após o envio do arquivo. Tamanho e tipo vêm do Storage,
-- não do navegador. Verifica dono do arquivo, pasta, registro e cota.
-- -----------------------------------------------------------------------------

create or replace function public.register_attachment(
  p_motorcycle_id         uuid,
  p_storage_path          text,
  p_file_name             text,
  p_kind                  public.attachment_kind,
  p_maintenance_record_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_size   bigint;
  v_mime   text;
  v_owner  text;
  v_usage  jsonb;
  v_id     uuid;
begin
  if not public.is_current_owner(p_motorcycle_id) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  if split_part(coalesce(p_storage_path, ''), '/', 1) <> p_motorcycle_id::text then
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

  v_usage := public.get_storage_usage();
  if v_size is null or v_size <= 0 or v_size > (v_usage ->> 'max_file_bytes')::bigint then
    raise exception 'Arquivo maior que o permitido.' using errcode = '22023';
  end if;
  if (v_usage ->> 'used_bytes')::bigint + v_size > (v_usage ->> 'quota_bytes')::bigint then
    raise exception 'O espaço para anexos do seu plano acabou.' using errcode = 'P0001';
  end if;

  if p_maintenance_record_id is not null and not exists (
       select 1 from public.maintenance_records
       where id = p_maintenance_record_id and motorcycle_id = p_motorcycle_id and not is_void) then
    raise exception 'Registro não encontrado nesta motocicleta.' using errcode = '22023';
  end if;

  insert into public.attachments
    (motorcycle_id, maintenance_record_id, storage_path, file_name, mime_type, file_size, kind, uploaded_by)
  values
    (p_motorcycle_id, p_maintenance_record_id, p_storage_path, left(trim(p_file_name), 200), v_mime, v_size, p_kind, v_uid)
  returning id into v_id;
  return v_id;

exception
  when unique_violation then
    raise exception 'Este arquivo já foi registrado.' using errcode = 'P0001';
end;
$$;

revoke execute on function public.register_attachment(uuid, text, text, public.attachment_kind, uuid) from public, anon;
grant  execute on function public.register_attachment(uuid, text, text, public.attachment_kind, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Linha do tempo com anexos e evidência (PRD 5.5: "com comprovante")
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
  -- Origem efetiva para exibição: oficina > comprovante > dono.
  case
    when r.source_type = 'workshop' then 'workshop'
    when r.source_type = 'document'
      or exists (select 1 from public.attachments a where a.maintenance_record_id = r.id) then 'document'
    else 'owner'
  end::public.record_source as evidence_level
from public.maintenance_records r;

revoke all on public.maintenance_timeline from anon, authenticated;
grant select on public.maintenance_timeline to authenticated;
