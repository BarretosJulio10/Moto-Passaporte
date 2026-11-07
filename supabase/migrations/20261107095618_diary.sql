-- =============================================================================
-- Moto Passaporte — Migração: diário da motocicleta (Fase 2, PRD 5.7, 11)
-- Objetivo: área pessoal separada dos registros técnicos (viagens, encontros,
--           acessórios, personalizações, fotos). O autor escolhe privado ou
--           compartilhável (ADR-013):
--           - privado: só o autor vê, para sempre (inclusive após vender a moto);
--           - compartilhável: acompanha a moto (titular atual vê; página pública na Fase 4).
--           Diferente do histórico técnico, o diário é editável pelo autor enquanto
--           for titular e excluível pelo autor a qualquer momento (com as fotos).
--           A auditoria guarda só metadados — nunca título, texto ou local.
-- Dependências: motorcycles, attachments.
-- Reversão: drop functions *_diary_*, diary_is_mine, can_view_diary, can_view_attachment,
--           can_upload_attachment_object; recriar register_attachment (5 parâmetros),
--           protect_attachment, get_storage_usage, can_access_attachment_object e as
--           políticas attachments_select / attachments_objects_* da migração anterior;
--           drop view motorcycle_diary_feed; alter table attachments drop column
--           diary_entry_id; drop table motorcycle_diary; drop types diary_*.
-- =============================================================================

create type public.diary_category as enum
  ('first_ride', 'trip', 'meetup', 'accessory', 'customization', 'photo', 'other');
create type public.diary_visibility as enum ('private', 'shareable');

create table public.motorcycle_diary (
  id            uuid primary key default gen_random_uuid(),
  motorcycle_id uuid not null references public.motorcycles (id) on delete restrict,
  author_id     uuid references auth.users (id) on delete set null,
  category      public.diary_category not null,
  title         text not null check (char_length(trim(title)) between 1 and 120),
  body          text check (body is null or char_length(body) <= 5000),
  entry_date    date not null check (entry_date >= date '1885-01-01'),
  location      text check (location is null or char_length(location) <= 120),
  visibility    public.diary_visibility not null default 'private',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.motorcycle_diary is
  'Diário pessoal (PRD 5.7). Privado = só o autor; compartilhável = titular atual e, na Fase 4, página pública. Não é histórico técnico.';

create index motorcycle_diary_moto_idx   on public.motorcycle_diary (motorcycle_id, entry_date desc, created_at desc);
create index motorcycle_diary_author_idx on public.motorcycle_diary (author_id);

-- Auditoria só com metadados (o conteúdo do diário privado não vai para o log).
create or replace function public.audit_diary_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.motorcycle_diary := coalesce(new, old);
  meta jsonb;
begin
  meta := jsonb_build_object('category', r.category, 'visibility', r.visibility, 'entry_date', r.entry_date);
  insert into public.audit_logs
    (actor_user_id, motorcycle_id, entity_type, entity_id, action, previous_data, new_data)
  values (
    auth.uid(), r.motorcycle_id, 'motorcycle_diary', r.id::text, lower(tg_op),
    case when tg_op <> 'INSERT' then jsonb_build_object('category', old.category, 'visibility', old.visibility, 'entry_date', old.entry_date) end,
    case when tg_op <> 'DELETE' then meta end
  );
  return r;
end;
$$;
revoke execute on function public.audit_diary_change() from public, anon, authenticated;

create trigger motorcycle_diary_audit
  after insert or update or delete on public.motorcycle_diary
  for each row execute function public.audit_diary_change();

-- Quem pode ver uma entrada.
create or replace function public.can_view_diary(p_author uuid, p_motorcycle uuid, p_visibility public.diary_visibility)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    p_author = auth.uid()
    or (p_visibility = 'shareable' and public.is_current_owner(p_motorcycle))
  );
$$;
revoke execute on function public.can_view_diary(uuid, uuid, public.diary_visibility) from public, anon;
grant  execute on function public.can_view_diary(uuid, uuid, public.diary_visibility) to authenticated;

alter table public.motorcycle_diary enable row level security;
revoke all on public.motorcycle_diary from anon, authenticated;
-- Sem author_id: o novo titular não recebe o identificador do dono anterior.
grant select (id, motorcycle_id, category, title, body, entry_date, location, visibility, created_at, updated_at)
  on public.motorcycle_diary to authenticated;

create policy motorcycle_diary_select on public.motorcycle_diary
  for select to authenticated
  using (public.can_view_diary(author_id, motorcycle_id, visibility));

create or replace function public.diary_is_mine(p_entry uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.motorcycle_diary where id = p_entry and author_id = auth.uid());
$$;
revoke execute on function public.diary_is_mine(uuid) from public, anon;
grant  execute on function public.diary_is_mine(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Fotos do diário: reaproveitam "attachments" com diary_entry_id.
-- -----------------------------------------------------------------------------

alter table public.attachments
  add column diary_entry_id uuid references public.motorcycle_diary (id) on delete restrict;
alter table public.attachments
  add constraint attachments_single_parent check (maintenance_record_id is null or diary_entry_id is null);
create index attachments_diary_idx on public.attachments (diary_entry_id) where diary_entry_id is not null;

-- Anexos de manutenção continuam imutáveis. Fotos do diário só podem ser
-- apagadas pelas funções do diário (marcação interna da transação).
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
  if tg_op = 'DELETE' and old.diary_entry_id is not null
     and current_setting('app.diary_photo_delete', true) = 'on' then
    return old;
  end if;
  raise exception 'Anexos fazem parte do histórico e não podem ser alterados ou excluídos.' using errcode = '42501';
end;
$$;

create trigger attachments_audit_delete
  after delete on public.attachments
  for each row execute function public.audit_row_change('motorcycle_id', '');

create or replace function public.can_view_attachment(p_motorcycle uuid, p_diary_entry uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_diary_entry is null then public.is_current_owner(p_motorcycle)
    else exists (
      select 1 from public.motorcycle_diary d
      where d.id = p_diary_entry and public.can_view_diary(d.author_id, d.motorcycle_id, d.visibility))
  end;
$$;
revoke execute on function public.can_view_attachment(uuid, uuid) from public, anon;
grant  execute on function public.can_view_attachment(uuid, uuid) to authenticated;

drop policy attachments_select on public.attachments;
create policy attachments_select on public.attachments
  for select to authenticated
  using (public.can_view_attachment(motorcycle_id, diary_entry_id));

-- Storage: envio só na pasta da moto do titular atual; leitura conforme o anexo
-- registrado (ou, antes do registro, só por quem enviou); exclusão só de arquivo
-- próprio sem registro (fotos de diário removidas e envios que falharam — KI-017).
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
  return public.is_current_owner(v_folder::uuid);
end;
$$;
revoke execute on function public.can_upload_attachment_object(text) from public, anon;
grant  execute on function public.can_upload_attachment_object(text) to authenticated;

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
  select motorcycle_id, diary_entry_id into a from public.attachments where storage_path = p_name;
  if found then
    return public.can_view_attachment(a.motorcycle_id, a.diary_entry_id);
  end if;
  -- Sem registro: só quem enviou o arquivo.
  return exists (
    select 1 from storage.objects o
    where o.bucket_id = 'attachments' and o.name = p_name
      and coalesce(o.owner_id, o.owner::text) = auth.uid()::text);
end;
$$;

create or replace function public.can_delete_attachment_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and not exists (select 1 from public.attachments where storage_path = p_name)
     and exists (
       select 1 from storage.objects o
       where o.bucket_id = 'attachments' and o.name = p_name
         and coalesce(o.owner_id, o.owner::text) = auth.uid()::text);
$$;
revoke execute on function public.can_delete_attachment_object(text) from public, anon;
grant  execute on function public.can_delete_attachment_object(text) to authenticated;

drop policy attachments_objects_insert on storage.objects;
create policy attachments_objects_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments' and public.can_upload_attachment_object(name));

create policy attachments_objects_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'attachments' and public.can_delete_attachment_object(name));

-- Cota: anexos das motos sob titularidade atual, sem contar fotos de diário de
-- outros autores (o titular não as vê).
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
      where a.diary_entry_id is null
         or exists (select 1 from public.motorcycle_diary d where d.id = a.diary_entry_id and d.author_id = auth.uid())
    ), 0),
    'quota_bytes', coalesce((select (value #>> '{}')::bigint from public.system_settings where key = 'free_plan_storage_quota_mb'), 100) * 1048576,
    'max_file_bytes', coalesce((select (value #>> '{}')::bigint from public.system_settings where key = 'attachment_max_file_mb'), 10) * 1048576
  );
$$;

-- register_attachment ganha p_diary_entry_id (fotos do diário: só imagens, até 10).
drop function public.register_attachment(uuid, text, text, public.attachment_kind, uuid);

create function public.register_attachment(
  p_motorcycle_id         uuid,
  p_storage_path          text,
  p_file_name             text,
  p_kind                  public.attachment_kind,
  p_maintenance_record_id uuid default null,
  p_diary_entry_id        uuid default null
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
  if p_maintenance_record_id is not null and p_diary_entry_id is not null then
    raise exception 'O arquivo deve pertencer a um registro ou a uma entrada do diário.' using errcode = '22023';
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

  if p_diary_entry_id is not null then
    if not exists (
         select 1 from public.motorcycle_diary
         where id = p_diary_entry_id and motorcycle_id = p_motorcycle_id and author_id = v_uid) then
      raise exception 'Entrada do diário não encontrada.' using errcode = '22023';
    end if;
    if v_mime = 'application/pdf' then
      raise exception 'No diário, envie apenas fotos.' using errcode = '22023';
    end if;
    if (select count(*) from public.attachments where diary_entry_id = p_diary_entry_id) >= 10 then
      raise exception 'Limite de 10 fotos por entrada do diário.' using errcode = 'P0001';
    end if;
  end if;

  insert into public.attachments
    (motorcycle_id, maintenance_record_id, diary_entry_id, storage_path, file_name, mime_type, file_size, kind, uploaded_by)
  values
    (p_motorcycle_id, p_maintenance_record_id, p_diary_entry_id, p_storage_path, left(trim(p_file_name), 200),
     v_mime, v_size, case when p_diary_entry_id is not null then 'photo'::public.attachment_kind else p_kind end, v_uid)
  returning id into v_id;
  return v_id;

exception
  when unique_violation then
    raise exception 'Este arquivo já foi registrado.' using errcode = 'P0001';
end;
$$;

revoke execute on function public.register_attachment(uuid, text, text, public.attachment_kind, uuid, uuid) from public, anon;
grant  execute on function public.register_attachment(uuid, text, text, public.attachment_kind, uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Operações do diário
-- -----------------------------------------------------------------------------

create or replace function public.diary_validate(
  p_title text, p_body text, p_entry_date date, p_location text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_title is null or char_length(trim(p_title)) not between 1 and 120 then
    raise exception 'Informe um título de até 120 caracteres.' using errcode = '22023';
  end if;
  if p_body is not null and char_length(p_body) > 5000 then
    raise exception 'O texto pode ter até 5.000 caracteres.' using errcode = '22023';
  end if;
  if p_entry_date is null or p_entry_date < date '1885-01-01' then
    raise exception 'Data inválida.' using errcode = '22023';
  end if;
  if p_location is not null and char_length(trim(p_location)) > 120 then
    raise exception 'O local pode ter até 120 caracteres.' using errcode = '22023';
  end if;
end;
$$;
revoke execute on function public.diary_validate(text, text, date, text) from public, anon, authenticated;

create or replace function public.create_diary_entry(
  p_motorcycle_id uuid,
  p_category      public.diary_category,
  p_title         text,
  p_entry_date    date,
  p_body          text default null,
  p_location      text default null,
  p_visibility    public.diary_visibility default 'private'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_current_owner(p_motorcycle_id) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  perform public.diary_validate(p_title, p_body, p_entry_date, p_location);
  if p_entry_date > current_date + 1 then
    raise exception 'A data não pode estar no futuro.' using errcode = '22023';
  end if;
  if (select count(*) from public.motorcycle_diary where motorcycle_id = p_motorcycle_id) >= 2000 then
    raise exception 'Limite de entradas do diário atingido.' using errcode = 'P0001';
  end if;

  insert into public.motorcycle_diary
    (motorcycle_id, author_id, category, title, body, entry_date, location, visibility)
  values
    (p_motorcycle_id, auth.uid(), p_category, trim(p_title), nullif(trim(p_body), ''), p_entry_date,
     nullif(trim(p_location), ''), coalesce(p_visibility, 'private'))
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.create_diary_entry(uuid, public.diary_category, text, date, text, text, public.diary_visibility) from public, anon;
grant  execute on function public.create_diary_entry(uuid, public.diary_category, text, date, text, text, public.diary_visibility) to authenticated;

create or replace function public.update_diary_entry(
  p_entry_id   uuid,
  p_category   public.diary_category,
  p_title      text,
  p_entry_date date,
  p_body       text default null,
  p_location   text default null,
  p_visibility public.diary_visibility default 'private'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.motorcycle_diary;
begin
  select * into d from public.motorcycle_diary where id = p_entry_id for update;
  if not found or d.author_id is distinct from auth.uid() or not public.is_current_owner(d.motorcycle_id) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  perform public.diary_validate(p_title, p_body, p_entry_date, p_location);
  if p_entry_date > current_date + 1 then
    raise exception 'A data não pode estar no futuro.' using errcode = '22023';
  end if;

  update public.motorcycle_diary
     set category = p_category, title = trim(p_title), body = nullif(trim(p_body), ''),
         entry_date = p_entry_date, location = nullif(trim(p_location), ''),
         visibility = coalesce(p_visibility, 'private'), updated_at = now()
   where id = p_entry_id;
end;
$$;
revoke execute on function public.update_diary_entry(uuid, public.diary_category, text, date, text, text, public.diary_visibility) from public, anon;
grant  execute on function public.update_diary_entry(uuid, public.diary_category, text, date, text, text, public.diary_visibility) to authenticated;

-- Remove uma foto do diário. Retorna o caminho para o app apagar o arquivo.
create or replace function public.delete_diary_photo(p_attachment_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
begin
  select a.storage_path into v_path
    from public.attachments a
    join public.motorcycle_diary d on d.id = a.diary_entry_id
   where a.id = p_attachment_id and d.author_id = auth.uid();
  if v_path is null then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  perform set_config('app.diary_photo_delete', 'on', true);
  delete from public.attachments where id = p_attachment_id;
  perform set_config('app.diary_photo_delete', 'off', true);
  return v_path;
end;
$$;
revoke execute on function public.delete_diary_photo(uuid) from public, anon;
grant  execute on function public.delete_diary_photo(uuid) to authenticated;

-- Exclui a entrada (o autor pode, mesmo depois de vender a moto) e devolve os
-- caminhos das fotos para o app apagar os arquivos.
create or replace function public.delete_diary_entry(p_entry_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paths text[];
begin
  if not exists (select 1 from public.motorcycle_diary where id = p_entry_id and author_id = auth.uid()) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  select coalesce(array_agg(storage_path), '{}') into v_paths
    from public.attachments where diary_entry_id = p_entry_id;
  perform set_config('app.diary_photo_delete', 'on', true);
  delete from public.attachments where diary_entry_id = p_entry_id;
  perform set_config('app.diary_photo_delete', 'off', true);
  delete from public.motorcycle_diary where id = p_entry_id;
  return v_paths;
end;
$$;
revoke execute on function public.delete_diary_entry(uuid) from public, anon;
grant  execute on function public.delete_diary_entry(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Leitura: entradas visíveis com fotos e indicação "minha" (sem expor o autor).
-- -----------------------------------------------------------------------------

create view public.motorcycle_diary_feed
with (security_invoker = true)
as
select
  d.id,
  d.motorcycle_id,
  d.category,
  d.title,
  d.body,
  d.entry_date,
  d.location,
  d.visibility,
  d.created_at,
  d.updated_at,
  public.diary_is_mine(d.id) as is_mine,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'storage_path', a.storage_path, 'file_name', a.file_name,
      'mime_type', a.mime_type, 'file_size', a.file_size, 'kind', a.kind, 'created_at', a.created_at
    ) order by a.created_at)
    from public.attachments a
    where a.diary_entry_id = d.id
  ), '[]'::jsonb) as photos
from public.motorcycle_diary d;

revoke all on public.motorcycle_diary_feed from anon, authenticated;
grant select on public.motorcycle_diary_feed to authenticated;
